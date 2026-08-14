"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

type EditableField = "desiredGuild" | "gameUid";

type QueueApplication = {
  id: string;
  playerName: string;
  sourceServer: string;
  power: number;
  desiredGuild: string | null;
  gameUid: string | null;
  contact: string | null;
  createdAt: string;
};

// Single review-queue row. Client component because it owns the
// accept/deny/waitlist/remove actions — modeled on audit-row.tsx.
export function MigrationQueueRow({
  application,
  showRemove,
}: {
  application: QueueApplication;
  showRemove: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("migrationTrackerQueue");
  const tc = useTranslations("common");
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [desiredGuild, setDesiredGuild] = useState(application.desiredGuild ?? "");
  const [gameUid, setGameUid] = useState(application.gameUid ?? "");
  const [savedFlash, setSavedFlash] = useState<Record<EditableField, boolean>>({
    desiredGuild: false,
    gameUid: false,
  });
  const flashTimers = useRef<Partial<Record<EditableField, ReturnType<typeof setTimeout>>>>({});

  useEffect(() => {
    const timers = flashTimers.current;
    return () => {
      Object.values(timers).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  function flashSaved(field: EditableField) {
    clearTimeout(flashTimers.current[field]);
    setSavedFlash((prev) => ({ ...prev, [field]: true }));
    flashTimers.current[field] = setTimeout(() => {
      setSavedFlash((prev) => ({ ...prev, [field]: false }));
    }, 600);
  }

  function inlineFieldClassName(saved: boolean): string {
    return saved
      ? "w-28 rounded border border-emerald-400 bg-transparent px-1 py-0.5 text-xs font-normal text-gray-500 transition-colors duration-700 dark:border-emerald-500 dark:text-gray-400"
      : "w-28 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs font-normal text-gray-500 transition-colors duration-700 hover:border-gray-200 focus:border-gray-300 focus:bg-white focus:outline-none dark:text-gray-400 dark:hover:border-gray-700 dark:focus:border-gray-600 dark:focus:bg-gray-800";
  }

  async function saveField(field: EditableField, value: string) {
    const trimmed = value.trim() || null;
    const original = (field === "gameUid" ? application.gameUid : application.desiredGuild) ?? null;
    if (trimmed === original) return;
    setError(null);
    const res = await fetch(`/api/admin/migration-tracker/applications/${application.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: trimmed }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? t("errorGeneric"));
      return;
    }
    flashSaved(field);
    router.refresh();
  }

  async function act(action: "accept" | "deny" | "waitlist" | "remove") {
    setError(null);
    setSubmitting(action);
    const res = await fetch(
      `/api/admin/migration-tracker/applications/${application.id}/${action}`,
      { method: "POST" }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? t("errorGeneric"));
      setSubmitting(null);
      return;
    }
    router.refresh();
  }

  return (
    <>
      <tr className="border-t border-gray-100 dark:border-gray-800">
        <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">
          {application.playerName}
          {application.contact && (
            <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
              ({application.contact})
            </span>
          )}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            <input
              type="text"
              maxLength={60}
              placeholder={t("desiredGuildPlaceholder")}
              value={desiredGuild}
              onChange={(e) => setDesiredGuild(e.target.value)}
              onBlur={(e) => saveField("desiredGuild", e.target.value)}
              className={inlineFieldClassName(savedFlash.desiredGuild)}
            />
            <input
              type="text"
              maxLength={60}
              placeholder={t("gameUidPlaceholder")}
              value={gameUid}
              onChange={(e) => setGameUid(e.target.value)}
              onBlur={(e) => saveField("gameUid", e.target.value)}
              className={inlineFieldClassName(savedFlash.gameUid)}
            />
          </div>
        </td>
        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{application.sourceServer}</td>
        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
          {application.power.toLocaleString()}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
          {new Date(application.createdAt).toLocaleDateString()}
        </td>
        <td className="px-3 py-2">
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => act("accept")}
              disabled={!!submitting}
              className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
            >
              {t("accept")}
            </button>
            <button
              type="button"
              onClick={() => act("waitlist")}
              disabled={!!submitting}
              className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/50"
            >
              {t("waitlist")}
            </button>
            <button
              type="button"
              onClick={() => act("deny")}
              disabled={!!submitting}
              className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-900/50"
            >
              {t("deny")}
            </button>
            {showRemove &&
              (!confirmRemove ? (
                <button
                  type="button"
                  onClick={() => setConfirmRemove(true)}
                  disabled={!!submitting}
                  className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-500 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800"
                >
                  {t("remove")}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => act("remove")}
                    disabled={!!submitting}
                    className="rounded-md border border-gray-500 bg-gray-700 px-2 py-1 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    {t("confirm")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(false)}
                    className="text-xs text-gray-500 hover:underline dark:text-gray-400"
                  >
                    {tc("cancel")}
                  </button>
                </>
              ))}
          </div>
        </td>
      </tr>
      {error && (
        <tr className="bg-red-50 dark:bg-red-950/20">
          <td colSpan={5} className="px-3 py-1.5 text-xs text-red-700 dark:text-red-300">
            {error}
          </td>
        </tr>
      )}
    </>
  );
}
