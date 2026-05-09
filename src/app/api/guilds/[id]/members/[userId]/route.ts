import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireGuildAdminApi, countGuildAdmins } from "@/lib/rbac";
import { db } from "@/db";
import { events, signups, users } from "@/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const { id: guildId, userId } = await params;
  const session = await auth();
  const guard = requireGuildAdminApi(session, guildId);
  if (!guard.ok) return guard.response;

  const body = await req.json();
  const role: "admin" | "member" | undefined =
    body.role === "admin" || body.role === "member" ? body.role : undefined;
  if (!role) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const target = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!target || target.guildId !== guildId) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }
  if (target.guildRole === role) {
    return NextResponse.json({ success: true });
  }

  // Demoting an admin: ensure at least one admin remains.
  if (target.guildRole === "admin" && role === "member") {
    const admins = await countGuildAdmins(guildId);
    if (admins <= 1) {
      return NextResponse.json(
        { error: "Cannot demote the last admin. Promote someone else first." },
        { status: 409 }
      );
    }
  }

  await db.update(users).set({ guildRole: role }).where(eq(users.id, userId));
  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const { id: guildId, userId } = await params;
  const session = await auth();
  const guard = requireGuildAdminApi(session, guildId);
  if (!guard.ok) return guard.response;

  const target = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!target || target.guildId !== guildId) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }
  if (target.guildRole === "admin") {
    const admins = await countGuildAdmins(guildId);
    if (admins <= 1) {
      return NextResponse.json(
        { error: "Cannot kick the last admin. Promote someone else first." },
        { status: 409 }
      );
    }
  }

  db.transaction((tx) => {
    const guildEventIds = tx
      .select({ id: events.id })
      .from(events)
      .where(eq(events.guildId, guildId))
      .all()
      .map((r) => r.id);

    if (guildEventIds.length > 0) {
      tx.update(signups)
        .set({ deletedAt: new Date().toISOString() })
        .where(
          and(
            eq(signups.userId, userId),
            inArray(signups.eventId, guildEventIds),
            isNull(signups.deletedAt)
          )
        )
        .run();
    }

    tx.update(users)
      .set({ guildId: null, guildRole: null })
      .where(eq(users.id, userId))
      .run();
  });

  return NextResponse.json({ success: true });
}
