import { db } from "@/db";
import { events, guilds, signups } from "@/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
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

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ guildId?: string; past?: string }>;
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
  const { guildId: requestedGuildId, past: pastParam } = await searchParams;
  const showPast = pastParam === "1";
  const targetGuildId = await resolveAdminGuildId(membership, requestedGuildId);
  if (!targetGuildId) redirect("/guilds");

  const isImpersonating =
    membership.isSuperAdmin && targetGuildId !== membership.guildId;
  const actingGuild = isImpersonating
    ? await db.query.guilds.findFirst({ where: eq(guilds.id, targetGuildId) })
    : null;

  const allGuildEvents = await db
    .select()
    .from(events)
    .where(and(eq(events.guildId, targetGuildId), isNull(events.deletedAt)));

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
  const guildEvents = showPast ? pastEvents : upcomingEvents;

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

  // Only offer the bulk calendar export when at least one event actually has
  // a scheduled time — otherwise the .ics endpoint would 404.
  const hasAnyScheduled = guildEvents.some((e) =>
    e.kind === "match"
      ? !!e.squad1StartsAt || !!e.squad2StartsAt
      : !!e.gameTime
  );

  return (
    <div className="mx-auto max-w-3xl">
      {isImpersonating && actingGuild && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Acting as admin of <strong>{actingGuild.name}</strong> (super-admin override).
        </div>
      )}
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          {actingGuild ? `${actingGuild.name} — ${t("title")}` : t("title")}
        </h1>
        {hasAnyScheduled && !showPast && (
          <CalendarDownloadLink
            href="/api/events/all/ics"
            label={t("addAllToCalendar")}
          />
        )}
      </div>

      <EventsTabs
        showPast={showPast}
        upcomingCount={upcomingEvents.length}
        pastCount={pastEvents.length}
        guildIdParam={isImpersonating ? targetGuildId : null}
        upcomingLabel={t("upcoming")}
        pastLabel={t("past")}
      />

      {guildEvents.length === 0 ? (
        <p className="text-gray-500">
          {showPast ? t("noPastEvents") : t("noEvents")}
        </p>
      ) : (
        <div className="space-y-3">
          {guildEvents.map((event) => {
            const isOpen =
              (!event.signupOpens || event.signupOpens <= nowIso) &&
              (!event.signupCloses || event.signupCloses > nowIso);
            const isMatch = event.kind === "match";
            const isScrim = event.kind === "scrim";
            const hasRoster = isMatch || isScrim;
            const signedUp = signedUpEventIds.has(event.id);
            const needsAction = hasRoster && isOpen && !signedUp;

            return (
              <Link
                key={event.id}
                href={`/event/${event.id}`}
                className={`block rounded-lg border bg-white p-4 transition-colors ${
                  needsAction
                    ? "border-violet-300 ring-1 ring-violet-200 hover:border-violet-500 hover:ring-violet-300"
                    : signedUp
                      ? "border-gray-200 opacity-80 hover:opacity-100 hover:border-gray-300"
                      : "border-gray-200 hover:border-violet-400"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold text-gray-900">
                        {event.name}
                      </h2>
                      {isScrim && (
                        <span className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700">
                          Scrim
                        </span>
                      )}
                    </div>
                    {event.description && !isScrim && (
                      <p className="mt-1 text-sm text-gray-600">{event.description}</p>
                    )}
                    {event.kind === "simple" && event.gameTime && (
                      <p className="mt-1 text-xs text-gray-500">
                        {t("starts")}: <DateTime iso={event.gameTime} showUTC={false} />
                      </p>
                    )}
                    {isScrim && event.gameTime && (
                      <p className="mt-1 text-xs text-gray-500">
                        {t("starts")}:{" "}
                        <DateTime iso={event.gameTime} showUTC={false} />
                      </p>
                    )}
                    {isMatch && (
                      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-500">
                        {squadTimes(event).map((s) => (
                          <span key={s.name}>
                            {s.name}:{" "}
                            {s.startsAt ? (
                              <DateTime iso={s.startsAt} showUTC={false} />
                            ) : (
                              <span className="font-mono text-gray-400">{t("tbd")}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {hasRoster && signedUp && (
                      <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                        {t("signedUp")}
                      </span>
                    )}
                    {hasRoster && !signedUp && isOpen && (
                      <span className="rounded border border-violet-300 bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-700">
                        {t("signUp")}
                      </span>
                    )}
                    <span
                      className={`rounded px-2 py-1 text-xs font-medium ${
                        isOpen
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {isOpen ? t("open") : t("closed")}
                    </span>
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
  showPast,
  upcomingCount,
  pastCount,
  guildIdParam,
  upcomingLabel,
  pastLabel,
}: {
  showPast: boolean;
  upcomingCount: number;
  pastCount: number;
  guildIdParam: string | null;
  upcomingLabel: string;
  pastLabel: string;
}) {
  const upcomingHref = guildIdParam ? `/?guildId=${guildIdParam}` : "/";
  const pastHref = guildIdParam
    ? `/?guildId=${guildIdParam}&past=1`
    : "/?past=1";
  return (
    <div className="mb-4 flex gap-1 border-b border-gray-200 text-sm font-semibold">
      <Tab href={upcomingHref} active={!showPast}>
        {upcomingLabel} ({upcomingCount})
      </Tab>
      <Tab href={pastHref} active={showPast}>
        {pastLabel} ({pastCount})
      </Tab>
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
          ? "border-violet-600 text-violet-700"
          : "border-transparent text-gray-500 hover:text-gray-700"
      }`}
    >
      {children}
    </Link>
  );
}
