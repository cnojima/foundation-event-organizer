import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireSuperAdminApi } from "@/lib/rbac";
import { triggerPoll } from "@/bot/discord-bot";

// POST /api/admin/bot/poll-now
//
// Super-admin-only. Manually fires the bot's notification poll cycle so you
// can verify the path end-to-end without waiting up to 5 minutes for the
// next interval tick. Returns the same metrics the bot logs (`pending`,
// `sent`, `failed`, `durationMs`).
export async function POST() {
  const session = await auth();
  const guard = requireSuperAdminApi(session);
  if (!guard.ok) return guard.response;

  const result = await triggerPoll();
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 503 });
  }
  return NextResponse.json({ success: true, metrics: result.metrics });
}
