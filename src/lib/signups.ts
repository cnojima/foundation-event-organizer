import { db } from "@/db";
import { events, signups, users } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { generateId } from "@/lib/ids";
import { computeStanding, WAITLIST_ROLE } from "@/lib/waitlist";

export type CreateSignupInput = {
  eventId: string;
  userId: string;
  squad1Preference: number | null;
  squad2Preference: number | null;
  willingBackup: boolean;
  requestLeadership: boolean;
  leadershipNote: string | null;
};

export type CreateSignupResult =
  | { ok: true; waitlisted: boolean; signupId: string }
  | { ok: false; reason: string; status: 400 | 403 | 404 | 409 };

// Authoritative signup-creation transaction. Used by both the web POST
// /api/signups handler and the Discord /signup slash command. Caller is
// responsible for any auth/membership checks beyond what's verified here.
export function createSignup({
  membership,
  input,
}: {
  membership: {
    userId: string;
    guildId: string | null;
    isSuperAdmin: boolean;
  };
  input: CreateSignupInput;
}): CreateSignupResult {
  return db.transaction((tx) => {
    const event = tx
      .select()
      .from(events)
      .where(eq(events.id, input.eventId))
      .get();
    if (!event || event.deletedAt) {
      return { ok: false as const, reason: "Event not found", status: 404 };
    }
    if (event.kind !== "match" && event.kind !== "scrim") {
      return {
        ok: false as const,
        reason: "This event does not accept signups",
        status: 400,
      };
    }
    // Guild membership check — read users.guildId fresh from the DB rather
    // than trusting `membership.guildId` from the session, which can be stale
    // across guild leave/join transitions. For scrim events `event.guildId`
    // is the home-side guild, so a user from the opposing guild correctly
    // gets blocked here (they sign up via their own mirrored event instead).
    // Super-admins bypass for platform-support reasons.
    if (!membership.isSuperAdmin) {
      const userRow = tx
        .select({ guildId: users.guildId })
        .from(users)
        .where(eq(users.id, input.userId))
        .get();
      if (!userRow || userRow.guildId !== event.guildId) {
        return { ok: false as const, reason: "Forbidden", status: 403 };
      }
    }

    // If an active row already exists for this (event, user) pair:
    //   - regular signup row → "Already signed up" (existing behavior).
    //   - attendance-only walk-in → upgrade in place. The admin had
    //     previously marked them attended ad-hoc; now the user wants
    //     to fill in real signup preferences. Preserve `attended=true`
    //     so the walk-in fact survives the upgrade.
    const existing = tx
      .select({
        id: signups.id,
        attendanceOnly: signups.attendanceOnly,
        attended: signups.attended,
      })
      .from(signups)
      .where(
        and(
          eq(signups.eventId, input.eventId),
          eq(signups.userId, input.userId),
          isNull(signups.deletedAt)
        )
      )
      .get();
    if (existing && !existing.attendanceOnly) {
      return { ok: false as const, reason: "Already signed up", status: 409 };
    }

    // Capacity tally excludes attendance-only rows (they aren't roster
    // slots), so the upgrade path doesn't double-count this user when
    // computing standing.
    const currentSignups = tx
      .select({ assignedRole: signups.assignedRole })
      .from(signups)
      .where(
        and(
          eq(signups.eventId, input.eventId),
          isNull(signups.deletedAt),
          eq(signups.attendanceOnly, false)
        )
      )
      .all();
    const standing = computeStanding(event, currentSignups);
    const assignedRole = standing.isFull ? WAITLIST_ROLE : null;

    if (existing) {
      // Upgrade the walk-in row in place.
      tx.update(signups)
        .set({
          squad1Preference: input.squad1Preference,
          squad2Preference: input.squad2Preference,
          willingBackup: input.willingBackup,
          requestLeadership: input.requestLeadership,
          leadershipNote: input.leadershipNote,
          assignedRole,
          attendanceOnly: false,
          // attended is preserved as-is — the walk-in fact stands.
        })
        .where(eq(signups.id, existing.id))
        .run();
      return {
        ok: true as const,
        waitlisted: assignedRole === WAITLIST_ROLE,
        signupId: existing.id,
      };
    }

    const signupId = generateId();
    tx.insert(signups)
      .values({
        id: signupId,
        eventId: input.eventId,
        userId: input.userId,
        squad1Preference: input.squad1Preference,
        squad2Preference: input.squad2Preference,
        willingBackup: input.willingBackup,
        requestLeadership: input.requestLeadership,
        leadershipNote: input.leadershipNote,
        assignedRole,
        createdAt: new Date().toISOString(),
      })
      .run();

    return {
      ok: true as const,
      waitlisted: assignedRole === WAITLIST_ROLE,
      signupId,
    };
  });
}
