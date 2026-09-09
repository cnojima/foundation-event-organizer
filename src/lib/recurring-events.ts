import { db } from "@/db";
import { eventTemplates, events } from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { generateId } from "@/lib/ids";
import { logAudit } from "@/lib/audit";
import { addWeeksToIso, snapSignupTime, withTimeUtc } from "@/lib/event-templates-shared";

type EventTemplateRow = typeof eventTemplates.$inferSelect;
type EventRow = typeof events.$inferSelect;

export type GenerationOutcome =
  | "generated"
  | "series_ended"
  | "skipped_upcoming"
  | "skipped_no_occurrence"
  | "error";

export type GenerationResult = {
  templateId: string;
  outcome: GenerationOutcome;
  // Present only when outcome is "generated" — the caller (the bot's poll
  // loop) uses this to send the same "created" Discord notification a
  // manually-created event gets. Kept out of this module to avoid a
  // circular import (discord-bot.ts -> here -> discord-bot.ts).
  event?: EventRow;
};

// Latest scheduled moment for an occurrence — whichever of gameTime /
// squad1StartsAt / squad2StartsAt is populated (kind-dependent) and latest.
// Used to decide whether an occurrence has fully happened yet.
function effectiveEnd(event: EventRow): number | null {
  const times = [event.gameTime, event.squad1StartsAt, event.squad2StartsAt]
    .filter((v): v is string => Boolean(v))
    .map((v) => new Date(v).getTime())
    .filter((t) => !Number.isNaN(t));
  return times.length ? Math.max(...times) : null;
}

// Scans every live recurring template and generates the next occurrence for
// any whose current one has been cancelled or has fully passed. Keeps
// exactly one future occurrence materialized per series ("one ahead at a
// time") — called from the bot's poll loop, but has no Discord dependency
// itself beyond the notification it sends after inserting a new event.
export async function generateDueRecurringOccurrences(): Promise<GenerationResult[]> {
  const templates = await db.query.eventTemplates.findMany({
    where: and(
      eq(eventTemplates.isRecurring, true),
      eq(eventTemplates.seriesActive, true),
      isNull(eventTemplates.deletedAt)
    ),
  });

  const results: GenerationResult[] = [];
  for (const template of templates) {
    try {
      results.push(await maybeGenerateNextOccurrence(template));
    } catch (err) {
      console.error(
        `[recurring-events] generation failed template=${template.id}:`,
        err
      );
      results.push({ templateId: template.id, outcome: "error" });
    }
  }
  return results;
}

async function maybeGenerateNextOccurrence(
  template: EventTemplateRow
): Promise<GenerationResult> {
  // The first occurrence of a series is created directly by an admin
  // applying the template (a separate flow) — the generator only ever
  // extends an already-live series, never starts one.
  const latest = await db.query.events.findFirst({
    where: eq(events.seriesTemplateId, template.id),
    orderBy: [desc(events.createdAt)],
  });
  if (!latest) {
    return { templateId: template.id, outcome: "skipped_no_occurrence" };
  }

  if (!latest.deletedAt) {
    const end = effectiveEnd(latest);
    // No computable end time shouldn't happen for a series occurrence, but
    // fail safe by treating it as "still upcoming" rather than double-firing.
    if (end === null || end > Date.now()) {
      return { templateId: template.id, outcome: "skipped_upcoming" };
    }
  }

  const base =
    template.recurrenceLastGeneratedStartAt ??
    latest.squad1StartsAt ??
    latest.gameTime;
  const intervalWeeks = template.recurrenceIntervalWeeks ?? 1;
  const nextStart = base ? addWeeksToIso(base, intervalWeeks) : null;
  if (!nextStart) {
    console.error(
      `[recurring-events] template=${template.id} has no computable next start; ending series`
    );
    await endSeries(template.id);
    return { templateId: template.id, outcome: "series_ended" };
  }

  const nextCount = template.recurrenceOccurrencesGenerated + 1;
  const endReached =
    (template.recurrenceEndType === "after_count" &&
      template.recurrenceCount != null &&
      nextCount > template.recurrenceCount) ||
    (template.recurrenceEndType === "until_date" &&
      template.recurrenceUntil != null &&
      new Date(nextStart).getTime() > new Date(template.recurrenceUntil).getTime());

  if (endReached) {
    await endSeries(template.id);
    return { templateId: template.id, outcome: "series_ended" };
  }

  const isMatch = template.kind === "match";
  const gameTime = isMatch ? null : nextStart;
  const squad1StartsAt = isMatch ? nextStart : null;
  const squad2StartsAt =
    isMatch && template.recurrenceSquad2TimeUtc
      ? withTimeUtc(nextStart, template.recurrenceSquad2TimeUtc)
      : null;

  const signupOpens =
    template.signupOpensWeekday != null && template.signupOpensTimeUtc
      ? snapSignupTime(nextStart, template.signupOpensWeekday, template.signupOpensTimeUtc)
      : null;
  const signupCloses =
    template.signupClosesWeekday != null && template.signupClosesTimeUtc
      ? snapSignupTime(nextStart, template.signupClosesWeekday, template.signupClosesTimeUtc)
      : null;

  const event = {
    id: generateId(),
    guildId: template.guildId,
    name: template.eventName,
    description: template.description,
    gameTime,
    durationMinutes: template.durationMinutes,
    squad1StartsAt,
    squad2StartsAt,
    signupOpens,
    signupCloses,
    kind: template.kind,
    squad1Name: template.squad1Name,
    squad2Name: template.squad2Name,
    maxPlayers: template.maxPlayers,
    maxBackups: template.maxBackups,
    leadershipSlots: template.leadershipSlots,
    createdAt: new Date().toISOString(),
    seriesTemplateId: template.id,
  };

  const [insertedEvent] = await db.insert(events).values(event).returning();

  await db
    .update(eventTemplates)
    .set({
      recurrenceLastGeneratedStartAt: nextStart,
      recurrenceOccurrencesGenerated: nextCount,
    })
    .where(eq(eventTemplates.id, template.id));

  void logAudit({
    guildId: template.guildId,
    actorUserId: null,
    actorDisplay: "(system)",
    action: "event.create",
    entityType: "event",
    entityId: event.id,
    entityLabel: event.name,
    changes: {
      after: { kind: event.kind, name: event.name, seriesTemplateId: template.id },
    },
  });

  // Caller (the bot's poll loop) sends the "created" Discord notification —
  // sendEventNotification lives in discord-bot.ts, which imports this module,
  // so calling it from here would create a circular import.
  return { templateId: template.id, outcome: "generated", event: insertedEvent };
}

async function endSeries(templateId: string): Promise<void> {
  await db
    .update(eventTemplates)
    .set({ seriesActive: false })
    .where(eq(eventTemplates.id, templateId));
}
