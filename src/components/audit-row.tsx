"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

type Row = {
  id: string;
  createdAt: string;
  actorDisplay: string;
  action: string;
  entityType: string;
  entityLabel: string | null;
  changes: string | null;
  flaggedAt: string | null;
  flaggedByUserId: string | null;
  flagNote: string | null;
  flaggerDisplay: string | null;
};

// Single audit-log row. Client component because it owns the flag toggle
// and the "expand changes" disclosure — both interactive and best kept
// out of the server tree to avoid wrapping the whole list in client
// boundaries.
export function AuditRow({
  row,
  DateTime,
}: {
  row: Row;
  // Passed in so we can keep using the existing server DateTime renderer
  // without duplicating its formatting logic. It's pure for these props.
  DateTime: (props: { iso: string }) => React.ReactNode;
}) {
  const router = useRouter();
  const t = useTranslations("auditPage");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [flaggedAt, setFlaggedAt] = useState<string | null>(row.flaggedAt);
  const [flagNote, setFlagNote] = useState<string | null>(row.flagNote);
  const [flaggerDisplay, setFlaggerDisplay] = useState<string | null>(
    row.flaggerDisplay
  );
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [noteDraft, setNoteDraft] = useState(row.flagNote ?? "");

  async function toggleFlag(note: string | null) {
    setSubmitting(true);
    const res = await fetch(`/api/admin/audit/${row.id}/flag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flagged: flaggedAt === null,
        note,
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        flaggedAt: string | null;
        flagNote: string | null;
        flaggerDisplay: string | null;
      };
      setFlaggedAt(data.flaggedAt);
      setFlagNote(data.flagNote);
      setFlaggerDisplay(data.flaggerDisplay);
      setShowNoteEditor(false);
      router.refresh();
    }
    setSubmitting(false);
  }

  const isFlagged = flaggedAt !== null;
  const hasChanges = !!row.changes;

  return (
    <>
      <tr
        className={`border-t border-gray-100 dark:border-gray-800 ${isFlagged ? "bg-amber-50/50 dark:bg-amber-950/20" : ""}`}
      >
        <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
          <DateTime iso={row.createdAt} />
        </td>
        <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-200">
          {row.actorDisplay}
        </td>
        <td className="px-3 py-2">
          <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-gray-700 dark:bg-gray-800 dark:text-gray-300">
            {row.action}
          </code>
        </td>
        <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
          <div className="flex items-center gap-2">
            <span className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
              {row.entityType}
            </span>
            <span className="truncate">{row.entityLabel ?? "—"}</span>
            {hasChanges && (
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="text-xs text-violet-600 hover:underline dark:text-violet-300"
              >
                {open ? t("hideDiff") : t("diff")}
              </button>
            )}
          </div>
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-right">
          <button
            type="button"
            onClick={() => {
              if (isFlagged) toggleFlag(null);
              else setShowNoteEditor(true);
            }}
            disabled={submitting}
            className={`rounded-md border px-2 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
              isFlagged
                ? "border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/50"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            }`}
          >
            {isFlagged ? t("flaggedButton") : t("flagButton")}
          </button>
        </td>
      </tr>
      {isFlagged && (flaggerDisplay || flagNote) && (
        <tr className="bg-amber-50/30 dark:bg-amber-950/10">
          <td colSpan={5} className="px-3 pb-2 text-xs text-amber-900 dark:text-amber-200">
            {flaggerDisplay ? t("flaggedBy", { name: flaggerDisplay }) : t("flaggedAnon")}
            {flagNote ? t("flagNote", { note: flagNote }) : ""}
          </td>
        </tr>
      )}
      {showNoteEditor && (
        <tr className="bg-amber-50 dark:bg-amber-950/30">
          <td colSpan={5} className="px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder={t("notePlaceholder")}
                className="flex-1 min-w-48 rounded border px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
                autoFocus
              />
              <button
                type="button"
                onClick={() => toggleFlag(noteDraft.trim() || null)}
                disabled={submitting}
                className="rounded-md bg-amber-600 px-3 py-1 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {submitting ? tc("saving") : t("flagSubmit")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowNoteEditor(false);
                  setNoteDraft("");
                }}
                disabled={submitting}
                className="text-sm text-gray-500 hover:underline dark:text-gray-400"
              >
                {tc("cancel")}
              </button>
            </div>
          </td>
        </tr>
      )}
      {open && hasChanges && (
        <tr className="bg-gray-50 dark:bg-gray-900">
          <td colSpan={5} className="px-3 py-2">
            <pre className="max-h-64 overflow-auto rounded border border-gray-200 bg-white p-3 text-xs text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300">
              {formatChanges(row.changes)}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}

function formatChanges(raw: string | null): string {
  if (!raw) return "";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
