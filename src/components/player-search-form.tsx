"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

const POWER_TIERS = [
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
  "XI",
  "XII",
  "XIII",
] as const;

export type GuildOption = { id: string; name: string };

// URL-driven search/filter bar for /players. Each control writes back to the
// query string (?q, ?powerTier, ?guildId), which the server component
// re-reads on the next render. Search is debounced 300ms so typing doesn't
// trigger a server round-trip per keystroke.
export function PlayerSearchForm({
  guildOptions,
  defaultQ,
  defaultPowerTier,
  defaultGuildId,
}: {
  guildOptions: GuildOption[];
  defaultQ: string;
  defaultPowerTier: string;
  defaultGuildId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations("players");

  const [q, setQ] = useState(defaultQ);
  const [powerTier, setPowerTier] = useState(defaultPowerTier);
  const [guildId, setGuildId] = useState(defaultGuildId);

  // Push to URL whenever any control changes. Debounce only the text input
  // — dropdown changes are discrete and should commit immediately.
  useEffect(() => {
    const handle = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (q.trim()) params.set("q", q.trim());
      else params.delete("q");
      if (powerTier) params.set("powerTier", powerTier);
      else params.delete("powerTier");
      if (guildId) params.set("guildId", guildId);
      else params.delete("guildId");
      // Any filter change resets pagination to page 1.
      params.delete("page");
      // Stay on the current route — this form is used on /players and
      // /leaderboard alike. usePathname picks the right one.
      router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`);
    }, 300);
    return () => clearTimeout(handle);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, powerTier, guildId]);

  const hasFilter = Boolean(q || powerTier || guildId);

  function reset() {
    setQ("");
    setPowerTier("");
    setGuildId("");
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
        />
        <select
          value={powerTier}
          onChange={(e) => setPowerTier(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        >
          <option value="">{t("allTiers")}</option>
          {POWER_TIERS.map((tier) => (
            <option key={tier} value={tier}>
              {t("tierLabel", { tier })}
            </option>
          ))}
        </select>
        <select
          value={guildId}
          onChange={(e) => setGuildId(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        >
          <option value="">{t("allGuilds")}</option>
          {guildOptions.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={reset}
          disabled={!hasFilter}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          {t("reset")}
        </button>
      </div>
    </div>
  );
}
