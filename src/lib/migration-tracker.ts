import { randomBytes } from "crypto";
import { db } from "@/db";
import {
  migrationDestinations,
  powerTierThresholds,
  classificationDefaultAllocations,
  migrationAllocations,
  migrationApplications,
} from "@/db/schema";
import { and, asc, eq, gte, inArray, ne, sql } from "drizzle-orm";

export type Tier = "ultra_high" | "high" | "mid" | "low";
export type Classification = "high" | "mid" | "low";
export type ApplicationStatus =
  | "applied"
  | "waitlisted"
  | "accepted"
  | "denied"
  | "withdrawn"
  | "removed_by_admin";

// Highest to lowest — the display order used throughout the tracker UI.
export const TIER_ORDER: Tier[] = ["ultra_high", "high", "mid", "low"];

type ThresholdRow = { tier: Tier; flavorName: string; minPower: number | null };
export type MigrationApplicationRow = typeof migrationApplications.$inferSelect;
export type MigrationDestinationRow = typeof migrationDestinations.$inferSelect;

const RESERVED_STATUSES: ApplicationStatus[] = ["applied", "accepted"];
const TERMINAL_STATUSES: ApplicationStatus[] = ["withdrawn", "removed_by_admin"];
const DECIDED_STATUSES: ApplicationStatus[] = ["denied", "withdrawn", "removed_by_admin"];

// Derives a player's tier from a raw power number and the current
// thresholds. Sorted descending by minPower; first match wins, falling
// back to whichever tier has a null minPower (the bottom tier).
export function deriveTier(power: number, thresholds: ThresholdRow[]): Tier {
  const sorted = [...thresholds].sort(
    (a, b) => (b.minPower ?? -Infinity) - (a.minPower ?? -Infinity)
  );
  for (const t of sorted) {
    if (t.minPower !== null && power >= t.minPower) return t.tier;
  }
  const fallback = sorted.find((t) => t.minPower === null);
  return fallback?.tier ?? sorted[sorted.length - 1].tier;
}

export type WindowStatus = "upcoming" | "open" | "closed";

// Derived, never stored — one source of truth for a window's lifecycle.
export function getWindowStatus(
  destination: { opensAt: string; closesAt: string },
  nowIso: string = new Date().toISOString()
): WindowStatus {
  if (nowIso < destination.opensAt) return "upcoming";
  if (nowIso > destination.closesAt) return "closed";
  return "open";
}

export function isWindowClosed(destination: { opensAt: string; closesAt: string }): boolean {
  return getWindowStatus(destination) === "closed";
}

// Resolves the window that matters right now for a server: the open one if
// any, else the nearest upcoming one, else undefined (nothing active). A
// server can have many destination rows over its lifetime (past, current,
// future) — this is how the public site finds "the current one" without
// the URL needing a window id.
export function resolveActiveDestination(serverNumber: number): MigrationDestinationRow | undefined {
  const rows = db
    .select()
    .from(migrationDestinations)
    .where(eq(migrationDestinations.serverNumber, serverNumber))
    .all();
  const open = rows.find((d) => getWindowStatus(d) === "open");
  if (open) return open;
  const upcoming = rows
    .filter((d) => getWindowStatus(d) === "upcoming")
    .sort((a, b) => a.opensAt.localeCompare(b.opensAt));
  return upcoming[0];
}

// Every server with an open-or-upcoming window (closesAt >= now covers
// both). Powers the public index and the landing/sign-in banner.
export function getActiveDestinations(): MigrationDestinationRow[] {
  const nowIso = new Date().toISOString();
  return db
    .select()
    .from(migrationDestinations)
    .where(gte(migrationDestinations.closesAt, nowIso))
    .orderBy(migrationDestinations.serverNumber)
    .all();
}

export type ClassificationStandard = {
  classification: Classification;
  slotsByTier: Record<Tier, number>;
};

// The global classification x tier -> default cap table (seeded once, only
// ever hand-edited via db:studio per the schema.ts comment). Read-only
// helper for surfaces that explain the standard rather than a specific
// destination's (possibly overridden) allocations — e.g. the public
// tracker's "how slots are split" legend.
export function getClassificationStandards(): ClassificationStandard[] {
  const rows = db.select().from(classificationDefaultAllocations).all();
  return (["high", "mid", "low"] as Classification[]).map((classification) => ({
    classification,
    slotsByTier: Object.fromEntries(
      TIER_ORDER.map((tier) => [
        tier,
        rows.find((r) => r.classification === classification && r.tier === tier)?.maxSlots ?? 0,
      ])
    ) as Record<Tier, number>,
  }));
}

export type TierSummary = {
  tier: Tier;
  flavorName: string;
  minPower: number | null; // null for the bottom (catch-all) tier
  cap: number;
  reserved: number; // applied + accepted — counts against cap
  waitlisted: number;
  remaining: number;
};

export function getCapacitySummary(destinationId: string): TierSummary[] {
  const thresholds = db.select().from(powerTierThresholds).all();
  const allocations = db
    .select()
    .from(migrationAllocations)
    .where(eq(migrationAllocations.destinationId, destinationId))
    .all();
  const rows = db
    .select({ tier: migrationApplications.tier, status: migrationApplications.status })
    .from(migrationApplications)
    .where(
      and(
        eq(migrationApplications.destinationId, destinationId),
        inArray(migrationApplications.status, ["applied", "accepted", "waitlisted"])
      )
    )
    .all();

  return TIER_ORDER.map((tier) => {
    const threshold = thresholds.find((t) => t.tier === tier);
    const alloc = allocations.find((a) => a.tier === tier);
    const cap = alloc?.maxSlots ?? 0;
    const reserved = rows.filter(
      (r) => r.tier === tier && RESERVED_STATUSES.includes(r.status as ApplicationStatus)
    ).length;
    const waitlisted = rows.filter((r) => r.tier === tier && r.status === "waitlisted").length;
    return {
      tier,
      flavorName: threshold?.flavorName ?? tier,
      minPower: threshold?.minPower ?? null,
      cap,
      reserved,
      waitlisted,
      remaining: cap - reserved,
    };
  });
}

// Counts current applied+accepted applications in a tier, optionally
// excluding one application (used when re-evaluating an edit in place).
function countReserved(
  destinationId: string,
  tier: Tier,
  excludeApplicationId?: string,
  tx: { select: typeof db.select } = db
): number {
  const conditions = [
    eq(migrationApplications.destinationId, destinationId),
    eq(migrationApplications.tier, tier),
    inArray(migrationApplications.status, RESERVED_STATUSES),
  ];
  if (excludeApplicationId) conditions.push(ne(migrationApplications.id, excludeApplicationId));
  const row = tx
    .select({ count: sql<number>`count(*)` })
    .from(migrationApplications)
    .where(and(...conditions))
    .get();
  return Number(row?.count ?? 0);
}

// Fills any now-open reserved slots in `tier` from the front of that tier's
// waitlist (oldest createdAt first). Moves status waitlisted -> applied,
// not accepted — acceptance stays a deliberate officer decision, this just
// pulls the next applicant back into the reviewable pool. Called after any
// transition that could free a reserved slot (deny, bump-to-waitlist,
// remove, withdraw) on an application that was previously applied/accepted.
// `excludeApplicationId` is the application that just triggered this call —
// critical for the bump-to-waitlist case, where that application's own new
// status is "waitlisted" too; without excluding it, an officer manually
// waitlisting someone could immediately auto-promote that same person right
// back to applied if they happen to have the oldest createdAt in the tier.
// Returns the promoted rows so callers can audit-log each one.
function promoteFromWaitlist(
  tx: { select: typeof db.select; update: typeof db.update },
  destinationId: string,
  tier: Tier,
  now: string,
  excludeApplicationId?: string
): MigrationApplicationRow[] {
  const allocation = tx
    .select()
    .from(migrationAllocations)
    .where(
      and(eq(migrationAllocations.destinationId, destinationId), eq(migrationAllocations.tier, tier))
    )
    .get();
  const cap = allocation?.maxSlots ?? 0;
  let openSlots = cap - countReserved(destinationId, tier, undefined, tx);
  if (openSlots <= 0) return [];

  const waitlistConditions = [
    eq(migrationApplications.destinationId, destinationId),
    eq(migrationApplications.tier, tier),
    eq(migrationApplications.status, "waitlisted"),
  ];
  if (excludeApplicationId) waitlistConditions.push(ne(migrationApplications.id, excludeApplicationId));
  const waitlisted = tx
    .select()
    .from(migrationApplications)
    .where(and(...waitlistConditions))
    .orderBy(asc(migrationApplications.createdAt))
    .all();

  const promoted: MigrationApplicationRow[] = [];
  for (const app of waitlisted) {
    if (openSlots <= 0) break;
    tx.update(migrationApplications)
      .set({ status: "applied", updatedAt: now })
      .where(eq(migrationApplications.id, app.id))
      .run();
    promoted.push({ ...app, status: "applied", updatedAt: now });
    openSlots--;
  }
  return promoted;
}

// Mirror of promoteFromWaitlist for the opposite direction: when a tier's
// cap shrinks (e.g. reclassifying to a smaller classification), waitlists
// the newest "applied" applications in `tier` — oldest kept, newest bumped
// — until the reserved count fits the new cap. Never touches "accepted"
// applications; acceptance is a deliberate officer decision (see
// promoteFromWaitlist above) and is never auto-reversed by a config change.
// If accepted alone already exceeds the new cap, there's nothing left to
// demote — the overage just surfaces via getCapacitySummary for an officer
// to handle manually, same as any other over-cap state.
// Returns the demoted rows so callers can audit-log each one.
function demoteOverCapToWaitlist(
  tx: { select: typeof db.select; update: typeof db.update },
  destinationId: string,
  tier: Tier,
  now: string
): MigrationApplicationRow[] {
  const allocation = tx
    .select()
    .from(migrationAllocations)
    .where(
      and(eq(migrationAllocations.destinationId, destinationId), eq(migrationAllocations.tier, tier))
    )
    .get();
  const cap = allocation?.maxSlots ?? 0;

  const acceptedCount = tx
    .select({ count: sql<number>`count(*)` })
    .from(migrationApplications)
    .where(
      and(
        eq(migrationApplications.destinationId, destinationId),
        eq(migrationApplications.tier, tier),
        eq(migrationApplications.status, "accepted")
      )
    )
    .get();
  const room = Math.max(0, cap - Number(acceptedCount?.count ?? 0));

  const applied = tx
    .select()
    .from(migrationApplications)
    .where(
      and(
        eq(migrationApplications.destinationId, destinationId),
        eq(migrationApplications.tier, tier),
        eq(migrationApplications.status, "applied")
      )
    )
    .orderBy(asc(migrationApplications.createdAt))
    .all();

  const overflow = applied.slice(room);
  for (const app of overflow) {
    tx.update(migrationApplications)
      .set({ status: "waitlisted", updatedAt: now })
      .where(eq(migrationApplications.id, app.id))
      .run();
  }
  return overflow.map((app) => ({ ...app, status: "waitlisted" as const, updatedAt: now }));
}

// Re-derives tier from a new power value and, if the application is still
// undecided (applied/waitlisted), re-runs the same room check as a fresh
// submission — can flip applied <-> waitlisted, but never auto-promotes
// someone else off the waitlist. For an already-decided application (e.g.
// accepted/denied), the tier is still refreshed for accuracy but the
// decision itself is left alone.
function recomputeTierAndStatus(
  tx: { select: typeof db.select },
  destinationId: string,
  applicationId: string,
  power: number,
  currentStatus: ApplicationStatus
): { tier: Tier; status: ApplicationStatus } {
  const thresholds = tx.select().from(powerTierThresholds).all();
  const tier = deriveTier(power, thresholds);
  if (currentStatus !== "applied" && currentStatus !== "waitlisted") {
    return { tier, status: currentStatus };
  }
  const allocation = tx
    .select()
    .from(migrationAllocations)
    .where(and(eq(migrationAllocations.destinationId, destinationId), eq(migrationAllocations.tier, tier)))
    .get();
  const cap = allocation?.maxSlots ?? 0;
  const reserved = countReserved(destinationId, tier, applicationId, tx);
  const status: ApplicationStatus = reserved < cap ? "applied" : "waitlisted";
  return { tier, status };
}

export type SubmitApplicationInput = {
  destinationId: string;
  playerName: string;
  sourceServer: string;
  power: number;
  desiredGuild: string | null;
  gameUid: string | null;
  contact: string | null;
};

export type SubmitApplicationResult =
  | { ok: true; application: MigrationApplicationRow; editToken: string }
  | { ok: false; reason: string; status: 400 | 404 | 409 };

export function submitApplication(input: SubmitApplicationInput): SubmitApplicationResult {
  return db.transaction((tx) => {
    const destination = tx
      .select()
      .from(migrationDestinations)
      .where(eq(migrationDestinations.id, input.destinationId))
      .get();
    if (!destination) {
      return { ok: false as const, reason: "Destination not found", status: 404 as const };
    }
    if (getWindowStatus(destination) !== "open") {
      return {
        ok: false as const,
        reason: "This migration window is not currently open",
        status: 409 as const,
      };
    }

    const thresholds = tx.select().from(powerTierThresholds).all();
    if (thresholds.length === 0) {
      return {
        ok: false as const,
        reason: "Migration tracker is not configured yet",
        status: 400 as const,
      };
    }
    const tier = deriveTier(input.power, thresholds);

    const allocation = tx
      .select()
      .from(migrationAllocations)
      .where(
        and(
          eq(migrationAllocations.destinationId, input.destinationId),
          eq(migrationAllocations.tier, tier)
        )
      )
      .get();
    const cap = allocation?.maxSlots ?? 0;
    const reserved = countReserved(input.destinationId, tier, undefined, tx);
    const status: "applied" | "waitlisted" = reserved < cap ? "applied" : "waitlisted";

    const now = new Date().toISOString();
    const application: MigrationApplicationRow = {
      id: crypto.randomUUID(),
      destinationId: input.destinationId,
      playerName: input.playerName,
      sourceServer: input.sourceServer,
      power: input.power,
      tier,
      desiredGuild: input.desiredGuild,
      gameUid: input.gameUid,
      contact: input.contact,
      status,
      reviewedByUserId: null,
      reviewedAt: null,
      reviewNote: null,
      editToken: randomBytes(16).toString("base64url"),
      createdAt: now,
      updatedAt: now,
    };
    tx.insert(migrationApplications).values(application).run();
    return { ok: true as const, application, editToken: application.editToken };
  });
}

export type EditApplicationInput = {
  sourceServer?: string;
  power?: number;
  desiredGuild?: string | null;
  gameUid?: string | null;
  contact?: string | null;
};

export type EditApplicationResult =
  | { ok: true; application: MigrationApplicationRow }
  | { ok: false; reason: string; status: 404 | 409 };

// Editable only while a decision hasn't been made yet (applied/waitlisted).
// A power edit re-derives the tier and re-runs the same room check as a
// fresh submission — it can flip applied <-> waitlisted, but never
// auto-promotes someone else off the waitlist.
export function editApplicationByToken(
  token: string,
  updates: EditApplicationInput
): EditApplicationResult {
  return db.transaction((tx) => {
    const application = tx
      .select()
      .from(migrationApplications)
      .where(eq(migrationApplications.editToken, token))
      .get();
    if (!application) {
      return { ok: false as const, reason: "Application not found", status: 404 as const };
    }
    if (application.status !== "applied" && application.status !== "waitlisted") {
      return {
        ok: false as const,
        reason: "This application can no longer be edited",
        status: 409 as const,
      };
    }
    const destination = tx
      .select()
      .from(migrationDestinations)
      .where(eq(migrationDestinations.id, application.destinationId))
      .get();
    if (destination && isWindowClosed(destination)) {
      return {
        ok: false as const,
        reason: "This migration window has closed",
        status: 409 as const,
      };
    }

    const now = new Date().toISOString();
    let tier = application.tier as Tier;
    let status = application.status as "applied" | "waitlisted";
    const power = updates.power ?? application.power;

    if (updates.power !== undefined) {
      const recomputed = recomputeTierAndStatus(
        tx,
        application.destinationId,
        application.id,
        updates.power,
        application.status as ApplicationStatus
      );
      tier = recomputed.tier;
      status = recomputed.status as "applied" | "waitlisted";
    }

    const updated: MigrationApplicationRow = {
      ...application,
      sourceServer: updates.sourceServer ?? application.sourceServer,
      desiredGuild:
        updates.desiredGuild === undefined ? application.desiredGuild : updates.desiredGuild,
      gameUid: updates.gameUid === undefined ? application.gameUid : updates.gameUid,
      contact: updates.contact === undefined ? application.contact : updates.contact,
      power,
      tier,
      status,
      updatedAt: now,
    };
    tx.update(migrationApplications)
      .set({
        sourceServer: updated.sourceServer,
        desiredGuild: updated.desiredGuild,
        gameUid: updated.gameUid,
        contact: updated.contact,
        power: updated.power,
        tier: updated.tier,
        status: updated.status,
        updatedAt: updated.updatedAt,
      })
      .where(eq(migrationApplications.id, application.id))
      .run();

    return { ok: true as const, application: updated };
  });
}

export type EditApplicationByAdminInput = {
  playerName?: string;
  sourceServer?: string;
  power?: number;
  desiredGuild?: string | null;
  gameUid?: string | null;
};

// Admin/officer correction path — not gated on applied/waitlisted status or
// window closure, since fixing a typo or reference field after a decision
// (or after the window closes) is still useful. A power edit still
// re-derives tier the same way editApplicationByToken does, via the shared
// recomputeTierAndStatus helper, but only flips applied <-> waitlisted if
// the application is still undecided.
export function editApplicationByAdmin(
  applicationId: string,
  updates: EditApplicationByAdminInput
): EditApplicationResult {
  return db.transaction((tx) => {
    const application = tx
      .select()
      .from(migrationApplications)
      .where(eq(migrationApplications.id, applicationId))
      .get();
    if (!application) {
      return { ok: false as const, reason: "Application not found", status: 404 as const };
    }

    const now = new Date().toISOString();
    let tier = application.tier as Tier;
    let status = application.status as ApplicationStatus;
    const power = updates.power ?? application.power;

    if (updates.power !== undefined) {
      const recomputed = recomputeTierAndStatus(
        tx,
        application.destinationId,
        application.id,
        updates.power,
        application.status as ApplicationStatus
      );
      tier = recomputed.tier;
      status = recomputed.status;
    }

    const updated: MigrationApplicationRow = {
      ...application,
      playerName: updates.playerName ?? application.playerName,
      sourceServer: updates.sourceServer ?? application.sourceServer,
      desiredGuild:
        updates.desiredGuild === undefined ? application.desiredGuild : updates.desiredGuild,
      gameUid: updates.gameUid === undefined ? application.gameUid : updates.gameUid,
      power,
      tier,
      status,
      updatedAt: now,
    };
    tx.update(migrationApplications)
      .set({
        playerName: updated.playerName,
        sourceServer: updated.sourceServer,
        desiredGuild: updated.desiredGuild,
        gameUid: updated.gameUid,
        power: updated.power,
        tier: updated.tier,
        status: updated.status,
        updatedAt: updated.updatedAt,
      })
      .where(eq(migrationApplications.id, applicationId))
      .run();
    return { ok: true as const, application: updated };
  });
}

export type WithdrawResult =
  | { ok: true; application: MigrationApplicationRow; promoted: MigrationApplicationRow[] }
  | { ok: false; reason: string; status: 404 | 409 };

export function withdrawApplicationByToken(token: string): WithdrawResult {
  return db.transaction((tx) => {
    const application = tx
      .select()
      .from(migrationApplications)
      .where(eq(migrationApplications.editToken, token))
      .get();
    if (!application) {
      return { ok: false as const, reason: "Application not found", status: 404 as const };
    }
    if (TERMINAL_STATUSES.includes(application.status as ApplicationStatus)) {
      return {
        ok: false as const,
        reason: "This application has already been withdrawn",
        status: 409 as const,
      };
    }
    const destination = tx
      .select()
      .from(migrationDestinations)
      .where(eq(migrationDestinations.id, application.destinationId))
      .get();
    if (destination && isWindowClosed(destination)) {
      return {
        ok: false as const,
        reason: "This migration window has closed",
        status: 409 as const,
      };
    }
    const now = new Date().toISOString();
    tx.update(migrationApplications)
      .set({ status: "withdrawn", updatedAt: now })
      .where(eq(migrationApplications.id, application.id))
      .run();
    const promoted = RESERVED_STATUSES.includes(application.status as ApplicationStatus)
      ? promoteFromWaitlist(tx, application.destinationId, application.tier as Tier, now, application.id)
      : [];
    return {
      ok: true as const,
      application: { ...application, status: "withdrawn", updatedAt: now },
      promoted,
    };
  });
}

export type ReviewAction = "accept" | "deny" | "waitlist" | "revert";

const REVIEW_TARGET_STATUS: Record<Exclude<ReviewAction, "revert">, ApplicationStatus> = {
  accept: "accepted",
  deny: "denied",
  waitlist: "waitlisted",
};

export type ReviewResult =
  | { ok: true; application: MigrationApplicationRow; promoted: MigrationApplicationRow[] }
  | { ok: false; reason: string; status: 404 | 409 };

// Deny/waitlist can free a reserved slot (applied/accepted -> denied/
// waitlisted) — when that happens, promoteFromWaitlist immediately pulls
// the longest-waiting applicant(s) in that tier back into "applied".
// Accept never frees a slot (applied/waitlisted -> accepted only holds or
// consumes room), so it never triggers a promotion. Going over cap from a
// decision is still shown, not blocked — promotion only fills existing
// headroom, it doesn't create any.
//
// `revert` is the undo path for an accidental Accept or Deny click — the one
// action allowed to move an application out of "accepted" or "denied" (every
// other action is blocked once decided, per DECIDED_STATUSES below, but
// revert itself checks status directly instead of going through that set so
// both of these stay reachable). Lands on "applied" or "waitlisted" — same
// room check as a fresh submission (see recomputeTierAndStatus) — rather
// than unconditionally "applied": the application's original status isn't
// tracked, and other applications may have been accepted into this tier in
// the meantime, so "applied" isn't always accurate. withdrawn/removed_by_admin
// remain unreachable via revert; those are genuinely terminal.
export function reviewApplication(
  applicationId: string,
  action: ReviewAction,
  reviewerUserId: string,
  note?: string | null
): ReviewResult {
  return db.transaction((tx) => {
    const application = tx
      .select()
      .from(migrationApplications)
      .where(eq(migrationApplications.id, applicationId))
      .get();
    if (!application) {
      return { ok: false as const, reason: "Application not found", status: 404 as const };
    }
    if (action === "revert") {
      if (application.status !== "accepted" && application.status !== "denied") {
        return {
          ok: false as const,
          reason: "Only accepted or denied applications can be reverted",
          status: 409 as const,
        };
      }
    } else if (DECIDED_STATUSES.includes(application.status as ApplicationStatus)) {
      return {
        ok: false as const,
        reason: "This application has already been finalized",
        status: 409 as const,
      };
    }
    const destination = tx
      .select()
      .from(migrationDestinations)
      .where(eq(migrationDestinations.id, application.destinationId))
      .get();
    if (destination && isWindowClosed(destination)) {
      return {
        ok: false as const,
        reason: "This migration window has closed",
        status: 409 as const,
      };
    }
    const now = new Date().toISOString();
    let targetStatus: ApplicationStatus;
    if (action === "revert") {
      const allocation = tx
        .select()
        .from(migrationAllocations)
        .where(
          and(
            eq(migrationAllocations.destinationId, application.destinationId),
            eq(migrationAllocations.tier, application.tier as Tier)
          )
        )
        .get();
      const cap = allocation?.maxSlots ?? 0;
      const reserved = countReserved(application.destinationId, application.tier as Tier, application.id, tx);
      targetStatus = reserved < cap ? "applied" : "waitlisted";
    } else {
      targetStatus = REVIEW_TARGET_STATUS[action];
    }
    const updated: MigrationApplicationRow = {
      ...application,
      status: targetStatus,
      reviewedByUserId: reviewerUserId,
      reviewedAt: now,
      reviewNote: note ?? null,
      updatedAt: now,
    };
    tx.update(migrationApplications)
      .set({
        status: updated.status,
        reviewedByUserId: updated.reviewedByUserId,
        reviewedAt: updated.reviewedAt,
        reviewNote: updated.reviewNote,
        updatedAt: updated.updatedAt,
      })
      .where(eq(migrationApplications.id, applicationId))
      .run();
    const freedSlot =
      RESERVED_STATUSES.includes(application.status as ApplicationStatus) &&
      !RESERVED_STATUSES.includes(updated.status as ApplicationStatus);
    const promoted = freedSlot
      ? promoteFromWaitlist(tx, application.destinationId, application.tier as Tier, now, application.id)
      : [];
    return { ok: true as const, application: updated, promoted };
  });
}

// Data-hygiene removal (spam/duplicate/garbage) — distinct from `deny`,
// which is a legitimate immigration decision. Server-admin only at the
// route-guard level, not plain officers.
export function removeApplication(
  applicationId: string,
  adminUserId: string,
  note?: string | null
): ReviewResult {
  return db.transaction((tx) => {
    const application = tx
      .select()
      .from(migrationApplications)
      .where(eq(migrationApplications.id, applicationId))
      .get();
    if (!application) {
      return { ok: false as const, reason: "Application not found", status: 404 as const };
    }
    if (application.status === "removed_by_admin") {
      return { ok: false as const, reason: "Already removed", status: 409 as const };
    }
    const destination = tx
      .select()
      .from(migrationDestinations)
      .where(eq(migrationDestinations.id, application.destinationId))
      .get();
    if (destination && isWindowClosed(destination)) {
      return {
        ok: false as const,
        reason: "This migration window has closed",
        status: 409 as const,
      };
    }
    const now = new Date().toISOString();
    const updated: MigrationApplicationRow = {
      ...application,
      status: "removed_by_admin",
      reviewedByUserId: adminUserId,
      reviewedAt: now,
      reviewNote: note ?? null,
      updatedAt: now,
    };
    tx.update(migrationApplications)
      .set({
        status: updated.status,
        reviewedByUserId: updated.reviewedByUserId,
        reviewedAt: updated.reviewedAt,
        reviewNote: updated.reviewNote,
        updatedAt: updated.updatedAt,
      })
      .where(eq(migrationApplications.id, applicationId))
      .run();
    const promoted = RESERVED_STATUSES.includes(application.status as ApplicationStatus)
      ? promoteFromWaitlist(tx, application.destinationId, application.tier as Tier, now, application.id)
      : [];
    return { ok: true as const, application: updated, promoted };
  });
}

// Shared by reclassifyDestination and createDestination — upserts all 4
// tier caps from the classification standard table. `tx` accepts either a
// transaction handle or the bare `db`, same DbExec-style composition as
// softDeleteGuildAndEvents in rbac.ts.
type DbExec = {
  select: typeof db.select;
  update: typeof db.update;
  insert: typeof db.insert;
};
function seedAllocationsFromClassification(
  tx: DbExec,
  destinationId: string,
  classification: Classification
): void {
  const defaults = tx
    .select()
    .from(classificationDefaultAllocations)
    .where(eq(classificationDefaultAllocations.classification, classification))
    .all();
  for (const d of defaults) {
    const existing = tx
      .select()
      .from(migrationAllocations)
      .where(
        and(
          eq(migrationAllocations.destinationId, destinationId),
          eq(migrationAllocations.tier, d.tier)
        )
      )
      .get();
    if (existing) {
      tx.update(migrationAllocations)
        .set({ maxSlots: d.maxSlots })
        .where(
          and(
            eq(migrationAllocations.destinationId, destinationId),
            eq(migrationAllocations.tier, d.tier)
          )
        )
        .run();
    } else {
      tx.insert(migrationAllocations)
        .values({ destinationId, tier: d.tier, maxSlots: d.maxSlots })
        .run();
    }
  }
}

// Reclassifying resets all 4 tier caps to the new classification's standard
// defaults — the standard table is the default, and any prior manual
// override is intentionally discarded (an admin can re-override afterward).
// Also re-syncs applied/waitlisted status per tier against the new caps in
// both directions: a shrunk cap demotes the newest over-cap "applied"
// applicants to "waitlisted" (see demoteOverCapToWaitlist), while a grown
// cap promotes the longest-waiting "waitlisted" applicants back to
// "applied" (see promoteFromWaitlist) to fill the newly opened room. Only
// one direction can ever apply per tier — each function is a no-op unless
// its own condition (over cap / under cap) actually holds — so it's safe to
// run both unconditionally instead of branching on which way the
// reclassify moved.
export function reclassifyDestination(
  destinationId: string,
  classification: Classification
): {
  ok: true;
  demoted: MigrationApplicationRow[];
  promoted: MigrationApplicationRow[];
} | { ok: false; reason: string; status: 404 | 409 } {
  return db.transaction((tx) => {
    const destination = tx
      .select()
      .from(migrationDestinations)
      .where(eq(migrationDestinations.id, destinationId))
      .get();
    if (!destination) {
      return { ok: false as const, reason: "Destination not found", status: 404 as const };
    }
    if (isWindowClosed(destination)) {
      return {
        ok: false as const,
        reason: "This migration window has closed",
        status: 409 as const,
      };
    }

    tx.update(migrationDestinations)
      .set({ classification })
      .where(eq(migrationDestinations.id, destinationId))
      .run();
    seedAllocationsFromClassification(tx, destinationId, classification);

    const now = new Date().toISOString();
    const demoted: MigrationApplicationRow[] = [];
    const promoted: MigrationApplicationRow[] = [];
    for (const tier of TIER_ORDER) {
      demoted.push(...demoteOverCapToWaitlist(tx, destinationId, tier, now));
      promoted.push(...promoteFromWaitlist(tx, destinationId, tier, now));
    }
    return { ok: true as const, demoted, promoted };
  });
}

export function setAllocation(
  destinationId: string,
  tier: Tier,
  maxSlots: number
): { ok: true } | { ok: false; reason: string; status: 404 | 409 } {
  return db.transaction((tx) => {
    const destination = tx
      .select()
      .from(migrationDestinations)
      .where(eq(migrationDestinations.id, destinationId))
      .get();
    if (!destination) {
      return { ok: false as const, reason: "Destination not found", status: 404 as const };
    }
    if (isWindowClosed(destination)) {
      return {
        ok: false as const,
        reason: "This migration window has closed",
        status: 409 as const,
      };
    }
    const existing = tx
      .select()
      .from(migrationAllocations)
      .where(
        and(eq(migrationAllocations.destinationId, destinationId), eq(migrationAllocations.tier, tier))
      )
      .get();
    if (existing) {
      tx.update(migrationAllocations)
        .set({ maxSlots })
        .where(
          and(
            eq(migrationAllocations.destinationId, destinationId),
            eq(migrationAllocations.tier, tier)
          )
        )
        .run();
    } else {
      tx.insert(migrationAllocations).values({ destinationId, tier, maxSlots }).run();
    }
    return { ok: true as const };
  });
}

export type CreateDestinationInput = {
  serverNumber: number;
  classification: Classification;
  opensAt: string;
  closesAt: string;
};

export type CreateDestinationResult =
  | { ok: true; destination: MigrationDestinationRow }
  | { ok: false; reason: string; status: 400 | 409 };

// Blocked if the server already has an open-or-upcoming window, so
// resolveActiveDestination() is never ambiguous about which one is current.
export function createDestination(input: CreateDestinationInput): CreateDestinationResult {
  if (input.closesAt <= input.opensAt) {
    return { ok: false, reason: "Close date must be after open date", status: 400 };
  }
  return db.transaction((tx) => {
    const existing = tx
      .select()
      .from(migrationDestinations)
      .where(eq(migrationDestinations.serverNumber, input.serverNumber))
      .all();
    const nowIso = new Date().toISOString();
    if (existing.some((d) => d.closesAt >= nowIso)) {
      return {
        ok: false as const,
        reason: "This server already has an open or upcoming migration window",
        status: 409 as const,
      };
    }

    const destination: MigrationDestinationRow = {
      id: crypto.randomUUID(),
      serverNumber: input.serverNumber,
      classification: input.classification,
      opensAt: input.opensAt,
      closesAt: input.closesAt,
      createdAt: nowIso,
    };
    tx.insert(migrationDestinations).values(destination).run();
    seedAllocationsFromClassification(tx, destination.id, input.classification);
    return { ok: true as const, destination };
  });
}

// Correction path for a mistyped date — always allowed, even on a closed
// window. Since status is derived from these two dates, extending a closed
// window's closesAt naturally reopens it (and un-archives its
// applications, since "closed" is the only thing that hides them).
export function updateWindowDates(
  destinationId: string,
  opensAt: string,
  closesAt: string
): { ok: true } | { ok: false; reason: string; status: 400 | 404 } {
  if (closesAt <= opensAt) {
    return { ok: false, reason: "Close date must be after open date", status: 400 };
  }
  const destination = db
    .select()
    .from(migrationDestinations)
    .where(eq(migrationDestinations.id, destinationId))
    .get();
  if (!destination) {
    return { ok: false, reason: "Destination not found", status: 404 };
  }
  db.update(migrationDestinations)
    .set({ opensAt, closesAt })
    .where(eq(migrationDestinations.id, destinationId))
    .run();
  return { ok: true };
}

// Re-derives `tier` on every application still awaiting a decision
// (applied/waitlisted) using the new thresholds. Deliberately does NOT
// rebalance applied-vs-waitlisted status afterward — that would require
// re-running the whole FIFO admission algorithm across every tier. If a
// threshold change pushes a tier over cap, officers see it via
// getCapacitySummary and can manually waitlist people to correct it.
export function updateThresholds(updates: { tier: Tier; minPower: number | null }[]): void {
  db.transaction((tx) => {
    for (const u of updates) {
      tx.update(powerTierThresholds)
        .set({ minPower: u.minPower })
        .where(eq(powerTierThresholds.tier, u.tier))
        .run();
    }
    const newThresholds = tx.select().from(powerTierThresholds).all();
    const reviewable = tx
      .select()
      .from(migrationApplications)
      .where(inArray(migrationApplications.status, ["applied", "waitlisted"]))
      .all();
    const now = new Date().toISOString();
    for (const app of reviewable) {
      const nextTier = deriveTier(app.power, newThresholds);
      if (nextTier !== app.tier) {
        tx.update(migrationApplications)
          .set({ tier: nextTier, updatedAt: now })
          .where(eq(migrationApplications.id, app.id))
          .run();
      }
    }
  });
}

const DEFAULT_THRESHOLDS: ThresholdRow[] = [
  { tier: "ultra_high", flavorName: "Revivalist", minPower: 110_000_000 },
  { tier: "high", flavorName: "Contributor", minPower: 90_000_000 },
  { tier: "mid", flavorName: "Pioneer", minPower: 43_000_000 },
  { tier: "low", flavorName: "Follower", minPower: null },
];

const DEFAULT_CLASSIFICATION_ALLOCATIONS: {
  classification: Classification;
  tier: Tier;
  maxSlots: number;
}[] = [
  { classification: "high", tier: "ultra_high", maxSlots: 1 },
  { classification: "high", tier: "high", maxSlots: 3 },
  { classification: "high", tier: "mid", maxSlots: 30 },
  { classification: "high", tier: "low", maxSlots: 40 },
  { classification: "mid", tier: "ultra_high", maxSlots: 2 },
  { classification: "mid", tier: "high", maxSlots: 5 },
  { classification: "mid", tier: "mid", maxSlots: 40 },
  { classification: "mid", tier: "low", maxSlots: 60 },
  { classification: "low", tier: "ultra_high", maxSlots: 3 },
  { classification: "low", tier: "high", maxSlots: 8 },
  { classification: "low", tier: "mid", maxSlots: 60 },
  { classification: "low", tier: "low", maxSlots: 80 },
];

// Idempotent — safe to call on every boot (mirrors runMigrations() /
// seedDefaultTemplatesForAllGuilds()). Seeds only the two global reference
// tables (power tier thresholds, classification default allocations) —
// those are eternal config, not per-window. Does NOT create any
// destination; servers are opened via the super-admin "new window" flow
// (createDestination() above, POST /api/super-admin/migration-tracker/destinations).
export function ensureMigrationTrackerDefaults(): void {
  const thresholdCount = db
    .select({ count: sql<number>`count(*)` })
    .from(powerTierThresholds)
    .get();
  if (Number(thresholdCount?.count ?? 0) === 0) {
    for (const t of DEFAULT_THRESHOLDS) {
      db.insert(powerTierThresholds).values(t).run();
    }
  }

  const allocDefaultsCount = db
    .select({ count: sql<number>`count(*)` })
    .from(classificationDefaultAllocations)
    .get();
  if (Number(allocDefaultsCount?.count ?? 0) === 0) {
    for (const a of DEFAULT_CLASSIFICATION_ALLOCATIONS) {
      db.insert(classificationDefaultAllocations).values(a).run();
    }
  }
}
