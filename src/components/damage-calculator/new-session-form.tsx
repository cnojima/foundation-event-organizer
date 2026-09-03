"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PHASES, matchPhase, type Phase } from "@/lib/damage-calculator/phases";

type QueuedFile = { phase: Phase | null; file: File; relativePath: string };

type ProcessingRow = {
  phase: Phase | null;
  fileName: string;
  status: "pending" | "uploading" | "done" | "error";
  fleetName?: string;
  warning?: string | null;
  error?: string;
};

type UploadMode = "folder" | "flat";

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];

function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  const lower = file.name.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function NewSessionForm() {
  const router = useRouter();
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const flatInputRef = useRef<HTMLInputElement | null>(null);

  // webkitdirectory/directory aren't in React's typed input attributes —
  // set them imperatively on the underlying DOM node instead.
  useEffect(() => {
    const el = folderInputRef.current;
    if (!el) return;
    el.setAttribute("webkitdirectory", "");
    el.setAttribute("directory", "");
  }, []);

  const [mode, setMode] = useState<UploadMode>("folder");
  const [label, setLabel] = useState("");
  const [eventName, setEventName] = useState("Calamity Befalls");
  const [queued, setQueued] = useState<QueuedFile[]>([]);
  const [unrecognized, setUnrecognized] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [rows, setRows] = useState<ProcessingRow[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const queuedByPhase = useMemo(() => {
    const map = new Map<Phase, number>();
    for (const q of queued) {
      if (!q.phase) continue;
      map.set(q.phase, (map.get(q.phase) ?? 0) + 1);
    }
    return map;
  }, [queued]);

  function handleFolderSelect(fileList: FileList | null) {
    setSubmitError(null);
    setRows([]);
    setSessionId(null);
    if (!fileList || fileList.length === 0) {
      setQueued([]);
      setUnrecognized([]);
      return;
    }

    const files = Array.from(fileList);
    const nextQueued: QueuedFile[] = [];
    const nextUnrecognized: string[] = [];

    for (const file of files) {
      const relativePath =
        (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
        file.name;
      if (!isImageFile(file)) {
        nextUnrecognized.push(relativePath);
        continue;
      }
      const parts = relativePath.split("/");
      const phaseFolder = parts.length >= 2 ? parts[parts.length - 2] : "";
      const phase = matchPhase(phaseFolder);
      if (!phase) {
        nextUnrecognized.push(relativePath);
        continue;
      }
      nextQueued.push({ phase, file, relativePath });
    }

    setQueued(nextQueued);
    setUnrecognized(nextUnrecognized);

    // Prefill the label from the top-level folder name (e.g. "2026-07-07_1")
    // if the admin hasn't already typed a custom one.
    if (!label && files.length > 0) {
      const relativePath =
        (files[0] as File & { webkitRelativePath?: string })
          .webkitRelativePath || "";
      const rootFolder = relativePath.split("/")[0];
      if (rootFolder) setLabel(rootFolder);
    }
  }

  function handleFlatSelect(fileList: FileList | null) {
    setSubmitError(null);
    setRows([]);
    setSessionId(null);
    if (!fileList || fileList.length === 0) {
      setQueued([]);
      setUnrecognized([]);
      return;
    }

    const files = Array.from(fileList);
    const nextUnrecognized: string[] = [];
    const nextQueued: QueuedFile[] = [];
    for (const file of files) {
      if (!isImageFile(file)) {
        nextUnrecognized.push(file.name);
        continue;
      }
      nextQueued.push({ phase: null, file, relativePath: file.name });
    }
    // Filenames are sequential capture order (e.g. IMG_3459, IMG_3460, …) —
    // sort so upload order matches chronological order, since sub-stage
    // detection on the server relies on that ordering.
    nextQueued.sort((a, b) => a.file.name.localeCompare(b.file.name));

    setQueued(nextQueued);
    setUnrecognized(nextUnrecognized);
  }

  async function startUpload() {
    if (queued.length === 0 || !label.trim()) return;
    setSubmitError(null);
    setUploading(true);

    let createdSessionId = sessionId;
    if (!createdSessionId) {
      const res = await fetch("/api/damage-calculator/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim(), eventName: eventName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmitError(data?.error ?? "Failed to create session.");
        setUploading(false);
        return;
      }
      const data = (await res.json()) as { session: { id: string } };
      createdSessionId = data.session.id;
      setSessionId(createdSessionId);
    }

    // Folder mode: sort by PHASES order so the progress list reads
    // top-to-bottom the same way the final pivot table will. Flat mode:
    // already sorted into chronological (filename) order by handleFlatSelect
    // — that order must be preserved and uploaded sequentially, since the
    // server infers each screenshot's sub-stage from what's already been
    // recorded for this session.
    const ordered =
      mode === "folder"
        ? [...queued].sort(
            (a, b) => PHASES.indexOf(a.phase as Phase) - PHASES.indexOf(b.phase as Phase)
          )
        : queued;
    const initialRows: ProcessingRow[] = ordered.map((q) => ({
      phase: q.phase,
      fileName: q.file.name,
      status: "pending",
    }));
    setRows(initialRows);

    let anyError = false;
    for (let i = 0; i < ordered.length; i++) {
      const q = ordered[i];
      setRows((prev) =>
        prev.map((r, idx) => (idx === i ? { ...r, status: "uploading" } : r))
      );
      const fd = new FormData();
      fd.append("image", q.file);
      if (q.phase) fd.append("phase", q.phase);
      const res = await fetch(
        `/api/damage-calculator/sessions/${createdSessionId}/readings`,
        { method: "POST", body: fd }
      );
      if (res.ok) {
        const data = (await res.json()) as {
          fleet: { name: string };
          phase: Phase;
          crossCheckWarning: string | null;
        };
        setRows((prev) =>
          prev.map((r, idx) =>
            idx === i
              ? {
                  ...r,
                  phase: data.phase,
                  status: "done",
                  fleetName: data.fleet.name,
                  warning: data.crossCheckWarning,
                }
              : r
          )
        );
      } else {
        anyError = true;
        const data = await res.json().catch(() => ({}));
        setRows((prev) =>
          prev.map((r, idx) =>
            idx === i
              ? { ...r, status: "error", error: data?.error ?? "Failed" }
              : r
          )
        );
      }
    }

    setUploading(false);
    if (!anyError) {
      router.push(`/damage-calculator/${createdSessionId}`);
    }
  }

  const doneCount = rows.filter((r) => r.status === "done").length;
  const errorCount = rows.filter((r) => r.status === "error").length;
  const finished = rows.length > 0 && doneCount + errorCount === rows.length;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
              Label
            </span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={uploading}
              placeholder="2026-07-07_1"
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-violet-400 disabled:opacity-70 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
              Event
            </span>
            <input
              type="text"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              disabled={uploading}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-violet-400 disabled:opacity-70 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
          </label>
        </div>

        <div className="mb-3 flex gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="upload-mode"
              checked={mode === "folder"}
              disabled={uploading}
              onChange={() => {
                setMode("folder");
                setQueued([]);
                setUnrecognized([]);
              }}
            />
            Folder (phase subfolders)
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="upload-mode"
              checked={mode === "flat"}
              disabled={uploading}
              onChange={() => {
                setMode("flat");
                setQueued([]);
                setUnrecognized([]);
              }}
            />
            Flat screenshots (auto-detect stage)
          </label>
        </div>

        {mode === "folder" ? (
          <>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Screenshot folder
            </label>
            <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
              Pick the session folder (e.g. <code>2026-07-07_1</code>) — each phase
              subfolder (IV, III.iii, III.ii, …) should contain the fleets&apos;
              screenshots.
            </p>
            <input
              ref={folderInputRef}
              type="file"
              multiple
              onChange={(e) => handleFolderSelect(e.target.files)}
              disabled={uploading}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-violet-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-violet-700 disabled:opacity-70 dark:file:bg-violet-950/40 dark:file:text-violet-300"
            />
          </>
        ) : (
          <>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Screenshots
            </label>
            <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
              Select any flat batch of screenshots — the major stage (I-IV) is
              read from the numeric badge on the enemy portrait. The sub-stage
              (.i/.ii/.iii) is inferred from upload order, so screenshots must
              be selected in the order they were taken.
            </p>
            <input
              ref={flatInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => handleFlatSelect(e.target.files)}
              disabled={uploading}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-violet-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-violet-700 disabled:opacity-70 dark:file:bg-violet-950/40 dark:file:text-violet-300"
            />
          </>
        )}

        {queued.length > 0 && mode === "folder" && (
          <div className="mt-3 text-xs text-gray-600 dark:text-gray-400">
            <p className="font-medium text-gray-700 dark:text-gray-300">
              {queued.length} screenshot{queued.length === 1 ? "" : "s"} recognized:
            </p>
            <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {PHASES.filter((p) => queuedByPhase.has(p)).map((p) => (
                <li key={p}>
                  {p}: {queuedByPhase.get(p)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {queued.length > 0 && mode === "flat" && (
          <p className="mt-3 text-xs text-gray-600 dark:text-gray-400">
            {queued.length} screenshot{queued.length === 1 ? "" : "s"} queued, sorted by
            filename — stage will be detected during upload.
          </p>
        )}
        {unrecognized.length > 0 && (
          <p className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
            Skipped {unrecognized.length} file{unrecognized.length === 1 ? "" : "s"}
            {mode === "folder"
              ? ` not in a recognized phase folder (${PHASES.join(", ")}).`
              : " that aren't images."}
          </p>
        )}

        {submitError && (
          <p className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            {submitError}
          </p>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={startUpload}
            disabled={uploading || queued.length === 0 || !label.trim() || finished}
            className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {uploading
              ? `Processing ${doneCount + errorCount}/${rows.length}…`
              : `Upload & extract (${queued.length})`}
          </button>
          {finished && errorCount > 0 && sessionId && (
            <button
              type="button"
              onClick={() => router.push(`/damage-calculator/${sessionId}`)}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Continue to session anyway →
            </button>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
            Extraction progress
          </h2>
          <div className="space-y-1">
            {rows.map((r, i) => (
              <div
                key={i}
                className={`flex items-center justify-between gap-3 rounded border px-2 py-1.5 text-xs ${
                  r.status === "error"
                    ? "border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/40"
                    : r.status === "done"
                      ? r.warning
                        ? "border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/40"
                        : "border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/40"
                      : "border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/50"
                }`}
              >
                <span className="font-mono">{r.phase ?? "auto"}</span>
                <span className="flex-1 truncate text-gray-600 dark:text-gray-400">
                  {r.fileName}
                </span>
                <span className="shrink-0 font-medium">
                  {r.status === "pending" && "Queued"}
                  {r.status === "uploading" && "Extracting…"}
                  {r.status === "done" && (
                    <span
                      className="text-emerald-700 dark:text-emerald-300"
                      title={r.warning ?? undefined}
                    >
                      ✓ {r.fleetName}
                      {r.warning ? " ⚠" : ""}
                    </span>
                  )}
                  {r.status === "error" && (
                    <span className="text-red-700 dark:text-red-300" title={r.error}>
                      ✗ {r.error}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
