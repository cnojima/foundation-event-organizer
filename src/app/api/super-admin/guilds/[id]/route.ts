import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireSuperAdminApi } from "@/lib/rbac";
import { db } from "@/db";
import { events, guilds, users } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const guard = requireSuperAdminApi(session);
  if (!guard.ok) return guard.response;

  const now = new Date().toISOString();
  db.transaction((tx) => {
    tx.update(guilds).set({ deletedAt: now }).where(eq(guilds.id, id)).run();
    tx.update(events)
      .set({ deletedAt: now })
      .where(and(eq(events.guildId, id), isNull(events.deletedAt)))
      .run();
    tx.update(users)
      .set({ guildId: null, guildRole: null })
      .where(eq(users.guildId, id))
      .run();
  });

  return NextResponse.json({ success: true });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const guard = requireSuperAdminApi(session);
  if (!guard.ok) return guard.response;

  const body = await req.json();
  if (body.action !== "undelete") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  await db.update(guilds).set({ deletedAt: null }).where(eq(guilds.id, id));
  return NextResponse.json({ success: true });
}
