"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FieldHelp } from "@/components/field-help";

type EventKind = "match" | "simple";

export function CreateEventForm({ guildIdOverride }: { guildIdOverride?: string } = {}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [kind, setKind] = useState<EventKind>("match");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);

    const form = new FormData(e.currentTarget);
    const baseBody: Record<string, unknown> = {
      kind,
      name: form.get("name"),
      description: form.get("description"),
      gameTime: form.get("gameTime") || null,
    };
    if (guildIdOverride) baseBody.guildId = guildIdOverride;
    const body =
      kind === "match"
        ? {
            ...baseBody,
            signupOpens: form.get("signupOpens") || null,
            signupCloses: form.get("signupCloses") || null,
            squad1Name: form.get("squad1Name") || "Squad 1",
            squad2Name: form.get("squad2Name") || "Squad 2",
            maxPlayers: Number(form.get("maxPlayers")) || 20,
            maxBackups: Number(form.get("maxBackups")) || 10,
            leadershipSlots: Number(form.get("leadershipSlots")) || 3,
          }
        : baseBody;

    const res = await fetch("/api/admin/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      router.refresh();
      (e.target as HTMLFormElement).reset();
      setKind("match");
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 border rounded-lg p-4">
      <div>
        <label className="block text-sm font-medium mb-2">Event Type</label>
        <div className="grid grid-cols-2 gap-2">
          <KindOption
            value="match"
            current={kind}
            onSelect={setKind}
            title="Match"
            description="Two squads, signups, and waitlist"
          />
          <KindOption
            value="simple"
            current={kind}
            onSelect={setKind}
            title="Simple Event"
            description="Info-only — no squads or signups"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Event Name *</label>
          <input
            name="name"
            required
            className="w-full border rounded px-3 py-2"
          />
          <FieldHelp>Shown to players in the event list and roster.</FieldHelp>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            {kind === "simple" ? "Start Time" : "Game Time"}
          </label>
          <input
            name="gameTime"
            type="datetime-local"
            className="w-full border rounded px-3 py-2"
          />
          <FieldHelp>
            {kind === "simple"
              ? "When the event starts. Used for the calendar download."
              : "When the match begins. Used for the calendar download."}
          </FieldHelp>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <textarea name="description" rows={2} className="w-full border rounded px-3 py-2" />
        <FieldHelp>Optional. Plain text shown on the event page.</FieldHelp>
      </div>

      {kind === "match" && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Signup Opens</label>
              <input
                name="signupOpens"
                type="datetime-local"
                className="w-full border rounded px-3 py-2"
              />
              <FieldHelp>
                When players can start signing up. Leave blank to open immediately.
              </FieldHelp>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Signup Closes</label>
              <input
                name="signupCloses"
                type="datetime-local"
                className="w-full border rounded px-3 py-2"
              />
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
                className="w-full border rounded px-3 py-2"
              />
              <FieldHelp>Display name for the first squad.</FieldHelp>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Squad 2 Name</label>
              <input
                name="squad2Name"
                defaultValue="Squad 2"
                className="w-full border rounded px-3 py-2"
              />
              <FieldHelp>Display name for the second squad.</FieldHelp>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Max Players</label>
              <input
                name="maxPlayers"
                type="number"
                defaultValue={20}
                className="w-full border rounded px-3 py-2"
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
                className="w-full border rounded px-3 py-2"
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
                className="w-full border rounded px-3 py-2"
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
          ? "border-violet-500 bg-violet-50 ring-1 ring-violet-500"
          : "border-gray-200 hover:border-gray-300"
      }`}
    >
      <div className="text-sm font-semibold text-gray-900">{title}</div>
      <div className="text-xs text-gray-500">{description}</div>
    </button>
  );
}
