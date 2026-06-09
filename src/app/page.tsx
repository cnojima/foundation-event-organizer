import { db } from "@/db";
import { events, guilds, signups } from "@/db/schema";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { requireSignedInPage, resolveAdminGuildId } from "@/lib/rbac";
import { DateTime } from "@/components/date-time";
import { CalendarDownloadLink } from "@/components/calendar-download-link";
import {
  effectiveStartIso,
  isEventPast,
  squadTimes,
} from "@/lib/event-times";
import { LandingPage } from "@/components/landing-page";
import { PageHeader } from "@/components/page-header";
import { EventKindHero } from "@/components/event-kind-icon";
import { WeekCalendar, type CalendarEntry } from "@/components/week-calendar";
import { loadSetupState } from "@/lib/setup-state";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ guildId?: string; tab?: string; view?: string }>;
}) {
  const session = await auth();
  // Signed-out visitors get the public marketing landing instead of being
  // bounced to Auth.js's bare provider picker. The landing's CTA still
  // routes through /api/auth/signin — we just give them context first.
  if (!session?.user) {
    return <LandingPage />;
  }
  const membership = requireSignedInPage(session);

  const cookieStore = await cookies();
  if (!cookieStore.get("help_viewed")) redirect("/help");

  // Super-admins can pin a target guild via ?guildId=. Regular users always
  // resolve back to their own guildId.
  const { guildId: requestedGuildId, tab: tabParam, view: viewParam } = await searchParams;
  const tab: "upcoming" | "past" | "deleted" =
    tabParam === "past" ? "past" : tabParam === "deleted" ? "deleted" : "upcoming";
  const view: "list" | "calendar" =
    viewParam === "calendar" ? "calendar" : "list";
  const targetGuildId = await resolveAdminGuildId(membership, requestedGuildId);
  if (!targetGuildId) redirect("/guilds");

  const isImpersonating =
    membership.isSuperAdmin && targetGuildId !== membership.guildId;
  const actingGuild = isImpersonating
    ? await db.query.guilds.findFirst({ where: eq(guilds.id, targetGuildId) })
    : null;

  // Admin of the *target* guild. Super-admins are implicitly admin everywhere
  // (matches the rbac.ts page-guard convention). Drives:
  //   - +New event button visibility
  //   - kind badge + Created-on metadata on cards
  //   - Deleted tab visibility + query
  const isAdmin =
    membership.isSuperAdmin ||
    (membership.guildRole === "admin" && membership.guildId === targetGuildId);

  const allGuildEvents = await db
    .select()
    .from(events)
    .where(and(eq(events.guildId, targetGuildId), isNull(events.deletedAt)));

  // Deleted events: queried lazily — only admins ever see them, only when the
  // Deleted tab is active (or to compute the tab badge count).
  const deletedEvents = isAdmin
    ? await db
        .select()
        .from(events)
        .where(
          and(eq(events.guildId, targetGuildId), isNotNull(events.deletedAt))
        )
    : [];

  // Partition by derived end time (latest scheduled time + 6h padding —
  // see effectiveEndIso). Events with nothing scheduled are treated as
  // upcoming (still being planned). Sort: upcoming ascending by start
  // (closest first), past descending by start (most recent first).
  const now = new Date();
  const upcomingEvents: typeof allGuildEvents = [];
  const pastEvents: typeof allGuildEvents = [];
  for (const e of allGuildEvents) {
    (isEventPast(e, now) ? pastEvents : upcomingEvents).push(e);
  }
  const FAR_FUTURE = "9999";
  upcomingEvents.sort(
    (a, b) =>
      (effectiveStartIso(a) ?? FAR_FUTURE).localeCompare(
        effectiveStartIso(b) ?? FAR_FUTURE
      )
  );
  pastEvents.sort(
    (a, b) =>
      (effectiveStartIso(b) ?? "").localeCompare(effectiveStartIso(a) ?? "")
  );
  // Deleted: sort by deletedAt desc (most recently deleted first).
  deletedEvents.sort((a, b) =>
    (b.deletedAt ?? "").localeCompare(a.deletedAt ?? "")
  );

  // Calendar entries: built from ALL guild events so navigating to a past week
  // still shows events that fell in that window. The WeekCalendar filters to
  // the displayed week via sameDay(), so only visible entries are rendered.
  const calendarEntries: CalendarEntry[] = [];
  for (const e of allGuildEvents) {
    const dur = (e.durationMinutes ?? 60) * 60_000;
    if (e.kind === "match") {
      if (e.squad1StartsAt) {
        calendarEntries.push({
          eventId: e.id, name: e.name, kind: "match",
          startIso: e.squad1StartsAt,
          endIso: new Date(new Date(e.squad1StartsAt).getTime() + dur).toISOString(),
          label: e.squad1Name,
        });
      }
      if (e.squad2StartsAt) {
        calendarEntries.push({
          eventId: e.id, name: e.name, kind: "match",
          startIso: e.squad2StartsAt,
          endIso: new Date(new Date(e.squad2StartsAt).getTime() + dur).toISOString(),
          label: e.squad2Name,
        });
      }
    } else if (e.gameTime) {
      calendarEntries.push({
        eventId: e.id, name: e.name, kind: e.kind as "simple" | "scrim",
        startIso: e.gameTime,
        endIso: new Date(new Date(e.gameTime).getTime() + dur).toISOString(),
        label: null,
      });
    }
  }

  // Unscheduled: upcoming-only. Past events with no time have nowhere to land
  // on the grid and aren't actionable, so they stay out of this list.
  const calendarUnscheduled: { eventId: string; name: string; kind: string }[] = [];
  for (const e of upcomingEvents) {
    if (e.kind === "match" ? !e.squad1StartsAt && !e.squad2StartsAt : !e.gameTime) {
      calendarUnscheduled.push({ eventId: e.id, name: e.name, kind: e.kind });
    }
  }

  const guildEvents =
    tab === "deleted"
      ? deletedEvents
      : tab === "past"
        ? pastEvents
        : upcomingEvents;

  // Which of those events has the current user already signed up for? Drives
  // the "needs your attention" emphasis on cards below. Includes scrim events
  // since they accept signups too.
  const signedUpEventIds = new Set<string>();
  if (guildEvents.length > 0) {
    const rosterEventIds = guildEvents
      .filter((e) => e.kind === "match" || e.kind === "scrim")
      .map((e) => e.id);
    if (rosterEventIds.length > 0) {
      const rows = await db
        .select({ eventId: signups.eventId })
        .from(signups)
        .where(
          and(
            eq(signups.userId, membership.userId),
            inArray(signups.eventId, rosterEventIds),
            isNull(signups.deletedAt)
          )
        );
      for (const r of rows) signedUpEventIds.add(r.eventId);
    }
  }

  const nowIso = now.toISOString();
  const t = await getTranslations("events");
  const tAdmin = await getTranslations("admin");
  const tHeader = await getTranslations("pageHeader.kicker");

  // Only offer the bulk calendar export when at least one event actually has
  // a scheduled time — otherwise the .ics endpoint would 404.
  const hasAnyScheduled = guildEvents.some((e) =>
    e.kind === "match"
      ? !!e.squad1StartsAt || !!e.squad2StartsAt
      : !!e.gameTime
  );

  // Preserve the impersonation pin across links emitted on this page so a
  // super-admin "Acting as X" doesn't jump back to their own guild on the
  // next click.
  const guildIdParam = isImpersonating ? targetGuildId : null;
  const queryString = (extra: Record<string, string>) => {
    const parts: string[] = [];
    if (guildIdParam) parts.push(`guildId=${guildIdParam}`);
    if (view !== "list" && !("view" in extra)) parts.push(`view=${view}`);
    for (const [k, v] of Object.entries(extra)) if (v) parts.push(`${k}=${v}`);
    return parts.length > 0 ? `?${parts.join("&")}` : "";
  };
  const viewHref = (v: "list" | "calendar") => {
    const parts: string[] = [];
    if (guildIdParam) parts.push(`guildId=${guildIdParam}`);
    if (tab !== "upcoming") parts.push(`tab=${tab}`);
    if (v !== "list") parts.push(`view=${v}`);
    return parts.length > 0 ? `/?${parts.join("&")}` : "/";
  };
  const newEventHref = `/admin/event/new${queryString({})}`;

  // Setup-progress banner: only shown to admins, only while required steps
  // remain. Computed from current DB state so it auto-disappears when the
  // last required item is satisfied.
  const setupState = isAdmin ? await loadSetupState(targetGuildId) : null;
  const showSetupBanner = setupState !== null && !setupState.isComplete;

  return (
    <div className="mx-auto max-w-3xl">
      {isImpersonating && actingGuild && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          Acting as admin of <strong>{actingGuild.name}</strong> (super-admin override).
        </div>
      )}
      {showSetupBanner && setupState && (
        <Link
          href={`/admin/setup${queryString({})}`}
          className="mb-4 flex items-center justify-between gap-3 rounded-md border border-violet-300 bg-violet-50 px-4 py-3 text-sm text-violet-900 transition-colors hover:bg-violet-100 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-200 dark:hover:bg-violet-900/40"
        >
          <span>
            <strong>Guild setup</strong>: {setupState.requiredDone} /{" "}
            {setupState.requiredTotal} required steps complete. Finish the
            checklist to enable Discord reminders + voice DMs.
          </span>
          <span aria-hidden className="shrink-0 font-semibold">
            Continue →
          </span>
        </Link>
      )}
      <PageHeader
        kicker={tHeader("events")}
        title={actingGuild ? `${actingGuild.name} — ${t("title")}` : t("title")}
        rightSlot={
          <div className="flex items-center gap-2">
            {hasAnyScheduled && tab === "upcoming" && (
              <CalendarDownloadLink
                href="/api/events/all/ics"
                label={t("addAllToCalendar")}
              />
            )}
            {isAdmin && (
              <Link
                href={newEventHref}
                className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-700"
              >
                {tAdmin("newEvent")}
              </Link>
            )}
          </div>
        }
      />

      <div className="mb-4 flex items-end justify-between gap-3">
        <EventsTabs
          tab={tab}
          upcomingCount={upcomingEvents.length}
          pastCount={pastEvents.length}
          showDeleted={isAdmin}
          guildIdParam={guildIdParam}
          upcomingLabel={t("upcoming")}
          pastLabel={t("past")}
          deletedLabel={tAdmin("deleted", { count: deletedEvents.length })}
        />
        {tab === "upcoming" && (
          <div className="mb-1 flex shrink-0 gap-1 text-xs font-semibold">
            <Link
              href={viewHref("list")}
              className={`flex items-center gap-1 rounded border px-2 py-1 ${
                view === "list"
                  ? "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300"
                  : "border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
              }`}
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="size-3.5" aria-hidden>
                <rect x="1" y="2" width="14" height="2.5" rx="1" />
                <rect x="1" y="6.75" width="14" height="2.5" rx="1" />
                <rect x="1" y="11.5" width="14" height="2.5" rx="1" />
              </svg>
              List
            </Link>
            <Link
              href={viewHref("calendar")}
              className={`flex items-center gap-1 rounded border px-2 py-1 ${
                view === "calendar"
                  ? "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300"
                  : "border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
              }`}
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="size-3.5" aria-hidden>
                <path d="M4 1a1 1 0 0 1 2 0v1h4V1a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h1V1zm-1 5v7h10V6H3z" />
              </svg>
              Calendar
            </Link>
          </div>
        )}
      </div>

      {tab === "upcoming" && view === "calendar" ? (
        <WeekCalendar entries={calendarEntries} unscheduled={calendarUnscheduled} />
      ) : guildEvents.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">
          {tab === "deleted"
            ? tAdmin("deletedKept")
            : tab === "past"
              ? t("noPastEvents")
              : t("noEvents")}
        </p>
      ) : (
        <div className="space-y-3">
          {guildEvents.map((event) => {
            const isDeleted = !!event.deletedAt;
            const isOpen =
              !isDeleted &&
              (!event.signupOpens || event.signupOpens <= nowIso) &&
              (!event.signupCloses || event.signupCloses > nowIso);
            const isMatch = event.kind === "match";
            const isScrim = event.kind === "scrim";
            const isSimple = event.kind === "simple";
            const hasRoster = isMatch || isScrim;
            const signedUp = signedUpEventIds.has(event.id);
            // Highlight "needs action" only for non-admins — admins are
            // browsing to manage, not to sign themselves up.
            const needsAction =
              !isAdmin && !isDeleted && hasRoster && isOpen && !signedUp;

            return (
              <Link
                key={event.id}
                href={`/event/${event.id}`}
                className={`group block rounded-lg border bg-white p-4 transition-all duration-150 hover:-translate-y-px hover:shadow-md dark:bg-gray-900 dark:hover:shadow-violet-950/40 ${
                  isDeleted
                    ? "border-gray-200 opacity-60 hover:opacity-100 hover:border-gray-400 dark:border-gray-800 dark:hover:border-gray-700"
                    : needsAction
                      ? "border-violet-300 ring-1 ring-violet-200 hover:border-violet-500 hover:ring-violet-300 dark:border-violet-900/60 dark:ring-violet-900/60 dark:hover:border-violet-700 dark:hover:ring-violet-800"
                      : signedUp
                        ? "border-gray-200 opacity-80 hover:opacity-100 hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700"
                        : "border-gray-200 hover:border-violet-400 dark:border-gray-800 dark:hover:border-violet-700"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    {/* Kind icon tile carries the same visual signal as the
                        large hero on the detail view, so the listing card
                        feels like a preview of where the click lands. The
                        previous text kind-badges (Scrim/Match/Simple) are
                        dropped in favor of this single icon. */}
                    <EventKindHero
                      kind={event.kind}
                      size="sm"
                      label={`${event.kind} event`}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <h2
                          className={`text-lg font-semibold text-gray-900 dark:text-gray-100 ${isDeleted ? "line-through" : ""}`}
                        >
                          {event.name}
                        </h2>
                        {event.globalEventId && (
                          <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
                            Global
                          </span>
                        )}
                        {isDeleted && (
                          <span className="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                            Deleted
                          </span>
                        )}
                      </div>
                    {event.description && !isScrim && (
                      <div className="mt-1 text-sm text-gray-600 dark:text-gray-400 prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: event.description }} />
                    )}
                    {isSimple && event.gameTime && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {t("starts")}: <DateTime iso={event.gameTime} showUTC={false} />
                      </p>
                    )}
                    {isScrim && event.gameTime && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {t("starts")}:{" "}
                        <DateTime iso={event.gameTime} showUTC={false} />
                      </p>
                    )}
                    {isMatch && (
                      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-500 dark:text-gray-400">
                        {squadTimes(event).map((s) => (
                          <span key={s.name}>
                            {s.name}:{" "}
                            {s.startsAt ? (
                              <DateTime iso={s.startsAt} showUTC={false} />
                            ) : (
                              <span className="font-mono text-gray-400 dark:text-gray-500">{t("tbd")}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                    {isAdmin && (
                      <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
                        {tAdmin("createdOn", {
                          date: new Date(event.createdAt).toLocaleDateString(),
                        })}
                      </p>
                    )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {!isDeleted && hasRoster && signedUp && (
                      <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                        {t("signedUp")}
                      </span>
                    )}
                    {!isDeleted && !isAdmin && hasRoster && !signedUp && isOpen && (
                      <span className="rounded border border-violet-300 bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300">
                        {t("signUp")}
                      </span>
                    )}
                    {!isDeleted && (
                      <span
                        className={`rounded px-2 py-1 text-xs font-medium ${
                          isOpen
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                        }`}
                      >
                        {isOpen ? t("open") : t("closed")}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EventsTabs({
  tab,
  upcomingCount,
  pastCount,
  showDeleted,
  guildIdParam,
  upcomingLabel,
  pastLabel,
  deletedLabel,
}: {
  tab: "upcoming" | "past" | "deleted";
  upcomingCount: number;
  pastCount: number;
  showDeleted: boolean;
  guildIdParam: string | null;
  upcomingLabel: string;
  pastLabel: string;
  // Already formatted as "Deleted (N)" by the caller via tAdmin("deleted", { count }).
  deletedLabel: string;
}) {
  const tabHref = (which: "upcoming" | "past" | "deleted") => {
    const parts: string[] = [];
    if (guildIdParam) parts.push(`guildId=${guildIdParam}`);
    if (which !== "upcoming") parts.push(`tab=${which}`);
    return parts.length > 0 ? `/?${parts.join("&")}` : "/";
  };
  return (
    <div className="flex gap-1 border-b border-gray-200 text-sm font-semibold dark:border-gray-800">
      <Tab href={tabHref("upcoming")} active={tab === "upcoming"}>
        {upcomingLabel} ({upcomingCount})
      </Tab>
      <Tab href={tabHref("past")} active={tab === "past"}>
        {pastLabel} ({pastCount})
      </Tab>
      {showDeleted && (
        <Tab href={tabHref("deleted")} active={tab === "deleted"}>
          {deletedLabel}
        </Tab>
      )}
    </div>
  );
}

function Tab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`-mb-px border-b-2 px-3 py-2 transition-colors ${
        active
          ? "border-violet-600 text-violet-700 dark:border-violet-500 dark:text-violet-300"
          : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      }`}
    >
      {children}
    </Link>
  );
}
