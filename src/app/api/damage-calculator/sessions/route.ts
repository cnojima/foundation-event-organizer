import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireSuperAdminApi } from "@/lib/rbac";
import { db } from "@/db";
import { damageSessions, damageReadings } from "@/db/schema";
import { desc, sql } from "drizzle-orm";
import { generateId } from "@/lib/ids";

export async function GET() {
  const session = await auth();
  const guard = requireSuperAdminApi(session);
  if (!guard.ok) return guard.response;

  const rows = await db
    .select({
      id: damageSessions.id,
      label: damageSessions.label,
      eventName: damageSessions.eventName,
      totalTimeSeconds: damageSessions.totalTimeSeconds,
      createdAt: damageSessions.createdAt,
      fleetCount: sql<number>`(select count(distinct ${damageReadings.fleetId}) from ${damageReadings} where ${damageReadings.sessionId} = ${damageSessions.id})`,
      readingCount: sql<number>`(select count(*) from ${damageReadings} where ${damageReadings.sessionId} = ${damageSessions.id})`,
    })
    .from(damageSessions)
    .orderBy(desc(damageSessions.createdAt));

  return NextResponse.json({ sessions: rows });
}

export async function POST(req: Request) {
  const session = await auth();
  const guard = requireSuperAdminApi(session);
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  const eventName =
    typeof body?.eventName === "string" && body.eventName.trim()
      ? body.eventName.trim()
      : "Calamity Befalls";

  if (!label) {
    return NextResponse.json({ error: "Label is required" }, { status: 400 });
  }

  const row = {
    id: generateId(),
    label,
    eventName,
    totalTimeSeconds: null,
    createdByUserId: guard.value.userId,
    createdAt: new Date().toISOString(),
  };
  await db.insert(damageSessions).values(row);

  return NextResponse.json({ session: row }, { status: 201 });
}
