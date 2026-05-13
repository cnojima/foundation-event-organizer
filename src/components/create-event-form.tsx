"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FieldHelp } from "@/components/field-help";
import { DatetimeLocalField } from "@/components/datetime-local-field";

type EventKind = "match" | "simple";

// Per-kind defaults for the most common workflows. Match events get the
// Shadowfront-on-the-next-Saturday template; simple events default to the
// Paths to Dominance lore line. Admins switching kind get the new kind's
// defaults *only if they haven't edited the field* — otherwise their input
// is preserved (see handleKindChange below).
function matchDefaultName(saturdayIso: string): string {
  const d = new Date(saturdayIso);
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const day = d.toLocaleString("en-US", { day: "numeric", timeZone: "UTC" });
  return `Shadowfront ${month} ${day}`;
}

const KIND_DEFAULTS = {
  match: {
    description:
      "Win the battle and occupy the Drifting Vaults. Lead your Guild to victory!",
  },
  simple: {
    name: "Paths to Dominance",
    description:
      "The Ascendancy Fortress is changing hands. Korell's trade throne awaits a new ruler! Seize the Ascendancy Fortress, control trade, and earn glory. Forge your legend!",
  },
} as const;

// The next upcoming Saturday at 14:00 UTC. If today is Saturday and 14:00 UTC
// has already passed, returns the following Saturday. Pure UTC math, so the
// answer is the same regardless of the caller's timezone.
function nextSaturdayAt14UtcIso(now = new Date()): string {
  const sat = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 14, 0, 0, 0)
  );
  let dayDelta = (6 - sat.getUTCDay() + 7) % 7; // 6 = Saturday
  if (dayDelta === 0 && sat.getTime() <= now.getTime()) dayDelta = 7;
  sat.setUTCDate(sat.getUTCDate() + dayDelta);
  return sat.toISOString();
}

export function CreateEventForm({ guildIdOverride }: { guildIdOverride?: string } = {}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [kind, setKind] = useState<EventKind>("match");
  // Computed once per mount so it doesn't drift if the user leaves the form
  // open across midnight UTC. Pure UTC math — same value on server and
  // client, so it's safe to read during render.
  const [defaultStartUtc] = useState(() => nextSaturdayAt14UtcIso());

  // Controlled name + description so we can swap defaults when the admin
  // toggles between match and simple. Only swap when the field still holds
  // the *previous* kind's default — if the admin typed something custom,
  // we preserve it across the toggle.
  const matchDefaultsByDate = {
    name: matchDefaultName(defaultStartUtc),
    description: KIND_DEFAULTS.match.description,
  };
  const [name, setName] = useState<string>(matchDefaultsByDate.name);
  const [description, setDescription] = useState<string>(matchDefaultsByDate.description);

  function handleKindChange(next: EventKind) {
    if (next === kind) return;
    const oldDefaults =
      kind === "match" ? matchDefaultsByDate : KIND_DEFAULTS.simple;
    const newDefaults =
      next === "match" ? matchDefaultsByDate : KIND_DEFAULTS.simple;
    if (name === oldDefaults.name) setName(newDefaults.name);
    if (description === oldDefaults.description) setDescription(newDefaults.description);
    setKind(next);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);

    const form = new FormData(e.currentTarget);
    const baseBody: Record<string, unknown> = {
      kind,
      name: form.get("name"),
      description: form.get("description"),
    };
    if (guildIdOverride) baseBody.guildId = guildIdOverride;
    const body =
      kind === "match"
        ? {
            ...baseBody,
            squad1StartsAt: form.get("squad1StartsAt") || null,
            squad2StartsAt: form.get("squad2StartsAt") || null,
            signupOpens: form.get("signupOpens") || null,
            signupCloses: form.get("signupCloses") || null,
            squad1Name: form.get("squad1Name") || "Squad 1",
            squad2Name: form.get("squad2Name") || "Squad 2",
            maxPlayers: Number(form.get("maxPlayers")) || 20,
            maxBackups: Number(form.get("maxBackups")) || 10,
            leadershipSlots: Number(form.get("leadershipSlots")) || 3,
          }
        : { ...baseBody, gameTime: form.get("gameTime") || null };

    const res = await fetch("/api/admin/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = (await res.json()) as { id: string };
      // After creation, jump to the event's admin detail page so the user
      // can immediately review/edit. Preserve the super-admin impersonation
      // query param if it was passed in.
      const suffix = guildIdOverride ? `?guildId=${guildIdOverride}` : "";
      router.push(`/admin/event/${data.id}${suffix}`);
      router.refresh();
      return;
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 border rounded-lg p-4 dark:border-gray-800">
      <div>
        <label className="block text-sm font-medium mb-2">Event Type</label>
        <div className="grid grid-cols-2 gap-2">
          <KindOption
            value="match"
            current={kind}
            onSelect={handleKindChange}
            title="Match"
            description="Two squads, signups, and waitlist"
          />
          <KindOption
            value="simple"
            current={kind}
            onSelect={handleKindChange}
            title="Simple Event"
            description="Info-only — no squads or signups"
          />
        </div>
      </div>

      <div className={kind === "simple" ? "grid grid-cols-2 gap-4" : ""}>
        <div>
          <label className="block text-sm font-medium mb-1">Event Name *</label>
          <input
            name="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border rounded px-3 py-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
          />
          <FieldHelp>Shown to players in the event list and roster.</FieldHelp>
        </div>
        {kind === "simple" && (
          <div>
            <label className="block text-sm font-medium mb-1">Start Time</label>
            <DatetimeLocalField name="gameTime" defaultUtcIso={defaultStartUtc} />
            <FieldHelp>
              When the event starts. Used for the calendar download.
            </FieldHelp>
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <textarea
          name="description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full border rounded px-3 py-2"
        />
        <FieldHelp>Optional. Plain text shown on the event page.</FieldHelp>
      </div>

      {kind === "match" && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Signup Opens</label>
              <DatetimeLocalField name="signupOpens" />
              <FieldHelp>
                When players can start signing up. Leave blank to open immediately.
              </FieldHelp>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Signup Closes</label>
              <DatetimeLocalField name="signupCloses" />
              <FieldHelp>
                When the signup form locks. Existing signups can still be edited
                by admins. Leave blank for no deadline.
              </FieldHelp>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Squad 1 Name</label>
              <input
                name="squad1Name"
                defaultValue="Squad 1"
                className="w-full border rounded px-3 py-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
              />
              <FieldHelp>Display name for the first squad.</FieldHelp>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Squad 1 Starts At</label>
              <DatetimeLocalField
                name="squad1StartsAt"
                defaultUtcIso={defaultStartUtc}
              />
              <FieldHelp>
                When Squad 1 plays. Optional — can be set later.
              </FieldHelp>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Squad 2 Name</label>
              <input
                name="squad2Name"
                defaultValue="Squad 2"
                className="w-full border rounded px-3 py-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
              />
              <FieldHelp>Display name for the second squad.</FieldHelp>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Squad 2 Starts At</label>
              <DatetimeLocalField name="squad2StartsAt" />
              <FieldHelp>
                When Squad 2 plays. Optional — can be set later.
              </FieldHelp>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Max Players</label>
              <input
                name="maxPlayers"
                type="number"
                defaultValue={20}
                className="w-full border rounded px-3 py-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
              />
              <FieldHelp>
                Main roster size per squad. Includes leaders.
              </FieldHelp>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Max Backups</label>
              <input
                name="maxBackups"
                type="number"
                defaultValue={10}
                className="w-full border rounded px-3 py-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
              />
              <FieldHelp>
                Backup slots per squad. Once main + backup are full, new
                signups go to the waitlist.
              </FieldHelp>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Leadership Slots</label>
              <input
                name="leadershipSlots"
                type="number"
                defaultValue={3}
                className="w-full border rounded px-3 py-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
              />
              <FieldHelp>
                How many leader spots each squad has. Players request a leader
                role; admins assign it.
              </FieldHelp>
            </div>
          </div>
        </>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="px-6 py-2 bg-violet-600 text-white rounded-md hover:bg-violet-700 disabled:opacity-50"
      >
        {submitting ? "Creating..." : "Create Event"}
      </button>
    </form>
  );
}

function KindOption({
  value,
  current,
  onSelect,
  title,
  description,
}: {
  value: EventKind;
  current: EventKind;
  onSelect: (v: EventKind) => void;
  title: string;
  description: string;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`rounded-md border px-3 py-2 text-left transition-colors ${
        active
          ? "border-violet-500 bg-violet-50 ring-1 ring-violet-500 dark:bg-violet-950/40"
          : "border-gray-200 hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700"
      }`}
    >
      <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400">{description}</div>
    </button>
  );
}
