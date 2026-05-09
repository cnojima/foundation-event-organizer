import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireSignedInApi } from "@/lib/rbac";
import { db } from "@/db";
import { events, signups, users } from "@/db/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

export async function POST() {
  const session = await auth();
  const guard = requireSignedInApi(session);
  if (!guard.ok) return guard.response;
  const membership = guard.value;

  if (!membership.guildId) {
    return NextResponse.json({ error: "Not in a guild" }, { status: 400 });
  }

  const result = db.transaction((tx) => {
    // If user is an admin, ensure at least one other admin exists.
    if (membership.guildRole === "admin") {
      const otherAdmins = tx
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(
          and(
            eq(users.guildId, membership.guildId!),
            eq(users.guildRole, "admin"),
            sql`${users.id} != ${membership.userId}`
          )
        )
        .get();
      if (Number(otherAdmins?.count ?? 0) === 0) {
        return {
          error:
            "You're the only admin. Promote another member to admin before leaving.",
          status: 409 as const,
        };
      }
    }

    // Soft-delete this user's signups for any event in the guild.
    const guildEventIds = tx
      .select({ id: events.id })
      .from(events)
      .where(eq(events.guildId, membership.guildId!))
      .all()
      .map((r) => r.id);

    if (guildEventIds.length > 0) {
      tx.update(signups)
        .set({ deletedAt: new Date().toISOString() })
        .where(
          and(
            eq(signups.userId, membership.userId),
            inArray(signups.eventId, guildEventIds),
            isNull(signups.deletedAt)
          )
        )
        .run();
    }

    tx.update(users)
      .set({ guildId: null, guildRole: null })
      .where(eq(users.id, membership.userId))
      .run();

    return { ok: true as const };
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ success: true });
}
