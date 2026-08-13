import { randomBytes } from "crypto";
import { db } from "@/db";
import {
  migrationDestinations,
  powerTierThresholds,
  classificationDefaultAllocations,
  migrationAllocations,
  migrationApplications,
} from "@/db/schema";
import { and, eq, inArray, ne, sql } from "drizzle-orm";

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

export function getDefaultDestination(): MigrationDestinationRow | undefined {
  return db
    .select()
    .from(migrationDestinations)
    .orderBy(migrationDestinations.createdAt)
    .limit(1)
    .get();
}

export type TierSummary = {
  tier: Tier;
  flavorName: string;
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

export type SubmitApplicationInput = {
  destinationId: string;
  playerName: string;
  sourceServer: string;
  power: number;
  contact: string | null;
};

export type SubmitApplicationResult =
  | { ok: true; application: MigrationApplicationRow; editToken: string }
  | { ok: false; reason: string; status: 400 | 404 };

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

    const now = new Date().toISOString();
    let tier = application.tier as Tier;
    let status = application.status as "applied" | "waitlisted";
    const power = updates.power ?? application.power;

    if (updates.power !== undefined) {
      const thresholds = tx.select().from(powerTierThresholds).all();
      tier = deriveTier(updates.power, thresholds);
      const allocation = tx
        .select()
        .from(migrationAllocations)
        .where(
          and(
            eq(migrationAllocations.destinationId, application.destinationId),
            eq(migrationAllocations.tier, tier)
          )
        )
        .get();
      const cap = allocation?.maxSlots ?? 0;
      const reserved = countReserved(application.destinationId, tier, application.id, tx);
      status = reserved < cap ? "applied" : "waitlisted";
    }

    const updated: MigrationApplicationRow = {
      ...application,
      sourceServer: updates.sourceServer ?? application.sourceServer,
      contact: updates.contact === undefined ? application.contact : updates.contact,
      power,
      tier,
      status,
      updatedAt: now,
    };
    tx.update(migrationApplications)
      .set({
        sourceServer: updated.sourceServer,
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

export type WithdrawResult =
  | { ok: true; application: MigrationApplicationRow }
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
    const now = new Date().toISOString();
    tx.update(migrationApplications)
      .set({ status: "withdrawn", updatedAt: now })
      .where(eq(migrationApplications.id, application.id))
      .run();
    return {
      ok: true as const,
      application: { ...application, status: "withdrawn", updatedAt: now },
    };
  });
}

export type ReviewAction = "accept" | "deny" | "waitlist";

const REVIEW_TARGET_STATUS: Record<ReviewAction, ApplicationStatus> = {
  accept: "accepted",
  deny: "denied",
  waitlist: "waitlisted",
};

export type ReviewResult =
  | { ok: true; application: MigrationApplicationRow }
  | { ok: false; reason: string; status: 404 | 409 };

// Deliberately does not rebalance the rest of the tier's waitlist — freed or
// consumed room just changes what getCapacitySummary reports next.
// Promotion off the waitlist stays a manual officer action, and going over
// cap from a decision is shown, not blocked.
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
    if (DECIDED_STATUSES.includes(application.status as ApplicationStatus)) {
      return {
        ok: false as const,
        reason: "This application has already been finalized",
        status: 409 as const,
      };
    }
    const now = new Date().toISOString();
    const updated: MigrationApplicationRow = {
      ...application,
      status: REVIEW_TARGET_STATUS[action],
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
    return { ok: true as const, application: updated };
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
    return { ok: true as const, application: updated };
  });
}

// Reclassifying resets all 4 tier caps to the new classification's standard
// defaults — the standard table is the default, and any prior manual
// override is intentionally discarded (an admin can re-override afterward).
export function reclassifyDestination(
  destinationId: string,
  classification: Classification
): { ok: true } | { ok: false; reason: string; status: 404 } {
  return db.transaction((tx) => {
    const destination = tx
      .select()
      .from(migrationDestinations)
      .where(eq(migrationDestinations.id, destinationId))
      .get();
    if (!destination) {
      return { ok: false as const, reason: "Destination not found", status: 404 as const };
    }

    tx.update(migrationDestinations)
      .set({ classification })
      .where(eq(migrationDestinations.id, destinationId))
      .run();

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
    return { ok: true as const };
  });
}

export function setAllocation(destinationId: string, tier: Tier, maxSlots: number): void {
  db.transaction((tx) => {
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
  });
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

const MVP_SERVER_NUMBER = 1130;

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
// seedDefaultTemplatesForAllGuilds()). Seeds global thresholds, the global
// classification standard table, and the single MVP destination (#1130).
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

  let destination = db
    .select()
    .from(migrationDestinations)
    .where(eq(migrationDestinations.serverNumber, MVP_SERVER_NUMBER))
    .get();
  if (!destination) {
    destination = {
      id: crypto.randomUUID(),
      serverNumber: MVP_SERVER_NUMBER,
      classification: "mid",
      createdAt: new Date().toISOString(),
    };
    db.insert(migrationDestinations).values(destination).run();
  }

  const allocCount = db
    .select({ count: sql<number>`count(*)` })
    .from(migrationAllocations)
    .where(eq(migrationAllocations.destinationId, destination.id))
    .get();
  if (Number(allocCount?.count ?? 0) === 0) {
    const defaults = db
      .select()
      .from(classificationDefaultAllocations)
      .where(eq(classificationDefaultAllocations.classification, destination.classification))
      .all();
    for (const d of defaults) {
      db.insert(migrationAllocations)
        .values({ destinationId: destination.id, tier: d.tier, maxSlots: d.maxSlots })
        .run();
    }
  }
}
