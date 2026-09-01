"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

export type DirectoryGuildOption = { id: string; name: string };

// URL-driven search/filter bar for /directory. Mirrors the debounced,
// URL-synced pattern in PlayerSearchForm (src/components/player-search-form.tsx)
// but with a different field set (server number instead of power tier), so
// it's kept as its own component rather than sharing an abstraction across
// the two.
export function PlayerDirectorySearchForm({
  serverOptions,
  guildOptions,
  defaultQ,
  defaultServer,
  defaultGuildId,
}: {
  serverOptions: number[];
  guildOptions: DirectoryGuildOption[];
  defaultQ: string;
  defaultServer: string;
  defaultGuildId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations("directory");

  const [q, setQ] = useState(defaultQ);
  const [server, setServer] = useState(defaultServer);
  const [guildId, setGuildId] = useState(defaultGuildId);

  // Push to URL whenever any control changes. Debounce only the text input
  // — dropdown changes are discrete and should commit immediately.
  useEffect(() => {
    const handle = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (q.trim()) params.set("q", q.trim());
      else params.delete("q");
      if (server) params.set("server", server);
      else params.delete("server");
      if (guildId) params.set("guildId", guildId);
      else params.delete("guildId");
      // Any filter change resets pagination to page 1.
      params.delete("page");
      router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`);
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, server, guildId]);

  const hasFilter = Boolean(q || server || guildId);

  function reset() {
    setQ("");
    setServer("");
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
          value={server}
          onChange={(e) => setServer(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        >
          <option value="">{t("allServers")}</option>
          {serverOptions.map((n) => (
            <option key={n} value={n}>
              {t("serverLabel", { serverNumber: n })}
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
