"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DatetimeLocalField } from "@/components/datetime-local-field";
import { DURATION_OPTIONS } from "@/lib/event-templates-shared";

type EventKind = "match" | "simple";

type FormDefaults = {
  name?: string;
  description?: string;
  kind?: EventKind;
  serverNumber?: number;
  gameTime?: string | null;
  squad1StartsAt?: string | null;
  squad2StartsAt?: string | null;
  signupOpens?: string | null;
  signupCloses?: string | null;
  squad1Name?: string;
  squad2Name?: string;
  maxPlayers?: number;
  maxBackups?: number;
  leadershipSlots?: number;
  durationMinutes?: number | null;
};

export function GlobalEventForm({
  serverNumbers,
  defaults,
  mode,
  globalEventId,
}: {
  serverNumbers: number[];
  defaults?: FormDefaults;
  mode: "create" | "edit";
  globalEventId?: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<EventKind>(defaults?.kind ?? "match");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = e.currentTarget;
    const fd = new FormData(form);

    const body: Record<string, unknown> = {
      name: fd.get("name"),
      description: fd.get("description") || null,
      kind,
      serverNumber: Number(fd.get("serverNumber")),
      durationMinutes: fd.get("durationMinutes") ? Number(fd.get("durationMinutes")) : null,
    };

    if (kind === "match") {
      body.squad1StartsAt = fd.get("squad1StartsAt") || null;
      body.squad2StartsAt = fd.get("squad2StartsAt") || null;
      body.signupOpens = fd.get("signupOpens") || null;
      body.signupCloses = fd.get("signupCloses") || null;
      body.squad1Name = fd.get("squad1Name");
      body.squad2Name = fd.get("squad2Name");
      body.maxPlayers = Number(fd.get("maxPlayers"));
      body.maxBackups = Number(fd.get("maxBackups"));
      body.leadershipSlots = Number(fd.get("leadershipSlots"));
    } else {
      body.gameTime = fd.get("gameTime") || null;
    }

    const url =
      mode === "create"
        ? "/api/super-admin/global-events"
        : `/api/super-admin/global-events/${globalEventId}`;
    const method = mode === "create" ? "POST" : "PATCH";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong");
        return;
      }
      router.push("/super-admin/global-events");
      router.refresh();
    } catch {
      setError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls =
    "w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100";
  const labelCls = "mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className={labelCls}>Event name</label>
          <input
            name="name"
            type="text"
            required
            defaultValue={defaults?.name ?? ""}
            className={inputCls}
            placeholder="Server Championship"
          />
        </div>

        <div>
          <label className={labelCls}>Kind</label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as EventKind)}
            className={inputCls}
            disabled={mode === "edit"}
          >
            <option value="match">Match (two squads)</option>
            <option value="simple">Simple (info only)</option>
          </select>
        </div>

        <div>
          <label className={labelCls}>Server number</label>
          {serverNumbers.length > 0 ? (
            <select
              name="serverNumber"
              required
              defaultValue={defaults?.serverNumber ?? ""}
              className={inputCls}
              disabled={mode === "edit"}
            >
              <option value="">Select server…</option>
              {serverNumbers.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          ) : (
            <input
              name="serverNumber"
              type="number"
              required
              defaultValue={defaults?.serverNumber ?? ""}
              className={inputCls}
              placeholder="e.g. 1234"
            />
          )}
          {mode === "edit" && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Server cannot be changed after creation.
            </p>
          )}
        </div>
      </div>

      <div>
        <label className={labelCls}>Description</label>
        <textarea
          name="description"
          defaultValue={defaults?.description ?? ""}
          rows={3}
          className={inputCls}
          placeholder="Optional details shown to members…"
        />
      </div>

      {kind === "match" ? (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Squad 1 name</label>
            <input
              name="squad1Name"
              type="text"
              defaultValue={defaults?.squad1Name ?? "Squad 1"}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Squad 2 name</label>
            <input
              name="squad2Name"
              type="text"
              defaultValue={defaults?.squad2Name ?? "Squad 2"}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Squad 1 start (UTC)</label>
            <DatetimeLocalField
              name="squad1StartsAt"
              defaultUtcIso={defaults?.squad1StartsAt ?? undefined}
            />
          </div>
          <div>
            <label className={labelCls}>Squad 2 start (UTC)</label>
            <DatetimeLocalField
              name="squad2StartsAt"
              defaultUtcIso={defaults?.squad2StartsAt ?? undefined}
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Start time (UTC)</label>
            <DatetimeLocalField
              name="gameTime"
              defaultUtcIso={defaults?.gameTime ?? undefined}
            />
          </div>
          {/* Unused squad inputs hidden so FormData keys are absent */}
          <input type="hidden" name="squad1Name" value={defaults?.squad1Name ?? "Squad 1"} />
          <input type="hidden" name="squad2Name" value={defaults?.squad2Name ?? "Squad 2"} />
        </div>
      )}

      {kind === "match" && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Signup opens (UTC)</label>
            <DatetimeLocalField
              name="signupOpens"
              defaultUtcIso={defaults?.signupOpens ?? undefined}
            />
          </div>
          <div>
            <label className={labelCls}>Signup closes (UTC)</label>
            <DatetimeLocalField
              name="signupCloses"
              defaultUtcIso={defaults?.signupCloses ?? undefined}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Duration</label>
          <select name="durationMinutes" defaultValue={defaults?.durationMinutes ?? ""} className={inputCls}>
            {DURATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {kind === "match" && (
        <fieldset className="rounded border border-gray-200 p-4 dark:border-gray-700">
          <legend className="px-1 text-sm font-semibold text-gray-700 dark:text-gray-300">
            Roster limits (per guild)
          </legend>
          <div className="mt-2 grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Max players</label>
              <input
                name="maxPlayers"
                type="number"
                min={1}
                max={100}
                defaultValue={defaults?.maxPlayers ?? 20}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Max backups</label>
              <input
                name="maxBackups"
                type="number"
                min={0}
                max={100}
                defaultValue={defaults?.maxBackups ?? 10}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Leadership slots</label>
              <input
                name="leadershipSlots"
                type="number"
                min={0}
                max={20}
                defaultValue={defaults?.leadershipSlots ?? 3}
                className={inputCls}
              />
            </div>
          </div>
        </fieldset>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.push("/super-admin/global-events")}
          className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
        >
          {submitting
            ? mode === "create"
              ? "Creating…"
              : "Saving…"
            : mode === "create"
              ? "Create & Publish"
              : "Save Changes"}
        </button>
      </div>
    </form>
  );
}
