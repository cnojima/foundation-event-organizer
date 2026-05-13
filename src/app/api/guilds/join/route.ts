import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireSignedInApi, isInviteUsable } from "@/lib/rbac";
import { db } from "@/db";
import { guildInvites, guilds, users } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { sendGuildJoinAnnouncement } from "@/bot/discord-bot";
import { appBaseUrlFromRequest } from "@/lib/url";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

export async function POST(req: Request) {
  const session = await auth();
  const guard = requireSignedInApi(session);
  if (!guard.ok) return guard.response;
  const membership = guard.value;

  if (membership.guildId) {
    return NextResponse.json(
      { error: "You're already in a guild. Leave it first." },
      { status: 409 }
    );
  }

  const body = await req.json();
  const code: string | null = body.code ? String(body.code) : null;
  const guildId: string | null = body.guildId ? String(body.guildId) : null;

  if (!code && !guildId) {
    return NextResponse.json(
      { error: "Provide an invite code or guildId" },
      { status: 400 }
    );
  }

  const result = db.transaction((tx) => {
    let resolvedGuildId: string;

    if (code) {
      const invite = tx
        .select()
        .from(guildInvites)
        .where(eq(guildInvites.code, code))
        .get();
      if (!invite || !isInviteUsable(invite)) {
        return { error: "Invite is invalid or expired", status: 404 as const };
      }
      const guild = tx
        .select()
        .from(guilds)
        .where(and(eq(guilds.id, invite.guildId), isNull(guilds.deletedAt)))
        .get();
      if (!guild) {
        return { error: "Guild not found", status: 404 as const };
      }
      tx.update(guildInvites)
        .set({ usesCount: invite.usesCount + 1 })
        .where(eq(guildInvites.id, invite.id))
        .run();
      resolvedGuildId = guild.id;
    } else {
      const guild = tx
        .select()
        .from(guilds)
        .where(and(eq(guilds.id, guildId!), isNull(guilds.deletedAt)))
        .get();
      if (!guild) {
        return { error: "Guild not found", status: 404 as const };
      }
      if (!guild.isPublic) {
        return {
          error: "This guild requires an invite to join",
          status: 403 as const,
        };
      }
      resolvedGuildId = guild.id;
    }

    tx.update(users)
      .set({ guildId: resolvedGuildId, guildRole: "member" })
      .where(eq(users.id, membership.userId))
      .run();

    return { ok: true as const, guildId: resolvedGuildId };
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Fire-and-await the Discord announcement. Failures inside the helper
  // log but never throw, so a misconfigured guild channel won't break the
  // join response.
  await sendGuildJoinAnnouncement({
    guildId: result.guildId,
    joinedUserId: membership.userId,
    appBaseUrl: appBaseUrlFromRequest(req),
  });

  void logAudit({
    guildId: result.guildId,
    actorUserId: membership.userId,
    actorDisplay: await resolveActorDisplay(membership.userId),
    action: "member.join",
    entityType: "member",
    entityId: membership.userId,
    entityLabel: await resolveActorDisplay(membership.userId),
    changes: { after: { via: code ? "invite" : "discovery" } },
  });

  return NextResponse.json({ success: true, guildId: result.guildId });
}
