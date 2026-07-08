import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireSuperAdminApi } from "@/lib/rbac";
import { db } from "@/db";
import { damageSessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionDetail } from "@/lib/damage-calculator/get-session-detail";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const guard = requireSuperAdminApi(session);
  if (!guard.ok) return guard.response;

  const detail = await getSessionDetail(id);
  if (!detail) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json(detail);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const guard = requireSuperAdminApi(session);
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const update: Partial<typeof damageSessions.$inferInsert> = {};
  if (typeof body.label === "string" && body.label.trim()) {
    update.label = body.label.trim();
  }
  if (typeof body.eventName === "string" && body.eventName.trim()) {
    update.eventName = body.eventName.trim();
  }
  if (body.totalTimeSeconds === null) {
    update.totalTimeSeconds = null;
  } else if (typeof body.totalTimeSeconds === "number" && body.totalTimeSeconds >= 0) {
    update.totalTimeSeconds = body.totalTimeSeconds;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const existing = await db.query.damageSessions.findFirst({ where: eq(damageSessions.id, id) });
  if (!existing) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  await db.update(damageSessions).set(update).where(eq(damageSessions.id, id));
  return NextResponse.json({ session: { ...existing, ...update } });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const guard = requireSuperAdminApi(session);
  if (!guard.ok) return guard.response;

  await db.delete(damageSessions).where(eq(damageSessions.id, id));
  return NextResponse.json({ success: true });
}
