"use client";

import { useState } from "react";
import { RichTextEditor } from "@/components/rich-text-editor";
import { useRouter } from "next/navigation";
import { FieldHelp } from "@/components/field-help";
import { DURATION_OPTIONS } from "@/lib/event-templates-shared";
import { DatetimeLocalHint } from "@/components/datetime-local-hint";
import { EventKindHero, type EventKindIconKind } from "@/components/event-kind-icon";

// All editable fields surfaced on /admin/event/[id]/edit. Mirrors the
// CreateEventForm field set minus `kind` — once an event is created, its
// kind is fixed (the PATCH API rejects kind changes; switching kind has
// cascading effects on signups/scrim lifecycle that this surface doesn't
// model). Admins who want a different kind delete and recreate.

// <input type="datetime-local"> wants "YYYY-MM-DDTHH:MM". The app treats
// the input as UTC wall-clock — what you type is what's saved.
function isoToUtcInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
    d.getUTCDate()
  )}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function utcInputToIso(input: string): string | null {
  if (!input) return null;
  const d = new Date(`${input}:00Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export type EditEventFormInitial = {
  id: string;
  kind: EventKindIconKind;
  name: string;
  description: string | null;
  squad1Name: string;
  squad2Name: string;
  maxPlayers: number;
  maxBackups: number;
  leadershipSlots: number;
  gameTime: string | null;
  durationMinutes: number | null;
  signupOpens: string | null;
  signupCloses: string | null;
  squad1StartsAt: string | null;
  squad2StartsAt: string | null;
};


export function EditEventForm({
  initial,
  cancelHref,
  successHref,
}: {
  initial: EditEventFormInitial;
  cancelHref: string;
  // Where to navigate after a successful save. Defaults to /event/[id] so
  // the admin sees the result on the player-facing detail.
  successHref?: string;
}) {
  const router = useRouter();
  const isMatch = initial.kind === "match";
  const isScrim = initial.kind === "scrim";
  const isSimple = initial.kind === "simple";

  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? "");
  const [squad1Name, setSquad1Name] = useState(initial.squad1Name);
  const [squad2Name, setSquad2Name] = useState(initial.squad2Name);
  const [maxPlayers, setMaxPlayers] = useState(String(initial.maxPlayers));
  const [maxBackups, setMaxBackups] = useState(String(initial.maxBackups));
  const [leadershipSlots, setLeadershipSlots] = useState(
    String(initial.leadershipSlots)
  );
  const [gameTime, setGameTime] = useState(isoToUtcInput(initial.gameTime));
  const [durationMinutes, setDurationMinutes] = useState(
    String(initial.durationMinutes ?? "")
  );
  const [signupOpens, setSignupOpens] = useState(isoToUtcInput(initial.signupOpens));
  const [signupCloses, setSignupCloses] = useState(
    isoToUtcInput(initial.signupCloses)
  );
  const [squad1StartsAt, setSquad1StartsAt] = useState(
    isoToUtcInput(initial.squad1StartsAt)
  );
  const [squad2StartsAt, setSquad2StartsAt] = useState(
    isoToUtcInput(initial.squad2StartsAt)
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    // Build the patch body per-kind. Date fields use the shared
    // isoToUtcInput / utcInputToIso pair so empty → null.
    const body: Record<string, string | number | null> = {
      name,
      description: description.trim() === "" ? null : description.trim(),
      durationMinutes: durationMinutes ? Number(durationMinutes) : null,
    };
    if (isMatch || isScrim) {
      body.squad1Name = squad1Name;
      body.maxPlayers = Number(maxPlayers);
      body.maxBackups = Number(maxBackups);
      body.leadershipSlots = Number(leadershipSlots);
    }
    if (isMatch) {
      body.squad2Name = squad2Name;
      body.signupOpens = utcInputToIso(signupOpens);
      body.signupCloses = utcInputToIso(signupCloses);
      body.squad1StartsAt = utcInputToIso(squad1StartsAt);
      body.squad2StartsAt = utcInputToIso(squad2StartsAt);
    }
    if (isSimple || isScrim) {
      body.gameTime = utcInputToIso(gameTime);
    }

    setSubmitting(true);
    const res = await fetch(`/api/admin/events/${initial.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      router.push(successHref ?? `/event/${initial.id}`);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Failed");
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900"
    >
      <div className="flex items-center gap-3">
        <EventKindHero kind={initial.kind} size="md" />
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">
            Event kind
          </p>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {initial.kind}
            <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
              (kind is fixed — delete and recreate to change)
            </span>
          </p>
        </div>
      </div>

      {/* Always: name + description */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="ev-name" className="block text-sm font-medium mb-1">
            Name
          </label>
          <input
            id="ev-name"
            type="text"
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
        </div>
      </div>

      <div>
        <label htmlFor="ev-description" className="block text-sm font-medium mb-1">
          Description
        </label>
        <RichTextEditor value={description} onChange={setDescription} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="ev-duration" className="block text-sm font-medium mb-1">
            Duration
          </label>
          <select
            id="ev-duration"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
          >
            {DURATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <FieldHelp>How long the event runs. Sets the end time in calendar exports and determines when the event moves to the Past tab.</FieldHelp>
        </div>
      </div>

      {/* Squads + slots — match and scrim only. Scrim has a single squad
          (the home guild's lineup) so it suppresses squad2. */}
      {(isMatch || isScrim) && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="ev-squad1" className="block text-sm font-medium mb-1">
              {isScrim ? "Squad name" : "Squad 1 name"}
            </label>
            <input
              id="ev-squad1"
              type="text"
              required
              maxLength={40}
              value={squad1Name}
              onChange={(e) => setSquad1Name(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
            />
          </div>
          {isMatch && (
            <div>
              <label htmlFor="ev-squad2" className="block text-sm font-medium mb-1">
                Squad 2 name
              </label>
              <input
                id="ev-squad2"
                type="text"
                required
                maxLength={40}
                value={squad2Name}
                onChange={(e) => setSquad2Name(e.target.value)}
                className="w-full rounded border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
              />
            </div>
          )}
          <div>
            <label htmlFor="ev-max" className="block text-sm font-medium mb-1">
              Max players {isMatch && "(per squad)"}
            </label>
            <input
              id="ev-max"
              type="number"
              min={1}
              max={100}
              required
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
            />
          </div>
          <div>
            <label htmlFor="ev-backups" className="block text-sm font-medium mb-1">
              Max backups {isMatch && "(per squad)"}
            </label>
            <input
              id="ev-backups"
              type="number"
              min={0}
              max={100}
              required
              value={maxBackups}
              onChange={(e) => setMaxBackups(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
            />
          </div>
          <div>
            <label htmlFor="ev-leads" className="block text-sm font-medium mb-1">
              Leadership slots {isMatch && "(per squad)"}
            </label>
            <input
              id="ev-leads"
              type="number"
              min={0}
              max={20}
              required
              value={leadershipSlots}
              onChange={(e) => setLeadershipSlots(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
            />
          </div>
        </div>
      )}

      {/* Date fields. Match has signup window + per-squad starts. Simple
          and scrim have a single start time (gameTime). */}
      <div className="grid gap-4 sm:grid-cols-2">
        {isMatch && (
          <>
            <DateField
              id="ev-signup-opens"
              label="Signup opens"
              value={signupOpens}
              onChange={setSignupOpens}
              help="When players can start signing up. Leave blank to open immediately."
            />
            <DateField
              id="ev-signup-closes"
              label="Signup closes"
              value={signupCloses}
              onChange={setSignupCloses}
              help="When the signup form locks. Leave blank for no deadline."
            />
            <DateField
              id="ev-squad1-starts"
              label={`${squad1Name || "Squad 1"} starts at`}
              value={squad1StartsAt}
              onChange={setSquad1StartsAt}
              help="When this squad plays. Leave blank if not scheduled yet."
            />
            <DateField
              id="ev-squad2-starts"
              label={`${squad2Name || "Squad 2"} starts at`}
              value={squad2StartsAt}
              onChange={setSquad2StartsAt}
              help="When this squad plays. Leave blank if not scheduled yet."
            />
          </>
        )}
        {(isSimple || isScrim) && (
          <DateField
            id="ev-game-time"
            label="Start time"
            value={gameTime}
            onChange={setGameTime}
            help="When the event starts."
          />
        )}
      </div>

      {error && (
        <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => router.push(cancelHref)}
          disabled={submitting}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function DateField({
  id,
  label,
  value,
  onChange,
  help,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  help: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium mb-1">
        {label}
      </label>
      <input
        id={id}
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        step={600}
        lang="en-GB"
        className="w-full rounded border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
      />
      <DatetimeLocalHint value={value} />
      <FieldHelp>{help}</FieldHelp>
    </div>
  );
}
