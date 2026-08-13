"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

type Officer = { userId: string; displayName: string };
type Candidate = {
  id: string;
  name: string | null;
  username: string | null;
  discordUserId: string | null;
  inGameName: string | null;
};

export function MigrationOfficersManager({
  destinationId,
  initialOfficers,
}: {
  destinationId: string;
  initialOfficers: Officer[];
}) {
  const t = useTranslations("migrationTrackerOfficers");
  const [officers, setOfficers] = useState(initialOfficers);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  async function search() {
    setError(null);
    if (query.trim().length < 2) {
      setError(t("searchTooShort"));
      return;
    }
    setSearching(true);
    const res = await fetch(
      `/api/admin/migration-tracker/destinations/${destinationId}/officers/search?q=${encodeURIComponent(query.trim())}`
    );
    const data = await res.json().catch(() => ({ users: [] }));
    setCandidates(data.users ?? []);
    setSearching(false);
  }

  async function assign(userId: string, displayName: string) {
    setError(null);
    setBusyUserId(userId);
    const res = await fetch(`/api/admin/migration-tracker/destinations/${destinationId}/officers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? t("errorGeneric"));
      setBusyUserId(null);
      return;
    }
    setOfficers((prev) => [...prev, { userId, displayName }]);
    setCandidates((prev) => prev.filter((c) => c.id !== userId));
    setBusyUserId(null);
  }

  async function revoke(userId: string) {
    setError(null);
    setBusyUserId(userId);
    const res = await fetch(
      `/api/admin/migration-tracker/destinations/${destinationId}/officers/${userId}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? t("errorGeneric"));
      setBusyUserId(null);
      return;
    }
    setOfficers((prev) => prev.filter((o) => o.userId !== userId));
    setBusyUserId(null);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {t("currentHeading")}
        </h2>
        {officers.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("empty")}</p>
        ) : (
          <ul className="space-y-2">
            {officers.map((o) => (
              <li key={o.userId} className="flex items-center justify-between gap-3">
                <span className="text-sm text-gray-800 dark:text-gray-200">{o.displayName}</span>
                <button
                  type="button"
                  onClick={() => revoke(o.userId)}
                  disabled={busyUserId === o.userId}
                  className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                >
                  {t("revoke")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {t("assignHeading")}
        </h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder={t("searchPlaceholder")}
            className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
          <button
            type="button"
            onClick={search}
            disabled={searching}
            className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {searching ? t("searching") : t("searchButton")}
          </button>
        </div>

        {error && (
          <p
            className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
            role="alert"
          >
            {error}
          </p>
        )}

        {candidates.length > 0 && (
          <ul className="mt-3 space-y-2">
            {candidates.map((c) => {
              const displayName = c.inGameName ?? c.name ?? c.username ?? c.id;
              const alreadyOfficer = officers.some((o) => o.userId === c.id);
              return (
                <li key={c.id} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-800 dark:text-gray-200">
                    {displayName}
                    {c.username && <span className="text-gray-400"> @{c.username}</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => assign(c.id, displayName)}
                    disabled={alreadyOfficer || busyUserId === c.id}
                    className="text-xs font-semibold text-violet-700 hover:underline disabled:opacity-50 dark:text-violet-300"
                  >
                    {alreadyOfficer ? t("alreadyOfficer") : t("assign")}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
