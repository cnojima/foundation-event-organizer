"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// "Import from screenshot" admin flow. Upload a guild-roster screenshot,
// Claude vision extracts the in-game names, admin reviews + edits, then
// each selected row is created as a pre-claim stub member via the
// existing POST /api/admin/members endpoint. The endpoint is idempotent
// on uniqueness conflicts (Discord ID + email), so per-row failures
// surface inline without breaking the batch.

type DiscordMatch = {
  userId: string;
  handle: string;
  avatarUrl: string | null;
  confidence: "exact" | "fuzzy";
  matchedOn: "username" | "globalName" | "nick";
};

type ExtractedName = {
  id: string; // local-only id for React keys (we re-key on each extract)
  value: string;
  selected: boolean;
  // True when the server detected an existing guild member with the same
  // in-game name (case-insensitive). Drives the "Duplicate" badge and
  // makes the row default to unchecked.
  duplicate: boolean;
  // Server-side Discord-bot match. When present, the stub gets a
  // pre-filled discord_user_id on create, and `sendDm` defaults to true
  // so the user receives an onboarding DM right after import.
  discordMatch: DiscordMatch | null;
  sendDm: boolean;
  status: "pending" | "saving" | "saved" | "dm-sending" | "dm-sent" | "dm-failed" | "error";
  error?: string;
  dmError?: string;
  // Once the stub has been created, the server-returned user id — needed
  // for the per-row DM call.
  createdUserId?: string;
};

export function ImportMembersFromImageButton({
  guildId,
}: {
  guildId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-violet-300 bg-violet-50 px-3 py-1.5 text-sm font-semibold text-violet-700 hover:bg-violet-100 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-900/50"
      >
        + Import from screenshot
      </button>
      {open && (
        <ImportFromImageModal guildId={guildId} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function ImportFromImageModal({
  guildId,
  onClose,
}: {
  guildId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  // Derived: creating the URL inside useMemo keeps the resource synced
  // with `file` without a setState-in-effect. The cleanup effect below
  // revokes the previous URL when `file` changes (and on unmount).
  const previewUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file]
  );
  const [extracting, setExtracting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [names, setNames] = useState<ExtractedName[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null
  );
  // Server-emitted soft warning when Discord matching couldn't run (no
  // intent, bot not in server, etc). Surfaced once near the result list.
  const [discordWarning, setDiscordWarning] = useState<string | null>(null);

  // Esc to close (when not mid-request).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !extracting && !importing) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, extracting, importing]);

  // Revoke object URL when preview changes/unmounts so we don't leak blobs.
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  // Clipboard paste: when the modal is open, ⌘V/Ctrl+V anywhere outside an
  // editable input grabs an image from the clipboard. Skip paste if the
  // user is focused on a text field — they probably mean to paste text.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (extracting || importing) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (blob) {
            e.preventDefault();
            // Give pasted blobs a stable filename so the upload form-data
            // field looks reasonable in server logs. Browsers default to
            // "image.png" / blank.
            const ext = blob.type.split("/")[1] ?? "png";
            const renamed = new File([blob], `clipboard.${ext}`, {
              type: blob.type,
            });
            pickFile(renamed);
            return;
          }
        }
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [extracting, importing]);

  function pickFile(f: File | null) {
    setFile(f);
    setNames([]);
    setExtractError(null);
    setImportError(null);
  }

  async function extract() {
    if (!file) return;
    setExtractError(null);
    setExtracting(true);
    const fd = new FormData();
    fd.append("image", file);
    fd.append("guildId", guildId);
    const res = await fetch("/api/admin/members/import-from-image", {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setExtractError(data?.error ?? "Failed to extract names.");
      setExtracting(false);
      return;
    }
    const data = (await res.json()) as {
      names: {
        value: string;
        duplicate: boolean;
        discordMatch: DiscordMatch | null;
      }[];
      discordWarning: string | null;
    };
    setDiscordWarning(data.discordWarning ?? null);
    setNames(
      data.names.map((n, i) => ({
        id: `${Date.now()}-${i}`,
        value: n.value,
        // Duplicates default to unchecked — admin has to opt in if they
        // really want a duplicate row (rare, but possible if the existing
        // member is a stub the admin meant to replace).
        selected: !n.duplicate,
        duplicate: n.duplicate,
        discordMatch: n.discordMatch,
        // Auto-DM defaults to ON for matched rows. Admins can untick per
        // row before clicking Import.
        sendDm: !!n.discordMatch,
        status: "pending",
      }))
    );
    setExtracting(false);
  }

  function updateName(id: string, value: string) {
    setNames((prev) =>
      prev.map((n) => (n.id === id ? { ...n, value, status: "pending", error: undefined } : n))
    );
  }

  function toggleSelected(id: string) {
    setNames((prev) =>
      prev.map((n) => (n.id === id ? { ...n, selected: !n.selected } : n))
    );
  }

  function toggleSendDm(id: string) {
    setNames((prev) =>
      prev.map((n) => (n.id === id ? { ...n, sendDm: !n.sendDm } : n))
    );
  }

  // Any post-create status counts as "done — don't re-import" for the
  // import-loop and toggle-all logic. The DM lifecycle (sending / sent /
  // failed) doesn't change whether the stub itself exists.
  function isDone(n: ExtractedName): boolean {
    return (
      n.status === "saved" ||
      n.status === "dm-sending" ||
      n.status === "dm-sent" ||
      n.status === "dm-failed"
    );
  }

  function toggleAll() {
    const anyUnselected = names.some((n) => !n.selected && !isDone(n));
    setNames((prev) =>
      prev.map((n) => (isDone(n) ? n : { ...n, selected: anyUnselected }))
    );
  }

  async function importSelected() {
    const toImport = names.filter((n) => n.selected && !isDone(n));
    if (toImport.length === 0) return;
    setImportError(null);
    setImporting(true);
    setProgress({ done: 0, total: toImport.length });

    // Sequential POSTs. POST /api/admin/members is the existing stub-create
    // endpoint; it validates each row server-side (length, collisions).
    // We mark per-row status so the admin can fix and retry just the failures.
    //
    // For rows with a Discord match, we pass `discordUserId` so the stub
    // is created with the snowflake pre-filled — the existing auto-claim
    // flow then merges on the user's first Discord OAuth sign-in. After
    // each successful create, if `sendDm` is set, we POST to the new
    // /onboarding-dm endpoint to ask the bot to DM the user.
    let done = 0;
    for (const row of toImport) {
      setNames((prev) =>
        prev.map((n) => (n.id === row.id ? { ...n, status: "saving" } : n))
      );
      const createBody: Record<string, string | null> = {
        guildId,
        inGameName: row.value.trim(),
      };
      if (row.discordMatch) {
        createBody.discordUserId = row.discordMatch.userId;
      }
      const res = await fetch("/api/admin/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createBody),
      });
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          userId?: string;
        };
        const newUserId = data.userId;
        setNames((prev) =>
          prev.map((n) =>
            n.id === row.id
              ? {
                  ...n,
                  status: "saved",
                  error: undefined,
                  createdUserId: newUserId,
                }
              : n
          )
        );

        // Bundled auto-DM: fires only when the row had a Discord match
        // AND the admin left `sendDm` checked. Failure here is per-row
        // and non-fatal — the stub already exists; admin can hit
        // "Resend onboarding DM" later on /admin/members.
        if (row.sendDm && row.discordMatch && newUserId) {
          setNames((prev) =>
            prev.map((n) =>
              n.id === row.id ? { ...n, status: "dm-sending" } : n
            )
          );
          const dmRes = await fetch(
            `/api/admin/members/${newUserId}/onboarding-dm`,
            { method: "POST" }
          );
          if (dmRes.ok) {
            setNames((prev) =>
              prev.map((n) =>
                n.id === row.id ? { ...n, status: "dm-sent" } : n
              )
            );
          } else {
            const dmData = await dmRes.json().catch(() => ({}));
            setNames((prev) =>
              prev.map((n) =>
                n.id === row.id
                  ? {
                      ...n,
                      status: "dm-failed",
                      dmError: dmData?.error ?? "DM failed",
                    }
                  : n
              )
            );
          }
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setNames((prev) =>
          prev.map((n) =>
            n.id === row.id
              ? { ...n, status: "error", error: data?.error ?? "Failed" }
              : n
          )
        );
      }
      done += 1;
      setProgress({ done, total: toImport.length });
    }

    setImporting(false);
    setProgress(null);
    router.refresh();
  }

  const allSaved =
    names.length > 0 && names.every((n) => isDone(n) || !n.selected);
  const selectedCount = names.filter((n) => n.selected && !isDone(n)).length;
  const savedCount = names.filter((n) => isDone(n)).length;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-img-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !extracting && !importing) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl dark:bg-gray-900">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 p-4 dark:border-gray-800">
          <div>
            <h2
              id="import-img-title"
              className="text-lg font-bold text-gray-900 dark:text-gray-100"
            >
              Import members from screenshot
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Upload a guild-roster screenshot. Claude vision extracts the
              in-game names; review and edit before importing as pre-claim
              members.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={extracting || importing}
            aria-label="Close"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <svg viewBox="0 0 20 20" fill="none" className="size-5" aria-hidden>
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* File picker + preview */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">
              Screenshot (PNG, JPEG, or WebP — max 10 MB)
            </label>
            <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
              Tip: you can also paste an image with{" "}
              <kbd className="rounded border border-gray-300 bg-gray-100 px-1 py-0.5 font-mono text-[10px] dark:border-gray-700 dark:bg-gray-800">
                ⌘V
              </kbd>{" "}
              /{" "}
              <kbd className="rounded border border-gray-300 bg-gray-100 px-1 py-0.5 font-mono text-[10px] dark:border-gray-700 dark:bg-gray-800">
                Ctrl+V
              </kbd>
              .
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              disabled={extracting || importing}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-violet-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-violet-700 dark:file:bg-violet-950/40 dark:file:text-violet-300"
            />
          </div>

          {previewUrl && (
            <div className="mb-4 flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Screenshot preview"
                className="max-h-48 rounded border border-gray-200 dark:border-gray-800"
              />
              <button
                type="button"
                onClick={extract}
                disabled={extracting || importing}
                className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {extracting ? "Extracting…" : names.length > 0 ? "Re-extract" : "Extract names"}
              </button>
            </div>
          )}

          {extractError && (
            <p className="mb-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              {extractError}
            </p>
          )}

          {names.length > 0 && (
            <>
              {discordWarning && (
                <p className="mb-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                  {discordWarning}
                </p>
              )}
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Detected {names.length} name{names.length === 1 ? "" : "s"}
                  {(() => {
                    const dupes = names.filter(
                      (n) => n.duplicate && !isDone(n)
                    ).length;
                    const matches = names.filter(
                      (n) => n.discordMatch && !isDone(n)
                    ).length;
                    const parts: string[] = [];
                    if (dupes > 0)
                      parts.push(`${dupes} duplicate${dupes === 1 ? "" : "s"}`);
                    if (matches > 0)
                      parts.push(
                        `${matches} Discord match${matches === 1 ? "" : "es"}`
                      );
                    return parts.length > 0 ? ` · ${parts.join(" · ")}` : "";
                  })()}
                </h3>
                <button
                  type="button"
                  onClick={toggleAll}
                  disabled={importing}
                  className="text-xs text-violet-700 hover:underline disabled:opacity-50 dark:text-violet-300"
                >
                  Toggle all
                </button>
              </div>
              <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                Edit names inline to fix any OCR errors. Uncheck rows you
                don&apos;t want to import. Rows that match an existing
                guild member are flagged{" "}
                <span className="rounded border border-amber-300 bg-amber-100 px-1 text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/60 dark:text-amber-300">
                  Duplicate
                </span>{" "}
                and default to unchecked.
              </p>

              <div className="space-y-1.5">
                {names.map((n) => (
                  <div
                    key={n.id}
                    className={`flex flex-col gap-1 rounded border px-2 py-1.5 text-sm ${
                      isDone(n)
                        ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/40"
                        : n.status === "error"
                          ? "border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/40"
                          : n.duplicate && n.status === "pending"
                            ? "border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/40"
                            : "border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={n.selected}
                        onChange={() => toggleSelected(n.id)}
                        disabled={importing || isDone(n)}
                      />
                      <input
                        type="text"
                        value={n.value}
                        onChange={(e) => updateName(n.id, e.target.value)}
                        disabled={importing || isDone(n)}
                        maxLength={40}
                        className="flex-1 rounded border-0 bg-transparent px-1 py-0 text-sm focus:outline-none focus:ring-1 focus:ring-violet-400 disabled:opacity-70 dark:text-gray-100"
                      />
                      <span className="flex shrink-0 items-center gap-1.5 text-xs">
                        {n.duplicate && n.status === "pending" && (
                          <span
                            className="rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/60 dark:text-amber-300"
                            title="A member with this in-game name already exists in this guild. Imported by default unchecked — re-check only if you want a duplicate row."
                          >
                            Duplicate
                          </span>
                        )}
                        {n.status === "saving" && (
                          <span className="text-gray-500 dark:text-gray-400">Saving…</span>
                        )}
                        {n.status === "saved" && (
                          <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                            ✓ Saved
                          </span>
                        )}
                        {n.status === "dm-sending" && (
                          <span className="text-gray-500 dark:text-gray-400">DMing…</span>
                        )}
                        {n.status === "dm-sent" && (
                          <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                            ✓ Saved + DM sent
                          </span>
                        )}
                        {n.status === "dm-failed" && (
                          <span
                            className="font-semibold text-amber-700 dark:text-amber-300"
                            title={n.dmError}
                          >
                            ✓ Saved · DM failed
                          </span>
                        )}
                        {n.status === "error" && (
                          <span
                            className="font-semibold text-red-700 dark:text-red-300"
                            title={n.error}
                          >
                            ✗ {n.error ?? "Failed"}
                          </span>
                        )}
                      </span>
                    </div>
                    {/* Sub-row: Discord match metadata + auto-DM toggle. Only
                        rendered when we found a match; otherwise the parent
                        row stays single-line. */}
                    {n.discordMatch && (
                      <div className="ml-7 flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                        <span className="flex items-center gap-1.5">
                          {n.discordMatch.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={n.discordMatch.avatarUrl}
                              alt=""
                              className="size-4 rounded-full"
                            />
                          ) : (
                            <span className="inline-block size-4 rounded-full bg-violet-200 dark:bg-violet-900" />
                          )}
                          <span className="font-medium text-gray-800 dark:text-gray-200">
                            @{n.discordMatch.handle}
                          </span>
                          <span
                            className={`rounded border px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                              n.discordMatch.confidence === "exact"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
                                : "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300"
                            }`}
                            title={`Matched on Discord ${n.discordMatch.matchedOn}`}
                          >
                            {n.discordMatch.confidence}
                          </span>
                        </span>
                        {!isDone(n) && (
                          <label className="ml-auto flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={n.sendDm}
                              onChange={() => toggleSendDm(n.id)}
                              disabled={importing}
                            />
                            <span>DM onboarding link</span>
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {importError && (
            <p className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              {importError}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-200 p-4 dark:border-gray-800">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {progress
              ? `Importing ${progress.done} of ${progress.total}…`
              : names.length === 0
                ? "Pick a screenshot to begin"
                : savedCount > 0
                  ? `${savedCount} saved · ${selectedCount} pending`
                  : `${selectedCount} selected`}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={extracting || importing}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              {allSaved ? "Done" : "Cancel"}
            </button>
            {names.length > 0 && !allSaved && (
              <button
                type="button"
                onClick={importSelected}
                disabled={importing || selectedCount === 0}
                className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {importing
                  ? "Importing…"
                  : `Import ${selectedCount > 0 ? `(${selectedCount})` : ""}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
