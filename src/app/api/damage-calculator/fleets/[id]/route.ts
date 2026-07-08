import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireSuperAdminApi } from "@/lib/rbac";
import { db } from "@/db";
import { damageFleets } from "@/db/schema";
import { eq } from "drizzle-orm";

const ELEMENT_TYPES = ["beam", "kinetic", "ion"] as const;

// Correct the fleet's name or its element type — OCR only offers a guess for
// the latter (the in-game style icon is subtle), so this is how the admin
// locks in the right value once and it persists for future sessions.
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

  const update: Partial<typeof damageFleets.$inferInsert> = {};
  if (typeof body.name === "string" && body.name.trim()) {
    update.name = body.name.trim();
  }
  if (body.elementType === null) {
    update.elementType = null;
  } else if (
    typeof body.elementType === "string" &&
    ELEMENT_TYPES.includes(body.elementType as (typeof ELEMENT_TYPES)[number])
  ) {
    update.elementType = body.elementType as (typeof ELEMENT_TYPES)[number];
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const existing = await db.query.damageFleets.findFirst({ where: eq(damageFleets.id, id) });
  if (!existing) {
    return NextResponse.json({ error: "Fleet not found" }, { status: 404 });
  }

  await db.update(damageFleets).set(update).where(eq(damageFleets.id, id));
  return NextResponse.json({ fleet: { ...existing, ...update } });
}
