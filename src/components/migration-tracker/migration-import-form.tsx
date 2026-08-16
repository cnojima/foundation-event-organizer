"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { parseImportText, type ImportField } from "@/lib/migration-import";

const FIELD_LABEL_KEYS: Record<ImportField, string> = {
  playerName: "colPlayer",
  sourceServer: "colSourceServer",
  power: "colPower",
  desiredGuild: "colDesiredGuild",
  gameUid: "colGameUid",
  contact: "colContact",
};

type RowOutcome = { ok: boolean; status?: string; error?: string };

export function MigrationImportForm({
  destinationId,
  windowOpen,
}: {
  destinationId: string;
  windowOpen: boolean;
}) {
  const t = useTranslations("migrationTrackerImport");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Map<number, RowOutcome> | null>(null);

  const preview = useMemo(() => parseImportText(text), [text]);

  const validRows = preview.ok ? preview.rows.filter((r) => !r.error) : [];
  const invalidRows = preview.ok ? preview.rows.filter((r) => r.error) : [];

  async function handleImport() {
    if (!preview.ok || validRows.length === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    setOutcomes(null);

    const res = await fetch(`/api/admin/migration-tracker/destinations/${destinationId}/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: validRows.map((r) => ({
          rowNumber: r.rowNumber,
          playerName: r.playerName,
          sourceServer: r.sourceServer,
          power: r.power,
          desiredGuild: r.desiredGuild,
          gameUid: r.gameUid,
          contact: r.contact,
        })),
      }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setSubmitError(data?.error ?? t("errorGeneric"));
      setSubmitting(false);
      return;
    }

    const nextOutcomes = new Map<number, RowOutcome>();
    for (const r of data.results as { rowNumber: number; ok: boolean; status?: string; error?: string }[]) {
      nextOutcomes.set(r.rowNumber, { ok: r.ok, status: r.status, error: r.error });
    }
    setOutcomes(nextOutcomes);
    setSubmitting(false);
  }

  const pastePlaceholder = "playerName,sourceServer,power,desiredGuild,gameUid,contact\ncurisu,1130,95000000,LAW,423456789,DiscordHandle";

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="migration-import-text" className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">
          {t("pasteLabel")}
        </label>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("pasteHintTop")}</p>
        <textarea
          id="migration-import-text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOutcomes(null);
            setSubmitError(null);
          }}
          placeholder={pastePlaceholder}
          rows={10}
          spellCheck={false}
          className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-xs dark:border-gray-700 dark:bg-gray-800"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("pasteHint")}</p>
      </div>

      {!windowOpen && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
          {t("windowNotOpen")}
        </p>
      )}

      {preview.ok === false && preview.reason === "missing_columns" && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {t("missingColumns", {
            fields: preview.missingRequired.map((f) => t(FIELD_LABEL_KEYS[f])).join(", "),
          })}
        </p>
      )}

      {preview.ok && (
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t("summary", { valid: validRows.length, invalid: invalidRows.length })}
            </p>
            <button
              type="button"
              onClick={handleImport}
              disabled={!windowOpen || submitting || validRows.length === 0}
              className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {submitting ? t("importing") : t("importButton", { count: validRows.length })}
            </button>
          </div>

          {submitError && (
            <p
              className="mb-2 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
              role="alert"
            >
              {submitError}
            </p>
          )}

          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2 font-semibold">#</th>
                  <th className="px-3 py-2 font-semibold">{t("colPlayer")}</th>
                  <th className="px-3 py-2 font-semibold">{t("colSourceServer")}</th>
                  <th className="px-3 py-2 font-semibold">{t("colPower")}</th>
                  <th className="px-3 py-2 font-semibold">{t("colDesiredGuild")}</th>
                  <th className="px-3 py-2 font-semibold">{t("colGameUid")}</th>
                  <th className="px-3 py-2 font-semibold">{t("colContact")}</th>
                  <th className="px-3 py-2 font-semibold">{t("colResult")}</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => {
                  const outcome = outcomes?.get(r.rowNumber);
                  return (
                    <tr
                      key={r.rowNumber}
                      className="border-t border-gray-100 dark:border-gray-800"
                    >
                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{r.rowNumber}</td>
                      <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{r.playerName || "—"}</td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{r.sourceServer || "—"}</td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
                        {r.power !== null ? r.power.toLocaleString() : "—"}
                      </td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{r.desiredGuild ?? "—"}</td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{r.gameUid ?? "—"}</td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{r.contact ?? "—"}</td>
                      <td className="px-3 py-2">
                        {outcome ? (
                          outcome.ok ? (
                            <span className="text-green-700 dark:text-green-400">
                              {t("resultImported", { status: outcome.status ?? "" })}
                            </span>
                          ) : (
                            <span className="text-red-600 dark:text-red-400">{outcome.error}</span>
                          )
                        ) : r.error ? (
                          <span className="text-red-600 dark:text-red-400">{r.error}</span>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500">{t("resultPending")}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
