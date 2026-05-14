import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireGuildAdminApi } from "@/lib/rbac";
import { db } from "@/db";
import { guilds } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const guard = requireGuildAdminApi(session, id);
  if (!guard.ok) return guard.response;
  const membership = guard.value;

  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();
  if ("description" in body) {
    updates.description = body.description ? String(body.description).trim() : null;
  }
  if (typeof body.isPublic === "boolean") updates.isPublic = body.isPublic;
  const channelFields = [
    { key: "discordChannelId", label: "Discord channel ID" },
    { key: "squad1VoiceChannelId", label: "Squad 1 voice channel ID" },
    { key: "squad2VoiceChannelId", label: "Squad 2 voice channel ID" },
  ] as const;
  for (const f of channelFields) {
    if (!(f.key in body)) continue;
    const raw = (body as Record<string, unknown>)[f.key];
    if (raw === null || raw === "") {
      updates[f.key] = null;
    } else if (typeof raw === "string" && /^\d{17,20}$/.test(raw.trim())) {
      updates[f.key] = raw.trim();
    } else {
      return NextResponse.json(
        { error: `Invalid ${f.label} (expected a 17-20 digit number)` },
        { status: 400 }
      );
    }
  }
  if ("serverNumber" in body) {
    const raw = body.serverNumber;
    if (raw === null || raw === "") {
      updates.serverNumber = null;
    } else {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isInteger(n) || n < 1001 || n > 9999) {
        return NextResponse.json(
          { error: "Server # must be an integer between 1001 and 9999." },
          { status: 400 }
        );
      }
      updates.serverNumber = n;
    }
  }
  if ("tag" in body) {
    const raw = body.tag;
    if (raw === null || raw === "") {
      updates.tag = null;
    } else if (typeof raw === "string" && /^.{2,4}$/u.test(raw.trim())) {
      updates.tag = raw.trim();
    } else {
      return NextResponse.json(
        { error: "Guild Tag must be 2-4 characters." },
        { status: 400 }
      );
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const existing = await db.query.guilds.findFirst({ where: eq(guilds.id, id) });

  await db.update(guilds).set(updates).where(eq(guilds.id, id));

  const before: Record<string, unknown> = {};
  if (existing) {
    for (const k of Object.keys(updates)) {
      before[k] = (existing as Record<string, unknown>)[k];
    }
  }
  void logAudit({
    guildId: id,
    actorUserId: membership.userId,
    actorDisplay: await resolveActorDisplay(membership.userId),
    action: "guild.update",
    entityType: "guild",
    entityId: id,
    entityLabel: existing?.name ?? id,
    changes: { before, after: updates },
  });

  return NextResponse.json({ success: true });
}
