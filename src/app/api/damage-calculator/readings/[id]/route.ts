import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireSuperAdminApi } from "@/lib/rbac";
import { db } from "@/db";
import { damageReadings } from "@/db/schema";
import { eq } from "drizzle-orm";

// Inline correction for a single misread OCR value — one of the three stat
// numbers on an existing reading row.
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

  const update: Partial<typeof damageReadings.$inferInsert> = {};
  for (const field of ["damageDealt", "healingDone", "damageReceived"] as const) {
    if (typeof body[field] === "number" && Number.isFinite(body[field]) && body[field] >= 0) {
      update[field] = Math.round(body[field]);
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const existing = await db.query.damageReadings.findFirst({ where: eq(damageReadings.id, id) });
  if (!existing) {
    return NextResponse.json({ error: "Reading not found" }, { status: 404 });
  }

  await db.update(damageReadings).set(update).where(eq(damageReadings.id, id));
  return NextResponse.json({ reading: { ...existing, ...update } });
}
