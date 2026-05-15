"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FieldHelp } from "@/components/field-help";
import { WEEKDAY_LABELS } from "@/lib/event-templates-shared";

export type AdminTemplate = {
  id: string;
  templateName: string;
  eventName: string;
  description: string | null;
  kind: "match" | "simple";
  squad1Name: string;
  squad2Name: string;
  maxPlayers: number;
  maxBackups: number;
  leadershipSlots: number;
  signupOpensWeekday: number | null;
  signupOpensTimeUtc: string | null;
  signupClosesWeekday: number | null;
  signupClosesTimeUtc: string | null;
};

type Mode =
  | { kind: "list" }
  | { kind: "create" }
  | { kind: "edit"; templateId: string };

// Admin UI for managing per-guild event templates. Lists existing rows,
// expands into a create or edit form on demand, and posts to
// /api/admin/templates. Hot-reload after success via router.refresh() so
// the server-rendered list re-fetches without a full reload.
export function TemplatesAdmin({
  guildId,
  templates,
}: {
  // Used by super-admins acting on another guild — included in every PATCH
  // body so the API knows which guild to scope writes to. For regular
  // admins this equals their own guildId and the API would resolve it
  // anyway, but passing it unconditionally keeps the client behavior
  // identical across roles.
  guildId: string;
  templates: AdminTemplate[];
}) {
  const [mode, setMode] = useState<Mode>({ kind: "list" });

  if (mode.kind === "create") {
    return (
      <TemplateForm
        mode="create"
        guildId={guildId}
        onDone={() => setMode({ kind: "list" })}
        onCancel={() => setMode({ kind: "list" })}
      />
    );
  }

  if (mode.kind === "edit") {
    const target = templates.find((t) => t.id === mode.templateId);
    if (!target) {
      // Template was removed between render and edit click — drop back to
      // the list and let router.refresh() re-fetch on the next interaction.
      setMode({ kind: "list" });
      return null;
    }
    return (
      <TemplateForm
        mode="edit"
        guildId={guildId}
        existing={target}
        onDone={() => setMode({ kind: "list" })}
        onCancel={() => setMode({ kind: "list" })}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setMode({ kind: "create" })}
          className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
        >
          + New template
        </button>
      </div>
      {templates.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No templates yet. Click <strong>+ New template</strong> to add one.
        </p>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <TemplateRow
              key={t.id}
              template={t}
              onEdit={() => setMode({ kind: "edit", templateId: t.id })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateRow({
  template,
  onEdit,
}: {
  template: AdminTemplate;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (
      !window.confirm(
        `Delete template "${template.templateName}"? This cannot be undone from the UI.`
      )
    ) {
      return;
    }
    setDeleting(true);
    const res = await fetch(`/api/admin/templates/${template.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      window.alert(data?.error ?? "Delete failed.");
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {template.templateName}
          </h3>
          <p className="mt-0.5 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {template.kind}
          </p>
          <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
            Event name: <span className="font-medium">{template.eventName}</span>
          </p>
          {template.kind === "match" && (
            <>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {template.maxPlayers} players · {template.maxBackups} backups ·{" "}
                {template.leadershipSlots} leadership
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Signup window:{" "}
                {formatWindow(
                  template.signupOpensWeekday,
                  template.signupOpensTimeUtc
                )}{" "}
                →{" "}
                {formatWindow(
                  template.signupClosesWeekday,
                  template.signupClosesTimeUtc
                )}
              </p>
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/60"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatWindow(weekday: number | null, time: string | null): string {
  if (weekday == null || !time) return "not set";
  return `${WEEKDAY_LABELS[weekday]} ${time} UTC`;
}

function TemplateForm({
  mode,
  guildId,
  existing,
  onDone,
  onCancel,
}: {
  mode: "create" | "edit";
  guildId: string;
  existing?: AdminTemplate;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [templateName, setTemplateName] = useState(existing?.templateName ?? "");
  const [eventName, setEventName] = useState(existing?.eventName ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [kind, setKind] = useState<"match" | "simple">(existing?.kind ?? "match");
  const [squad1Name, setSquad1Name] = useState(existing?.squad1Name ?? "Squad 1");
  const [squad2Name, setSquad2Name] = useState(existing?.squad2Name ?? "Squad 2");
  const [maxPlayers, setMaxPlayers] = useState(String(existing?.maxPlayers ?? 20));
  const [maxBackups, setMaxBackups] = useState(String(existing?.maxBackups ?? 10));
  const [leadershipSlots, setLeadershipSlots] = useState(
    String(existing?.leadershipSlots ?? 3)
  );
  const [opensWeekday, setOpensWeekday] = useState<string>(
    existing?.signupOpensWeekday != null ? String(existing.signupOpensWeekday) : ""
  );
  const [opensTime, setOpensTime] = useState(existing?.signupOpensTimeUtc ?? "");
  const [closesWeekday, setClosesWeekday] = useState<string>(
    existing?.signupClosesWeekday != null
      ? String(existing.signupClosesWeekday)
      : ""
  );
  const [closesTime, setClosesTime] = useState(existing?.signupClosesTimeUtc ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const body = {
      guildId,
      templateName,
      eventName,
      description: description.trim() || null,
      kind,
      squad1Name,
      squad2Name,
      maxPlayers: Number(maxPlayers) || 20,
      maxBackups: Number(maxBackups) || 10,
      leadershipSlots: Number(leadershipSlots) || 3,
      signupOpensWeekday: opensWeekday === "" ? null : Number(opensWeekday),
      signupOpensTimeUtc: opensTime || null,
      signupClosesWeekday: closesWeekday === "" ? null : Number(closesWeekday),
      signupClosesTimeUtc: closesTime || null,
    };
    const url =
      mode === "create"
        ? "/api/admin/templates"
        : `/api/admin/templates/${existing?.id}`;
    const method = mode === "create" ? "POST" : "PATCH";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      router.refresh();
      onDone();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Save failed.");
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
    >
      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
        {mode === "create" ? "New template" : `Edit "${existing?.templateName}"`}
      </h3>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium mb-1">Template name</label>
          <input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            required
            className="w-full border rounded px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          <FieldHelp>Shown in the picker on the create-event form.</FieldHelp>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Default event name</label>
          <input
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            required
            className="w-full border rounded px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          <FieldHelp>Pre-fills the event&apos;s name field. Admin can override per event.</FieldHelp>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full border rounded px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Kind</label>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "match" | "simple")}
          className="border rounded px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        >
          <option value="match">Match (2 squads)</option>
          <option value="simple">Simple (info-only)</option>
        </select>
      </div>

      {kind === "match" && (
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium mb-1">Squad 1 name</label>
            <input
              value={squad1Name}
              onChange={(e) => setSquad1Name(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Squad 2 name</label>
            <input
              value={squad2Name}
              onChange={(e) => setSquad2Name(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
        </div>
      )}

      {kind === "match" && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="block text-sm font-medium mb-1">Max players</label>
              <input
                type="number"
                min={1}
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Max backups</label>
              <input
                type="number"
                min={0}
                value={maxBackups}
                onChange={(e) => setMaxBackups(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Leadership slots</label>
              <input
                type="number"
                min={0}
                value={leadershipSlots}
                onChange={(e) => setLeadershipSlots(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>
          </div>

          <div className="rounded-md border border-gray-200 bg-gray-50/60 p-3 dark:border-gray-800 dark:bg-gray-900/40">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Signup window (UTC)
            </h4>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Optional. When set, the create-event form snaps these to the
              weekday-and-time closest to (and not after) the event&apos;s start.
              Leave both pairs blank to skip pre-fill.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <SignupWindowRow
                label="Signup opens"
                weekday={opensWeekday}
                time={opensTime}
                onWeekday={setOpensWeekday}
                onTime={setOpensTime}
              />
              <SignupWindowRow
                label="Signup closes"
                weekday={closesWeekday}
                time={closesTime}
                onWeekday={setClosesWeekday}
                onTime={setClosesTime}
              />
            </div>
          </div>
        </>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-300">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {submitting ? "Saving…" : mode === "create" ? "Create template" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function SignupWindowRow({
  label,
  weekday,
  time,
  onWeekday,
  onTime,
}: {
  label: string;
  weekday: string;
  time: string;
  onWeekday: (v: string) => void;
  onTime: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1 dark:text-gray-400">
        {label}
      </label>
      <div className="flex gap-2">
        <select
          value={weekday}
          onChange={(e) => onWeekday(e.target.value)}
          className="flex-1 border rounded px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        >
          <option value="">— blank —</option>
          {WEEKDAY_LABELS.map((name, idx) => (
            <option key={idx} value={idx}>
              {name}
            </option>
          ))}
        </select>
        <input
          type="time"
          value={time}
          onChange={(e) => onTime(e.target.value)}
          step={60}
          className="border rounded px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
      </div>
    </div>
  );
}
