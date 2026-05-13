import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireGuildAdminApi } from "@/lib/rbac";
import { db } from "@/db";
import { guilds } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sendTestMessage } from "@/bot/discord-bot";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const guard = requireGuildAdminApi(session, id);
  if (!guard.ok) return guard.response;
  const membership = guard.value;

  const guild = await db.query.guilds.findFirst({ where: eq(guilds.id, id) });
  if (!guild) {
    return NextResponse.json({ error: "Guild not found" }, { status: 404 });
  }

  // Use the channel ID in the request body if provided (so admins can test
  // before saving), else fall back to the saved one.
  const body = await req.json().catch(() => ({}));
  const candidate =
    typeof body.discordChannelId === "string" && body.discordChannelId.trim()
      ? body.discordChannelId.trim()
      : guild.discordChannelId;

  if (!candidate) {
    return NextResponse.json(
      { error: "No Discord channel ID provided." },
      { status: 400 }
    );
  }
  if (!/^\d{17,20}$/.test(candidate)) {
    return NextResponse.json(
      { error: "Invalid Discord channel ID (expected a 17-20 digit number)." },
      { status: 400 }
    );
  }

  const result = await sendTestMessage(candidate, guild.name, guild.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 502 });
  }

  void logAudit({
    guildId: id,
    actorUserId: membership.userId,
    actorDisplay: await resolveActorDisplay(membership.userId),
    action: "guild.discord.test",
    entityType: "guild",
    entityId: id,
    entityLabel: guild.name,
    changes: { after: { link: result.link } },
  });

  // Surface the auto-link half. The message POST succeeded (otherwise we'd
  // have early-returned above) — but if the channel-info fetch or the DB
  // update failed, slash commands will stay broken even though reminders
  // work. Admins need that signal.
  return NextResponse.json({ success: true, link: result.link });
}
