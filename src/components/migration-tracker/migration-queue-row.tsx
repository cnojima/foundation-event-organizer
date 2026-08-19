"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { PowerInput } from "@/components/power-input";
import { DuplicateBadge, duplicateRowId } from "@/components/migration-tracker/migration-duplicate-badge";
import type { DuplicateMatch } from "@/lib/migration-dedupe";

type EditableField = "playerName" | "sourceServer" | "power" | "desiredGuild" | "gameUid";

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
// accept/deny/waitlist/remove/revert actions — modeled on audit-row.tsx.
export function MigrationQueueRow({
  application,
  status,
  showRemove,
  duplicates = [],
}: {
  application: QueueApplication;
  status: "applied" | "waitlisted" | "accepted" | "denied";
  showRemove: boolean;
  duplicates?: DuplicateMatch[];
}) {
  const router = useRouter();
  const t = useTranslations("migrationTrackerQueue");
  const tc = useTranslations("common");
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [playerName, setPlayerName] = useState(application.playerName);
  const [sourceServer, setSourceServer] = useState(application.sourceServer);
  const [power, setPower] = useState(String(application.power));
  const [desiredGuild, setDesiredGuild] = useState(application.desiredGuild ?? "");
  const [gameUid, setGameUid] = useState(application.gameUid ?? "");
  const [savedFlash, setSavedFlash] = useState<Record<EditableField, boolean>>({
    playerName: false,
    sourceServer: false,
    power: false,
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

  type FieldVariant = "primary" | "cell" | "compact";

  function fieldClassName(saved: boolean, variant: FieldVariant, warn = false): string {
    const width = variant === "compact" ? "w-28" : "w-full";
    const text =
      variant === "primary"
        ? "text-sm font-medium text-gray-900 dark:text-gray-100"
        : variant === "cell"
          ? "text-sm text-gray-600 dark:text-gray-400"
          : "text-xs font-normal text-gray-500 dark:text-gray-400";
    if (saved) {
      return `${width} rounded border border-emerald-400 bg-transparent px-1 py-0.5 ${text} transition-colors duration-700 dark:border-emerald-500`;
    }
    if (warn) {
      return `${width} rounded border border-amber-400 bg-amber-50 px-1 py-0.5 ${text} transition-colors duration-700 hover:border-amber-500 focus:border-amber-500 focus:bg-white focus:outline-none dark:border-amber-700 dark:bg-amber-950/30 dark:hover:border-amber-600 dark:focus:border-amber-500 dark:focus:bg-gray-800`;
    }
    return `${width} rounded border border-transparent bg-transparent px-1 py-0.5 ${text} transition-colors duration-700 hover:border-gray-200 focus:border-gray-300 focus:bg-white focus:outline-none dark:hover:border-gray-700 dark:focus:border-gray-600 dark:focus:bg-gray-800`;
  }

  async function saveField(field: EditableField, rawValue: string) {
    setError(null);
    let payloadValue: string | number | null;

    if (field === "power") {
      const trimmed = rawValue.trim();
      const parsed = Number(trimmed);
      if (trimmed === "" || !Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
        setError(t("errorPower"));
        return;
      }
      if (parsed === application.power) return;
      payloadValue = parsed;
    } else if (field === "playerName" || field === "sourceServer") {
      const trimmed = rawValue.trim();
      if (!trimmed) {
        setError(field === "playerName" ? t("errorPlayerNameRequired") : t("errorSourceServerRequired"));
        return;
      }
      const original = field === "playerName" ? application.playerName : application.sourceServer;
      if (trimmed === original) return;
      payloadValue = trimmed;
    } else {
      const trimmed = rawValue.trim() || null;
      const original = (field === "gameUid" ? application.gameUid : application.desiredGuild) ?? null;
      if (trimmed === original) return;
      payloadValue = trimmed;
    }

    const res = await fetch(`/api/admin/migration-tracker/applications/${application.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: payloadValue }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? t("errorGeneric"));
      return;
    }
    flashSaved(field);
    router.refresh();
  }

  async function act(action: "accept" | "deny" | "waitlist" | "remove" | "revert" | "promote") {
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
      <tr
        id={duplicateRowId(application.id)}
        className="scroll-mt-4 border-t border-gray-100 target:bg-amber-50 dark:border-gray-800 dark:target:bg-amber-950/30"
      >
        <td className="px-3 py-2">
          <input
            type="text"
            maxLength={60}
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            onBlur={(e) => saveField("playerName", e.target.value)}
            className={fieldClassName(savedFlash.playerName, "primary")}
          />
          <DuplicateBadge matches={duplicates} label={t("duplicateBadge")} />
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
              className={fieldClassName(savedFlash.desiredGuild, "compact")}
            />
            <input
              type="text"
              maxLength={60}
              placeholder={t("gameUidPlaceholder")}
              value={gameUid}
              onChange={(e) => setGameUid(e.target.value)}
              onBlur={(e) => saveField("gameUid", e.target.value)}
              className={fieldClassName(savedFlash.gameUid, "compact", !gameUid.trim())}
            />
          </div>
        </td>
        <td className="px-3 py-2">
          <input
            type="text"
            maxLength={60}
            value={sourceServer}
            onChange={(e) => setSourceServer(e.target.value)}
            onBlur={(e) => saveField("sourceServer", e.target.value)}
            className={fieldClassName(savedFlash.sourceServer, "cell")}
          />
        </td>
        <td className="px-3 py-2">
          <PowerInput
            id={`mq-power-${application.id}`}
            value={power}
            onChange={setPower}
            onBlur={(digits) => saveField("power", digits)}
            className={fieldClassName(savedFlash.power, "cell")}
          />
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
          {new Date(application.createdAt).toLocaleDateString()}
        </td>
        <td className="px-3 py-2">
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {status === "accepted" || status === "denied" ? (
              <button
                type="button"
                onClick={() => act("revert")}
                disabled={!!submitting}
                className="rounded-md border border-violet-300 bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-50 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-900/50"
              >
                {t("revert")}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => act("accept")}
                disabled={!!submitting}
                className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
              >
                {t("accept")}
              </button>
            )}
            {status === "waitlisted" ? (
              <button
                type="button"
                onClick={() => act("promote")}
                disabled={!!submitting}
                className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/50"
              >
                {t("promote")}
              </button>
            ) : (
              status !== "denied" && (
                <button
                  type="button"
                  onClick={() => act("waitlist")}
                  disabled={!!submitting}
                  className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/50"
                >
                  {t("waitlist")}
                </button>
              )
            )}
            {status !== "denied" && (
              <button
                type="button"
                onClick={() => act("deny")}
                disabled={!!submitting}
                className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-900/50"
              >
                {t("deny")}
              </button>
            )}
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
