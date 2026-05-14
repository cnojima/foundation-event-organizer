import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireGuildAdminApi } from "@/lib/rbac";
import { sendVoiceTestDm } from "@/bot/discord-bot";

// POST /api/guilds/[id]/discord/voice-test
// Body: { channelId: string, squadLabel: string }
// DMs the caller a clickable join link for the supplied voice channel so
// they can verify the ID is correct + that they themselves will receive the
// real voice_dm reminders. Per-channel call (one button per squad in the UI).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const guard = requireGuildAdminApi(session, id);
  if (!guard.ok) return guard.response;
  const membership = guard.value;

  const body = (await req.json().catch(() => ({}))) as {
    channelId?: unknown;
    squadLabel?: unknown;
  };
  const channelId =
    typeof body.channelId === "string" ? body.channelId.trim() : "";
  const squadLabel =
    typeof body.squadLabel === "string" && body.squadLabel.trim()
      ? body.squadLabel.trim()
      : "Squad";

  if (!channelId) {
    return NextResponse.json(
      { error: "Enter a voice channel ID first." },
      { status: 400 }
    );
  }
  if (!/^\d{17,20}$/.test(channelId)) {
    return NextResponse.json(
      { error: "Invalid Discord channel ID (expected a 17-20 digit number)." },
      { status: 400 }
    );
  }

  const result = await sendVoiceTestDm({
    adminUserId: membership.userId,
    channelId,
    squadLabel,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 502 });
  }
  return NextResponse.json({ success: true });
}
