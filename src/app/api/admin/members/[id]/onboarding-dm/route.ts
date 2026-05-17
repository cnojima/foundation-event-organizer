import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireGuildAdminApi } from "@/lib/rbac";
import { db } from "@/db";
import { guilds, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sendOnboardingDm } from "@/bot/discord-bot";
import { appBaseUrlFromRequest } from "@/lib/url";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

// Send the bot's onboarding DM to a pre-claim member that has a Discord
// user ID set. Used in two places:
//   - Bulk auto-DM during screenshot import (the modal POSTs to this
//     endpoint per row after creating the stub).
//   - Per-row "Resend onboarding DM" button on /admin/members.
//
// Refuses to DM members who have already claimed their account (no
// stubCreatedAt) — at that point the user is fully onboarded and the
// onboarding message would just be confusing.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();

  const target = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!target) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }
  if (!target.guildId) {
    return NextResponse.json(
      { error: "Member isn't in a guild." },
      { status: 400 }
    );
  }

  const guard = requireGuildAdminApi(session, target.guildId);
  if (!guard.ok) return guard.response;

  if (!target.discordUserId) {
    return NextResponse.json(
      {
        error:
          "No Discord ID on this member — can't DM. Add one in the member's profile first.",
      },
      { status: 400 }
    );
  }
  if (!target.stubCreatedAt) {
    return NextResponse.json(
      {
        error:
          "Member has already claimed their account — onboarding DM is unnecessary.",
      },
      { status: 409 }
    );
  }

  const guild = await db.query.guilds.findFirst({
    where: eq(guilds.id, target.guildId),
    columns: { name: true },
  });

  const signInUrl = `${appBaseUrlFromRequest(req)}/signin`;
  const sent = await sendOnboardingDm({
    discordUserId: target.discordUserId,
    guildName: guild?.name ?? "your guild",
    signInUrl,
  });

  if (!sent) {
    return NextResponse.json(
      {
        error:
          "Discord rejected the DM. The user may have DMs from server members disabled, or the bot may not share a server with them.",
      },
      { status: 502 }
    );
  }

  void logAudit({
    guildId: target.guildId,
    actorUserId: guard.value.userId,
    actorDisplay: await resolveActorDisplay(guard.value.userId),
    action: "member.stub_create",
    entityType: "member",
    entityId: target.id,
    entityLabel: target.inGameName ?? target.name ?? target.email ?? target.id,
    changes: {
      after: { onboardingDmSent: true, discordUserId: target.discordUserId },
    },
  });

  return NextResponse.json({ success: true });
}
