import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { getBotStatus } from "@/bot/discord-bot";

// GET /api/health
//
// Returns a JSON snapshot of bot + DB state. Useful for external probes
// ("is the bot still up at 3am?") and for diagnosing 'bot looks alive but
// reminders stopped firing' without scrolling fly logs.
//
// If HEALTH_TOKEN is set in the environment, callers must supply it via
// `?token=…` or `Authorization: Bearer …`. Leaving HEALTH_TOKEN unset makes
// the endpoint public — fine for an alpha, lock down later by setting the
// secret.
export async function GET(req: Request) {
  const requiredToken = process.env.HEALTH_TOKEN;
  if (requiredToken) {
    const url = new URL(req.url);
    const provided =
      url.searchParams.get("token") ??
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
      "";
    if (provided !== requiredToken) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  let dbOk = false;
  let dbError: string | null = null;
  try {
    db.run(sql`SELECT 1`);
    dbOk = true;
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  const bot = getBotStatus();

  return NextResponse.json(
    {
      now: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      pid: process.pid,
      node: process.version,
      db: { ok: dbOk, error: dbError },
      bot,
    },
    {
      // Don't let CDNs cache the snapshot.
      headers: { "Cache-Control": "no-store" },
    }
  );
}
