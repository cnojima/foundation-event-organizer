"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FieldHelp } from "@/components/field-help";
import { DatetimeLocalField } from "@/components/datetime-local-field";
import type { AdminTemplate } from "@/components/templates-admin";
import { snapSignupTime } from "@/lib/event-templates-shared";

type EventKind = "match" | "simple";

// The next upcoming Saturday at 14:00 UTC. If today is Saturday and 14:00
// UTC has already passed, returns the following Saturday. Pure UTC math,
// so the answer is the same regardless of the caller's timezone.
function nextSaturdayAt14UtcIso(now = new Date()): string {
  const sat = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 14, 0, 0, 0)
  );
  let dayDelta = (6 - sat.getUTCDay() + 7) % 7; // 6 = Saturday
  if (dayDelta === 0 && sat.getTime() <= now.getTime()) dayDelta = 7;
  sat.setUTCDate(sat.getUTCDate() + dayDelta);
  return sat.toISOString();
}

// Pick a template to auto-select on mount: prefer the first match-kind
// template (most guilds run primarily matches), otherwise the first
// template of any kind, otherwise null.
function pickInitialTemplate(templates: AdminTemplate[]): AdminTemplate | null {
  if (templates.length === 0) return null;
  return templates.find((t) => t.kind === "match") ?? templates[0];
}

export function CreateEventForm({
  guildIdOverride,
  templates,
  templatesEditHref,
}: {
  guildIdOverride?: string;
  // Per-guild presets that drive the form's initial values. Empty when the
  // guild has no templates yet — the form still works, just with no
  // preset prefill.
  templates: AdminTemplate[];
  // Link target for the "Edit templates" affordance below the picker.
  // Carries the super-admin impersonation guildId when applicable.
  templatesEditHref: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  // Computed once per mount — pure UTC math, so safe to read during render.
  const [defaultStartUtc] = useState(() => nextSaturdayAt14UtcIso());

  const initial = pickInitialTemplate(templates);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    initial?.id ?? ""
  );
  const [kind, setKind] = useState<EventKind>(initial?.kind ?? "match");
  const [name, setName] = useState(initial?.eventName ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [squad1Name, setSquad1Name] = useState(initial?.squad1Name ?? "Squad 1");
  const [squad2Name, setSquad2Name] = useState(initial?.squad2Name ?? "Squad 2");
  const [maxPlayers, setMaxPlayers] = useState(String(initial?.maxPlayers ?? 20));
  const [maxBackups, setMaxBackups] = useState(String(initial?.maxBackups ?? 10));
  const [leadershipSlots, setLeadershipSlots] = useState(
    String(initial?.leadershipSlots ?? 3)
  );

  // Snapped signup window values, computed from the initial template's
  // weekday+time-of-day against defaultStartUtc. Recomputed when a different
  // template is selected. null → no pre-fill (DatetimeLocalField empty).
  const initialOpens = initial
    ? snapWindow(initial.signupOpensWeekday, initial.signupOpensTimeUtc, defaultStartUtc)
    : null;
  const initialCloses = initial
    ? snapWindow(initial.signupClosesWeekday, initial.signupClosesTimeUtc, defaultStartUtc)
    : null;
  const [signupOpensUtc, setSignupOpensUtc] = useState<string | null>(initialOpens);
  const [signupClosesUtc, setSignupClosesUtc] = useState<string | null>(initialCloses);

  // Bumped each time a template is selected so the DatetimeLocalField
  // components remount with the new defaultUtcIso. They manage their own
  // internal state, so a key-change is the simplest way to "reset" them.
  const [templateVersion, setTemplateVersion] = useState(0);

  function applyTemplate(t: AdminTemplate) {
    setSelectedTemplateId(t.id);
    setKind(t.kind);
    setName(t.eventName);
    setDescription(t.description ?? "");
    setSquad1Name(t.squad1Name);
    setSquad2Name(t.squad2Name);
    setMaxPlayers(String(t.maxPlayers));
    setMaxBackups(String(t.maxBackups));
    setLeadershipSlots(String(t.leadershipSlots));
    setSignupOpensUtc(
      snapWindow(t.signupOpensWeekday, t.signupOpensTimeUtc, defaultStartUtc)
    );
    setSignupClosesUtc(
      snapWindow(t.signupClosesWeekday, t.signupClosesTimeUtc, defaultStartUtc)
    );
    setTemplateVersion((v) => v + 1);
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
      const suffix = guildIdOverride ? `?guildId=${guildIdOverride}` : "";
      router.push(`/admin/event/${data.id}${suffix}`);
      router.refresh();
      return;
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 border rounded-lg p-4 dark:border-gray-800">
      {templates.length > 0 && (
        <div className="rounded-md border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-900/60 dark:bg-violet-950/30">
          <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">
            Start from template
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedTemplateId}
              onChange={(e) => {
                const t = templates.find((x) => x.id === e.target.value);
                if (t) applyTemplate(t);
              }}
              className="flex-1 min-w-[12rem] border rounded px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.templateName} ({t.kind})
                </option>
              ))}
            </select>
            <Link
              href={templatesEditHref}
              className="text-xs font-semibold text-violet-700 hover:underline dark:text-violet-300"
            >
              Edit templates →
            </Link>
          </div>
          <FieldHelp>
            Picking a template fills the form with that preset&apos;s defaults.
            You can still edit any field before creating the event.
          </FieldHelp>
        </div>
      )}

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
            <DatetimeLocalField
              key={`gameTime-${templateVersion}`}
              name="gameTime"
              defaultUtcIso={defaultStartUtc}
            />
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
              <DatetimeLocalField
                key={`signupOpens-${templateVersion}`}
                name="signupOpens"
                defaultUtcIso={signupOpensUtc ?? undefined}
              />
              <FieldHelp>
                When players can start signing up. Leave blank to open immediately.
              </FieldHelp>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Signup Closes</label>
              <DatetimeLocalField
                key={`signupCloses-${templateVersion}`}
                name="signupCloses"
                defaultUtcIso={signupClosesUtc ?? undefined}
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
                value={squad1Name}
                onChange={(e) => setSquad1Name(e.target.value)}
                className="w-full border rounded px-3 py-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
              />
              <FieldHelp>Display name for the first squad.</FieldHelp>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Squad 1 Starts At</label>
              <DatetimeLocalField
                key={`squad1StartsAt-${templateVersion}`}
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
                value={squad2Name}
                onChange={(e) => setSquad2Name(e.target.value)}
                className="w-full border rounded px-3 py-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
              />
              <FieldHelp>Display name for the second squad.</FieldHelp>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Squad 2 Starts At</label>
              <DatetimeLocalField
                key={`squad2StartsAt-${templateVersion}`}
                name="squad2StartsAt"
              />
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
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(e.target.value)}
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
                value={maxBackups}
                onChange={(e) => setMaxBackups(e.target.value)}
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
                value={leadershipSlots}
                onChange={(e) => setLeadershipSlots(e.target.value)}
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

// Convenience wrapper around snapSignupTime — returns null if either half
// of the (weekday, time) pair is missing. The template UI enforces "both
// or neither", but be defensive.
function snapWindow(
  weekday: number | null,
  timeUtc: string | null,
  anchorIso: string
): string | null {
  if (weekday == null || !timeUtc) return null;
  return snapSignupTime(anchorIso, weekday, timeUtc);
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
