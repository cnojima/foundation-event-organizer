import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireSuperAdminApi } from "@/lib/rbac";
import { db } from "@/db";
import { globalEvents, events, guilds } from "@/db/schema";
import { eq, isNull, sql, and } from "drizzle-orm";
import { generateId } from "@/lib/ids";
import { sendEventNotification } from "@/bot/discord-bot";
import { appBaseUrlFromRequest } from "@/lib/url";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

export async function GET() {
  const session = await auth();
  const guard = requireSuperAdminApi(session);
  if (!guard.ok) return guard.response;

  const rows = await db
    .select({
      id: globalEvents.id,
      name: globalEvents.name,
      kind: globalEvents.kind,
      serverNumber: globalEvents.serverNumber,
      gameTime: globalEvents.gameTime,
      squad1StartsAt: globalEvents.squad1StartsAt,
      squad2StartsAt: globalEvents.squad2StartsAt,
      createdAt: globalEvents.createdAt,
      deletedAt: globalEvents.deletedAt,
      guildCopyCount: sql<number>`(
        select count(*) from events
        where events.global_event_id = ${globalEvents.id}
          and events.deleted_at is null
      )`,
    })
    .from(globalEvents)
    .orderBy(globalEvents.createdAt);

  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await auth();
  const guard = requireSuperAdminApi(session);
  if (!guard.ok) return guard.response;
  const membership = guard.value;

  const body = await req.json();

  const serverNumber = Number(body.serverNumber);
  if (!serverNumber || serverNumber < 1) {
    return NextResponse.json({ error: "serverNumber is required" }, { status: 400 });
  }
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const kind: "match" | "simple" = body.kind === "simple" ? "simple" : "match";

  const toIso = (v: unknown): string | null => {
    if (typeof v !== "string" || v === "") return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  };

  const globalEvent = {
    id: crypto.randomUUID(),
    name: body.name.trim(),
    description: body.description?.trim() || null,
    kind,
    serverNumber,
    gameTime: kind === "simple" ? toIso(body.gameTime) : null,
    durationMinutes:
      body.durationMinutes != null ? Math.round(Number(body.durationMinutes)) || null : null,
    squad1StartsAt: kind === "match" ? toIso(body.squad1StartsAt) : null,
    squad2StartsAt: kind === "match" ? toIso(body.squad2StartsAt) : null,
    signupOpens: toIso(body.signupOpens),
    signupCloses: toIso(body.signupCloses),
    squad1Name: body.squad1Name?.trim() || "Squad 1",
    squad2Name: body.squad2Name?.trim() || "Squad 2",
    maxPlayers: Number(body.maxPlayers) || 20,
    maxBackups: Number.isFinite(Number(body.maxBackups)) ? Number(body.maxBackups) : 10,
    leadershipSlots: Number.isFinite(Number(body.leadershipSlots)) ? Number(body.leadershipSlots) : 3,
    createdByUserId: membership.userId,
    createdAt: new Date().toISOString(),
  };

  await db.insert(globalEvents).values(globalEvent);

  // Provision one events row per guild in the target server.
  const targetGuilds = await db
    .select({ id: guilds.id })
    .from(guilds)
    .where(and(eq(guilds.serverNumber, serverNumber), isNull(guilds.deletedAt)));

  const baseUrl = appBaseUrlFromRequest(req);
  let guildCopyCount = 0;

  for (const guild of targetGuilds) {
    const eventId = generateId();
    await db.insert(events).values({
      id: eventId,
      guildId: guild.id,
      globalEventId: globalEvent.id,
      name: globalEvent.name,
      description: globalEvent.description,
      kind: globalEvent.kind,
      gameTime: globalEvent.gameTime,
      durationMinutes: globalEvent.durationMinutes,
      squad1StartsAt: globalEvent.squad1StartsAt,
      squad2StartsAt: globalEvent.squad2StartsAt,
      signupOpens: globalEvent.signupOpens,
      signupCloses: globalEvent.signupCloses,
      squad1Name: globalEvent.squad1Name,
      squad2Name: globalEvent.squad2Name,
      maxPlayers: globalEvent.maxPlayers,
      maxBackups: globalEvent.maxBackups,
      leadershipSlots: globalEvent.leadershipSlots,
      createdAt: globalEvent.createdAt,
    });

    guildCopyCount++;

    void sendEventNotification({
      guildId: guild.id,
      eventId,
      eventName: globalEvent.name,
      action: "created",
      eventUrl: `${baseUrl}/event/${eventId}`,
      gameTime: globalEvent.gameTime,
      squad1Name: globalEvent.squad1Name,
      squad2Name: globalEvent.squad2Name,
      squad1StartsAt: globalEvent.squad1StartsAt,
      squad2StartsAt: globalEvent.squad2StartsAt,
    });
  }

  void logAudit({
    guildId: null,
    actorUserId: membership.userId,
    actorDisplay: await resolveActorDisplay(membership.userId),
    action: "global_event.create",
    entityType: "global_event",
    entityId: globalEvent.id,
    entityLabel: globalEvent.name,
    changes: {
      after: { kind: globalEvent.kind, serverNumber, guildCopyCount },
    },
  });

  return NextResponse.json({ globalEvent, guildCopyCount }, { status: 201 });
}
