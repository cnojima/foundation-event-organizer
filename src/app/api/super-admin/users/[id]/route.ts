import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireSuperAdminApi } from "@/lib/rbac";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const guard = requireSuperAdminApi(session);
  if (!guard.ok) return guard.response;

  const body = await req.json();
  if (typeof body.isSuperAdmin !== "boolean") {
    return NextResponse.json({ error: "Missing isSuperAdmin" }, { status: 400 });
  }

  // Don't let the last super-admin demote themselves.
  if (body.isSuperAdmin === false) {
    const remaining = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.isSuperAdmin, true))
      .get();
    const count = Number(remaining?.count ?? 0);
    const isSelf = id === guard.value.userId;
    if (isSelf && count <= 1) {
      return NextResponse.json(
        { error: "Cannot demote the last super-admin." },
        { status: 409 }
      );
    }
  }

  await db
    .update(users)
    .set({ isSuperAdmin: body.isSuperAdmin })
    .where(eq(users.id, id));
  return NextResponse.json({ success: true });
}
