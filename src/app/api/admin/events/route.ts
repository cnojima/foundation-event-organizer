import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireGuildAdminApi, resolveAdminGuildId } from "@/lib/rbac";
import { db } from "@/db";
import { events, eventTemplates } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { generateId } from "@/lib/ids";
import { sendEventNotification } from "@/bot/discord-bot";
import { appBaseUrlFromRequest } from "@/lib/url";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

export async function POST(req: Request) {
  const session = await auth();
  const guard = requireGuildAdminApi(session);
  if (!guard.ok) return guard.response;
  const membership = guard.value;

  const body = await req.json();

  // Super-admins may target a different guild via body.guildId; regular guild
  // admins are pinned to their own guild.
  const targetGuildId = await resolveAdminGuildId(membership, body.guildId);
  if (!targetGuildId) {
    return NextResponse.json({ error: "Guild not found" }, { status: 404 });
  }

  const kind: "match" | "simple" = body.kind === "simple" ? "simple" : "match";

  // Applying a recurring template to create its first occurrence: link the
  // event back to the template and flip the series live so the bot's poll
  // loop starts generating subsequent occurrences. Ignored (no error) if
  // the template isn't found/recurring/in-guild — the event still gets
  // created as a normal one-off.
  let seriesTemplate: typeof eventTemplates.$inferSelect | null = null;
  if (typeof body.seriesTemplateId === "string" && body.seriesTemplateId) {
    const template = await db.query.eventTemplates.findFirst({
      where: and(
        eq(eventTemplates.id, body.seriesTemplateId),
        eq(eventTemplates.guildId, targetGuildId),
        isNull(eventTemplates.deletedAt)
      ),
    });
    if (template?.isRecurring) seriesTemplate = template;
  }

  const toIso = (v: unknown): string | null => {
    if (typeof v !== "string" || v === "") return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  };

  const event = {
    id: generateId(),
    guildId: targetGuildId,
    name: body.name,
    description: body.description || null,
    // Simple events use gameTime; match events use squad1/squad2 startsAt.
    gameTime: kind === "simple" ? toIso(body.gameTime) : null,
    durationMinutes:
      body.durationMinutes != null ? Math.round(Number(body.durationMinutes)) || null : null,
    squad1StartsAt: kind === "match" ? toIso(body.squad1StartsAt) : null,
    squad2StartsAt: kind === "match" ? toIso(body.squad2StartsAt) : null,
    signupOpens: toIso(body.signupOpens),
    signupCloses: toIso(body.signupCloses),
    kind,
    squad1Name: body.squad1Name || "Squad 1",
    squad2Name: body.squad2Name || "Squad 2",
    maxPlayers: body.maxPlayers || 20,
    maxBackups: body.maxBackups || 10,
    leadershipSlots: body.leadershipSlots || 3,
    metadata: body.metadata ? JSON.stringify(body.metadata) : null,
    createdAt: new Date().toISOString(),
    seriesTemplateId: seriesTemplate?.id ?? null,
  };

  await db.insert(events).values(event);

  if (seriesTemplate) {
    await db
      .update(eventTemplates)
      .set({
        seriesActive: true,
        recurrenceLastGeneratedStartAt: event.squad1StartsAt ?? event.gameTime,
        recurrenceOccurrencesGenerated: 1,
      })
      .where(eq(eventTemplates.id, seriesTemplate.id));
  }

  void logAudit({
    guildId: event.guildId,
    actorUserId: membership.userId,
    actorDisplay: await resolveActorDisplay(membership.userId),
    action: "event.create",
    entityType: "event",
    entityId: event.id,
    entityLabel: event.name,
    changes: { after: { kind: event.kind, name: event.name } },
  });

  await sendEventNotification({
    guildId: targetGuildId,
    eventId: event.id,
    eventName: event.name,
    eventKind: event.kind,
    action: "created",
    eventUrl: `${appBaseUrlFromRequest(req)}/event/${event.id}`,
    gameTime: event.gameTime,
    squad1Name: event.squad1Name,
    squad2Name: event.squad2Name,
    squad1StartsAt: event.squad1StartsAt,
    squad2StartsAt: event.squad2StartsAt,
  });

  return NextResponse.json(event, { status: 201 });
}
