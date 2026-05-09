import { db } from "@/db";
import { events, signups } from "@/db/schema";
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
    if (event.kind !== "match") {
      return {
        ok: false as const,
        reason: "This event does not accept signups",
        status: 400,
      };
    }
    // Guild membership check: super-admins bypass.
    if (!membership.isSuperAdmin && membership.guildId !== event.guildId) {
      return { ok: false as const, reason: "Forbidden", status: 403 };
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
