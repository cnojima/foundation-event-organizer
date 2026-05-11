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

    const existing = tx
      .select({ id: signups.id })
      .from(signups)
      .where(
        and(
          eq(signups.eventId, input.eventId),
          eq(signups.userId, input.userId),
          isNull(signups.deletedAt)
        )
      )
      .get();
    if (existing) {
      return { ok: false as const, reason: "Already signed up", status: 409 };
    }

    const currentSignups = tx
      .select({ assignedRole: signups.assignedRole })
      .from(signups)
      .where(
        and(eq(signups.eventId, input.eventId), isNull(signups.deletedAt))
      )
      .all();
    const standing = computeStanding(event, currentSignups);
    const assignedRole = standing.isFull ? WAITLIST_ROLE : null;

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
