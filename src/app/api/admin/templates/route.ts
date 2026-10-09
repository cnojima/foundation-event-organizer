import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireGuildAdminApi, resolveAdminGuildId } from "@/lib/rbac";
import { db } from "@/db";
import { eventTemplates } from "@/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";
import {
  TEMPLATE_LIMITS,
  isValidWeekday,
  isValidTimeUtc,
} from "@/lib/event-templates";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

// GET /api/admin/templates?guildId=... — list active templates for a guild.
// Regular admins are pinned to their own guild; super-admins may pass a
// different guildId via query.
export async function GET(req: Request) {
  const session = await auth();
  const guard = requireGuildAdminApi(session);
  if (!guard.ok) return guard.response;
  const membership = guard.value;

  const url = new URL(req.url);
  const targetGuildId = await resolveAdminGuildId(
    membership,
    url.searchParams.get("guildId") ?? undefined
  );
  if (!targetGuildId) {
    return NextResponse.json({ error: "Guild not found" }, { status: 404 });
  }

  const rows = await db
    .select()
    .from(eventTemplates)
    .where(
      and(
        eq(eventTemplates.guildId, targetGuildId),
        isNull(eventTemplates.deletedAt)
      )
    )
    .orderBy(asc(eventTemplates.templateName));

  return NextResponse.json({ templates: rows });
}

// POST /api/admin/templates — create a new template for the current guild
// (or, for super-admins, an explicit `guildId` in the body).
export async function POST(req: Request) {
  const session = await auth();
  const guard = requireGuildAdminApi(session);
  if (!guard.ok) return guard.response;
  const membership = guard.value;

  const body = await req.json().catch(() => ({}));
  const targetGuildId = await resolveAdminGuildId(membership, body.guildId);
  if (!targetGuildId) {
    return NextResponse.json({ error: "Guild not found" }, { status: 404 });
  }

  const parsed = parseTemplateBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  await db.insert(eventTemplates).values({
    id,
    guildId: targetGuildId,
    createdAt: nowIso,
    ...parsed.value,
  });

  void logAudit({
    guildId: targetGuildId,
    actorUserId: membership.userId,
    actorDisplay: await resolveActorDisplay(membership.userId),
    action: "event_template.create",
    entityType: "event_template",
    entityId: id,
    entityLabel: parsed.value.templateName,
    changes: { after: parsed.value },
  });

  return NextResponse.json({ id }, { status: 201 });
}

// Body parser shared by POST + PATCH. Returns the cleaned partial payload
// or a 400-worthy error message. PATCH passes `partial: true` so missing
// fields are allowed; POST requires the full required set.
type ParsedTemplateBody =
  | {
      ok: true;
      value: {
        templateName: string;
        eventName: string;
        description: string | null;
        kind: "match" | "simple";
        squad1Name: string;
        squad2Name: string;
        maxPlayers: number;
        maxBackups: number;
        leadershipSlots: number;
        durationMinutes: number | null;
        signupOpensWeekday: number | null;
        signupOpensTimeUtc: string | null;
        signupClosesWeekday: number | null;
        signupClosesTimeUtc: string | null;
        isRecurring: boolean;
        recurrenceIntervalWeeks: number | null;
        recurrenceAnchorWeekday: number | null;
        recurrenceStartTimeUtc: string | null;
        recurrenceSquad1TimeUtc: string | null;
        recurrenceSquad2TimeUtc: string | null;
        recurrenceEndType: "never" | "after_count" | "until_date" | null;
        recurrenceCount: number | null;
        recurrenceUntil: string | null;
      };
    }
  | { ok: false; error: string };

export function parseTemplateBody(body: unknown): ParsedTemplateBody {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Invalid body" };
  }
  const b = body as Record<string, unknown>;

  const templateName = trimmed(b.templateName);
  if (!templateName) return { ok: false, error: "Template name is required" };
  if (templateName.length > TEMPLATE_LIMITS.templateName.max) {
    return { ok: false, error: "Template name is too long" };
  }

  const eventName = trimmed(b.eventName);
  if (!eventName) return { ok: false, error: "Event name is required" };
  if (eventName.length > TEMPLATE_LIMITS.eventName.max) {
    return { ok: false, error: "Event name is too long" };
  }

  const description = b.description == null || b.description === ""
    ? null
    : String(b.description).trim().slice(0, TEMPLATE_LIMITS.description.max);

  const kind = b.kind === "simple" ? "simple" : b.kind === "match" ? "match" : null;
  if (!kind) return { ok: false, error: "Kind must be 'match' or 'simple'" };

  const squad1Name =
    trimmed(b.squad1Name).slice(0, TEMPLATE_LIMITS.squadName.max) || "Squad 1";
  const squad2Name =
    trimmed(b.squad2Name).slice(0, TEMPLATE_LIMITS.squadName.max) || "Squad 2";

  const maxPlayers = clampInt(
    b.maxPlayers,
    TEMPLATE_LIMITS.maxPlayers.min,
    TEMPLATE_LIMITS.maxPlayers.max,
    20
  );
  const maxBackups = clampInt(
    b.maxBackups,
    TEMPLATE_LIMITS.maxBackups.min,
    TEMPLATE_LIMITS.maxBackups.max,
    10
  );
  const leadershipSlots = clampInt(
    b.leadershipSlots,
    TEMPLATE_LIMITS.leadershipSlots.min,
    TEMPLATE_LIMITS.leadershipSlots.max,
    3
  );

  const durationRaw = b.durationMinutes;
  const durationMinutes =
    durationRaw == null || durationRaw === "" || durationRaw === 0
      ? null
      : clampInt(durationRaw, 1, 1440, 0) || null;

  const window = parseSignupWindow(b);
  if (!window.ok) return window;

  const recurrence = parseRecurrence(b, kind);
  if (!recurrence.ok) return recurrence;

  return {
    ok: true,
    value: {
      templateName,
      eventName,
      description,
      kind,
      squad1Name,
      squad2Name,
      maxPlayers,
      maxBackups,
      leadershipSlots,
      durationMinutes,
      ...window.value,
      ...recurrence.value,
    },
  };
}

// Recurrence config, validated against `kind` since simple events use a
// single start time and match events use per-squad start times. Returns
// all-null fields (isRecurring: false) when the admin didn't opt in.
function parseRecurrence(
  b: Record<string, unknown>,
  kind: "match" | "simple"
):
  | {
      ok: true;
      value: {
        isRecurring: boolean;
        recurrenceIntervalWeeks: number | null;
        recurrenceAnchorWeekday: number | null;
        recurrenceStartTimeUtc: string | null;
        recurrenceSquad1TimeUtc: string | null;
        recurrenceSquad2TimeUtc: string | null;
        recurrenceEndType: "never" | "after_count" | "until_date" | null;
        recurrenceCount: number | null;
        recurrenceUntil: string | null;
      };
    }
  | { ok: false; error: string } {
  const empty = {
    isRecurring: false,
    recurrenceIntervalWeeks: null,
    recurrenceAnchorWeekday: null,
    recurrenceStartTimeUtc: null,
    recurrenceSquad1TimeUtc: null,
    recurrenceSquad2TimeUtc: null,
    recurrenceEndType: null,
    recurrenceCount: null,
    recurrenceUntil: null,
  };
  if (!b.isRecurring) return { ok: true, value: empty };

  const intervalWeeks = clampInt(b.recurrenceIntervalWeeks, 1, 52, 1);

  const anchorRaw = b.recurrenceAnchorWeekday;
  const anchorWeekday = typeof anchorRaw === "number" ? anchorRaw : Number(anchorRaw);
  if (!isValidWeekday(anchorWeekday)) {
    return { ok: false, error: "Recurring series requires a weekday." };
  }

  let startTimeUtc: string | null = null;
  let squad1TimeUtc: string | null = null;
  let squad2TimeUtc: string | null = null;
  if (kind === "simple") {
    if (!isValidTimeUtc(b.recurrenceStartTimeUtc)) {
      return { ok: false, error: "Recurring series requires a start time." };
    }
    startTimeUtc = b.recurrenceStartTimeUtc;
  } else {
    if (!isValidTimeUtc(b.recurrenceSquad1TimeUtc)) {
      return { ok: false, error: "Recurring series requires a Squad 1 start time." };
    }
    squad1TimeUtc = b.recurrenceSquad1TimeUtc;
    if (b.recurrenceSquad2TimeUtc != null && b.recurrenceSquad2TimeUtc !== "") {
      if (!isValidTimeUtc(b.recurrenceSquad2TimeUtc)) {
        return { ok: false, error: "Squad 2 start time must be HH:MM (24h UTC)." };
      }
      squad2TimeUtc = b.recurrenceSquad2TimeUtc;
    }
  }

  const endType =
    b.recurrenceEndType === "after_count"
      ? "after_count"
      : b.recurrenceEndType === "until_date"
        ? "until_date"
        : "never";

  let recurrenceCount: number | null = null;
  let recurrenceUntil: string | null = null;
  if (endType === "after_count") {
    const n = typeof b.recurrenceCount === "number" ? b.recurrenceCount : Number(b.recurrenceCount);
    if (!Number.isInteger(n) || n < 1) {
      return { ok: false, error: "Occurrence count must be at least 1." };
    }
    recurrenceCount = n;
  } else if (endType === "until_date") {
    if (typeof b.recurrenceUntil !== "string" || b.recurrenceUntil === "") {
      return { ok: false, error: "An end date is required." };
    }
    const d = new Date(b.recurrenceUntil);
    if (Number.isNaN(d.getTime())) {
      return { ok: false, error: "End date is invalid." };
    }
    recurrenceUntil = d.toISOString();
  }

  return {
    ok: true,
    value: {
      isRecurring: true,
      recurrenceIntervalWeeks: intervalWeeks,
      recurrenceAnchorWeekday: anchorWeekday,
      recurrenceStartTimeUtc: startTimeUtc,
      recurrenceSquad1TimeUtc: squad1TimeUtc,
      recurrenceSquad2TimeUtc: squad2TimeUtc,
      recurrenceEndType: endType,
      recurrenceCount,
      recurrenceUntil,
    },
  };
}

function parseSignupWindow(b: Record<string, unknown>):
  | {
      ok: true;
      value: {
        signupOpensWeekday: number | null;
        signupOpensTimeUtc: string | null;
        signupClosesWeekday: number | null;
        signupClosesTimeUtc: string | null;
      };
    }
  | { ok: false; error: string } {
  // Pair-wise rule: weekday + time-of-day must both be set or both be null
  // for each side (opens / closes). Half-set state is meaningless.
  const result = {
    signupOpensWeekday: null as number | null,
    signupOpensTimeUtc: null as string | null,
    signupClosesWeekday: null as number | null,
    signupClosesTimeUtc: null as string | null,
  };

  const validatePair = (
    weekdayKey: "signupOpensWeekday" | "signupClosesWeekday",
    timeKey: "signupOpensTimeUtc" | "signupClosesTimeUtc",
    label: string
  ): string | null => {
    const wRaw = b[weekdayKey];
    const tRaw = b[timeKey];
    const wEmpty = wRaw == null || wRaw === "";
    const tEmpty = tRaw == null || tRaw === "";
    if (wEmpty && tEmpty) return null; // both unset — fine
    if (wEmpty || tEmpty) {
      return `${label} weekday and time must both be set, or both blank.`;
    }
    const w = typeof wRaw === "number" ? wRaw : Number(wRaw);
    if (!isValidWeekday(w)) return `${label} weekday must be 0-6 (Sun-Sat).`;
    if (!isValidTimeUtc(tRaw)) {
      return `${label} time must be HH:MM (24h UTC).`;
    }
    result[weekdayKey] = w;
    result[timeKey] = tRaw;
    return null;
  };

  const opensErr = validatePair(
    "signupOpensWeekday",
    "signupOpensTimeUtc",
    "Signup opens"
  );
  if (opensErr) return { ok: false, error: opensErr };
  const closesErr = validatePair(
    "signupClosesWeekday",
    "signupClosesTimeUtc",
    "Signup closes"
  );
  if (closesErr) return { ok: false, error: closesErr };

  return { ok: true, value: result };
}

function trimmed(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
