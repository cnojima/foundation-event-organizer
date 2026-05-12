import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { duelProposals, events, guilds, users } from "@/db/schema";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { LocaleSwitcher } from "@/components/locale-switcher";

// Public landing page for signed-out visitors. Mock screenshots are styled
// inline (no image files) so the placeholders can be swapped for real
// captures later without touching layout. The mocks are visually opinionated
// — they mimic the actual app surfaces — so even before real screenshots
// land, the page reads as a serious tool, not boilerplate.
export async function LandingPage() {
  const t = await getTranslations("landing");

  // Real stat counters. If everything's zero we hide the stats strip
  // entirely — better to show nothing than "0 events run."
  const [guildsRow, eventsRow, duelsRow, usersRow] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(guilds)
      .where(isNull(guilds.deletedAt))
      .get(),
    db
      .select({ count: sql<number>`count(*)` })
      .from(events)
      .where(isNull(events.deletedAt))
      .get(),
    db
      .select({ count: sql<number>`count(*)` })
      .from(duelProposals)
      .where(
        and(
          eq(duelProposals.status, "accepted"),
          isNotNull(duelProposals.result)
        )
      )
      .get(),
    db.select({ count: sql<number>`count(*)` }).from(users).get(),
  ]);
  const stats = {
    guilds: Number(guildsRow?.count ?? 0),
    events: Number(eventsRow?.count ?? 0),
    duels: Number(duelsRow?.count ?? 0),
    players: Number(usersRow?.count ?? 0),
  };
  const showStats =
    stats.guilds + stats.events + stats.duels + stats.players > 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
      {/* ---- Locale switcher (top-right) ---- */}
      <div className="mb-6 flex justify-end">
        <LocaleSwitcher signedIn={false} />
      </div>

      {/* ---- Hero ---- */}
      <section className="text-center">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-violet-700">
          {t("hero.kicker")}
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
          {t("hero.headline")}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-gray-600 sm:text-lg">
          {t("hero.subhead")}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/api/auth/signin"
            className="rounded-md bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"
          >
            {t("hero.signIn")}
          </Link>
          <Link
            href="/guilds"
            className="rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            {t("hero.browseGuilds")}
          </Link>
        </div>
      </section>

      {/* ---- Stats strip (only when there's something to show) ---- */}
      {showStats && (
        <section className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat value={stats.guilds} label={t("stats.guilds")} />
          <Stat value={stats.events} label={t("stats.events")} />
          <Stat value={stats.duels} label={t("stats.duels")} />
          <Stat value={stats.players} label={t("stats.players")} />
        </section>
      )}

      {/* ---- The problem we solve (engagement) ---- */}
      <section className="mt-16 rounded-lg border border-violet-200 bg-violet-50/40 p-6">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-violet-700">
          {t("engagement.kicker")}
        </p>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">
          {t("engagement.heading")}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-gray-700">
          {t("engagement.body")}
        </p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          <EngagementPoint
            title={t("engagement.beforeTitle")}
            body={t("engagement.beforeBody")}
            tone="before"
          />
          <EngagementPoint
            title={t("engagement.afterTitle")}
            body={t("engagement.afterBody")}
            tone="after"
          />
          <EngagementPoint
            title={t("engagement.outcomeTitle")}
            body={t("engagement.outcomeBody")}
            tone="outcome"
          />
        </ul>
      </section>

      {/* ---- Features grid ---- */}
      <section className="mt-16">
        <h2 className="mb-6 text-center text-2xl font-bold tracking-tight text-gray-900">
          {t("features.heading")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            title={t("features.matches.title")}
            body={t("features.matches.body")}
          />
          <FeatureCard
            title={t("features.scrims.title")}
            body={t("features.scrims.body")}
          />
          <FeatureCard
            title={t("features.duels.title")}
            body={t("features.duels.body")}
          />
          <FeatureCard
            title={t("features.discord.title")}
            body={t("features.discord.body")}
          />
          <FeatureCard
            title={t("features.multiGuild.title")}
            body={t("features.multiGuild.body")}
          />
          <FeatureCard
            title={t("features.i18n.title")}
            body={t("features.i18n.body")}
          />
        </div>
      </section>

      {/* ---- Mock screenshots ---- */}
      <section className="mt-16 space-y-12">
        <h2 className="text-center text-2xl font-bold tracking-tight text-gray-900">
          {t("screenshots.heading")}
        </h2>

        <MockFrame
          caption={t("screenshots.eventAdmin")}
          urlPath="/admin/event/abc123"
        >
          <MockEventAdmin />
        </MockFrame>

        <MockFrame caption={t("screenshots.duels")} urlPath="/duels/xyz789">
          <MockDuelCard />
        </MockFrame>

        <MockFrame caption={t("screenshots.leaderboard")} urlPath="/leaderboard">
          <MockLeaderboard />
        </MockFrame>

        <MockFrame
          caption={t("screenshots.discord")}
          urlPath="discord.com — #shadowfront"
        >
          <MockDiscord />
        </MockFrame>
      </section>

      {/* ---- Bottom CTA ---- */}
      <section className="mt-16 rounded-lg border border-gray-200 bg-white p-8 text-center">
        <h2 className="text-xl font-bold tracking-tight text-gray-900">
          {t("bottomCta.heading")}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">
          {t("bottomCta.body")}
        </p>
        <Link
          href="/api/auth/signin"
          className="mt-4 inline-block rounded-md bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"
        >
          {t("hero.signIn")}
        </Link>
      </section>

      {/* ---- Footer ---- */}
      <footer className="mt-12 border-t border-gray-200 pt-6 text-center text-xs text-gray-500">
        <p>{t("footer.builtWith")}</p>
        <p className="mt-1">
          <a
            className="text-violet-700 hover:underline"
            href="https://github.com/anthropics/foundation-event-organizer"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("footer.viewSource")}
          </a>
          {" · "}
          <Link className="text-violet-700 hover:underline" href="/help">
            {t("footer.help")}
          </Link>
        </p>
      </footer>
    </div>
  );
}

// ---- Reusable pieces ----

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
      <p className="text-3xl font-bold tracking-tight text-gray-900">
        {value.toLocaleString()}
      </p>
      <p className="mt-1 text-xs font-bold uppercase tracking-[0.15em] text-gray-500">
        {label}
      </p>
    </div>
  );
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="font-semibold text-gray-900">{title}</h3>
      <p className="mt-1 text-sm text-gray-600">{body}</p>
    </div>
  );
}

// Before/After/Outcome triplet rendered as a small visual contrast inside
// the engagement section. The tone hint colors the heading to telegraph
// the framing without needing icons.
function EngagementPoint({
  title,
  body,
  tone,
}: {
  title: string;
  body: string;
  tone: "before" | "after" | "outcome";
}) {
  const titleColor =
    tone === "before"
      ? "text-red-700"
      : tone === "after"
        ? "text-violet-700"
        : "text-emerald-700";
  return (
    <li className="rounded-lg border border-gray-200 bg-white p-3">
      <p className={`text-[10px] font-bold uppercase tracking-[0.15em] ${titleColor}`}>
        {title}
      </p>
      <p className="mt-1 text-sm text-gray-700">{body}</p>
    </li>
  );
}

// Browser-chrome wrapper around a mock UI. Keeps the visual frame consistent
// across mocks so they read as "screenshots of the app" even though they're
// CSS-drawn.
function MockFrame({
  caption,
  urlPath,
  children,
}: {
  caption: string;
  urlPath: string;
  children: React.ReactNode;
}) {
  return (
    <figure>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2">
          <div className="flex gap-1">
            <span className="block size-2.5 rounded-full bg-red-300" />
            <span className="block size-2.5 rounded-full bg-amber-300" />
            <span className="block size-2.5 rounded-full bg-emerald-300" />
          </div>
          <span className="ml-2 truncate font-mono text-[10px] text-gray-400">
            {urlPath}
          </span>
        </div>
        <div className="bg-white p-4">{children}</div>
      </div>
      <figcaption className="mt-2 text-center text-sm text-gray-500">
        {caption}
      </figcaption>
    </figure>
  );
}

// ---- Mock 1: Event admin dashboard ----

function MockEventAdmin() {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Shadowfront May 17</h3>
        <span className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700">
          Match
        </span>
      </div>
      <div className="mb-4 grid grid-cols-4 gap-3 text-center text-xs">
        <div className="rounded border border-gray-200 p-2">
          <p className="text-lg font-bold">23/30</p>
          <p className="text-gray-500">Slots</p>
        </div>
        <div className="rounded border border-gray-200 p-2">
          <p className="text-lg font-bold">4</p>
          <p className="text-gray-500">Leaders</p>
        </div>
        <div className="rounded border border-gray-200 p-2">
          <p className="text-lg font-bold">2</p>
          <p className="text-gray-500">Waitlist</p>
        </div>
        <div className="rounded border border-gray-200 p-2">
          <p className="text-lg font-bold">17</p>
          <p className="text-gray-500">Attended</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <MockSquadRoster name="Alpha" rows={["NovaSpectre", "Voidhammer ★", "Ironclad"]} />
        <MockSquadRoster name="Bravo" rows={["Stormbreaker ★", "Cinderwake", "Nightshade"]} />
      </div>
    </div>
  );
}

function MockSquadRoster({ name, rows }: { name: string; rows: string[] }) {
  return (
    <div className="rounded border border-gray-200">
      <div className="border-b border-gray-100 bg-gray-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">
        {name}
      </div>
      <ul className="divide-y divide-gray-50">
        {rows.map((r) => (
          <li
            key={r}
            className="flex items-center gap-2 px-2 py-1.5 text-xs text-gray-700"
          >
            <span className="grid size-5 place-items-center rounded-full bg-violet-100 text-[9px] font-bold text-violet-700">
              {r.slice(0, 1)}
            </span>
            {r}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---- Mock 2: Duel matchup card ----

function MockDuelCard() {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <h3 className="font-semibold text-gray-900">Duel</h3>
        <span className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
          Result: You won
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <MockPlayerPanel
          label="Proposer (you)"
          name="[SHFT] NovaSpectre"
          tier="XI"
          rating={1182}
        />
        <MockPlayerPanel
          label="Opponent"
          name="[BETA] Stormbreaker"
          tier="X"
          rating={1241}
        />
      </div>
      <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
        <p>
          <strong>Time:</strong> Sat May 18, 8:00 PM
        </p>
        <p className="mt-0.5">
          <strong>Location:</strong> Kruger
        </p>
        <p className="mt-0.5">
          <strong>Win:</strong> First to 3 captures
        </p>
      </div>
    </div>
  );
}

function MockPlayerPanel({
  label,
  name,
  tier,
  rating,
}: {
  label: string;
  name: string;
  tier: string;
  rating: number;
}) {
  return (
    <div className="rounded border border-gray-200 p-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
        {label}
      </p>
      <div className="mt-1 flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">
          {name.replace(/\[.*?\]\s*/, "").slice(0, 1)}
        </span>
        <div>
          <p className="text-xs font-semibold text-gray-900">{name}</p>
          <p className="text-[10px] text-gray-500">
            Tier {tier} · {rating} rating
          </p>
        </div>
      </div>
    </div>
  );
}

// ---- Mock 3: Leaderboard ----

function MockLeaderboard() {
  const rows = [
    { rank: 1, name: "[SHFT] Voidhammer", rating: 1432, record: "18W · 4L" },
    { rank: 2, name: "[BETA] Cinderwake", rating: 1389, record: "15W · 6L · 1D" },
    { rank: 3, name: "[SHFT] Stormbreaker", rating: 1321, record: "12W · 7L" },
    { rank: 4, name: "[GMMA] Ironclad", rating: 1276, record: "9W · 6L" },
    { rank: 5, name: "[BETA] Nightshade", rating: 1224, record: "8W · 7L · 2D" },
  ];
  return (
    <ol className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.rank} className="flex items-center gap-3">
          <span
            className={`grid w-10 shrink-0 place-items-center rounded font-mono text-xs font-bold ${
              r.rank === 1
                ? "bg-amber-100 text-amber-700"
                : r.rank === 2
                  ? "bg-gray-200 text-gray-700"
                  : r.rank === 3
                    ? "bg-orange-100 text-orange-700"
                    : "bg-gray-50 text-gray-600"
            } py-1.5`}
          >
            #{r.rank}
          </span>
          <div className="flex flex-1 items-center gap-2 rounded border border-gray-200 px-2 py-1.5">
            <span className="grid size-7 place-items-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">
              {r.name.replace(/\[.*?\]\s*/, "").slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-gray-900">
                {r.name}
              </p>
              <p className="text-[10px] text-gray-500">{r.record}</p>
            </div>
            <p className="text-sm font-semibold text-gray-900">{r.rating}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ---- Mock 4: Discord channel reminder ----

function MockDiscord() {
  return (
    <div className="rounded-lg bg-[#36393f] p-3 font-sans text-sm">
      <div className="flex items-start gap-2">
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-violet-500 text-xs font-bold text-white">
          B
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-white">
              Foundation Event Organizer
            </span>
            <span className="rounded bg-violet-500 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
              Bot
            </span>
            <span className="text-[10px] text-gray-400">Today at 2:00 PM</span>
          </div>
          <p className="mt-1 text-[#dcddde]">
            <span className="text-blue-400">@everyone</span>{" "}
            <strong className="text-white">Shadowfront May 17</strong> —{" "}
            <span className="text-white">Alpha</span> starts{" "}
            <span className="rounded bg-[#4f545c] px-1 py-px text-xs text-white">
              today at 2:00 PM PDT
            </span>{" "}
            (in 1 hour).
          </p>
          <p className="mt-0.5 text-[#dcddde]">
            Sign up:{" "}
            <span className="text-blue-400">
              https://foundation-event-organizer.fly.dev/event/abc123
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
