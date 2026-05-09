import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/admin";
import { db } from "@/db";
import { events } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id || !(await isAdmin(session.user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const result = await db
    .update(events)
    .set({ deletedAt: new Date().toISOString() })
    .where(and(eq(events.id, id), isNull(events.deletedAt)))
    .returning({ id: events.id });
  if (result.length === 0) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
