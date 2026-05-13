"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FieldHelp } from "@/components/field-help";

export function GuildSettingsForm({
  guildId,
  defaultName,
  defaultDescription,
  defaultIsPublic,
  defaultServerNumber,
  defaultTag,
}: {
  guildId: string;
  defaultName: string;
  defaultDescription: string;
  defaultIsPublic: boolean;
  defaultServerNumber: string;
  defaultTag: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    const serverNumberRaw = String(form.get("serverNumber") ?? "").trim();
    const tagRaw = String(form.get("tag") ?? "").trim();
    const res = await fetch(`/api/guilds/${guildId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        description: form.get("description") || null,
        isPublic: form.get("isPublic") === "on",
        serverNumber: serverNumberRaw === "" ? null : Number(serverNumberRaw),
        tag: tagRaw === "" ? null : tagRaw,
      }),
    });
    if (res.ok) {
      setSavedAt(Date.now());
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Failed");
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div>
        <label className="block text-sm font-medium mb-1">Name</label>
        <input
          name="name"
          required
          defaultValue={defaultName}
          className="w-full border rounded px-3 py-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
        />
        <FieldHelp>Display name shown in the sidebar and discovery list.</FieldHelp>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <textarea
          name="description"
          rows={3}
          defaultValue={defaultDescription}
          className="w-full border rounded px-3 py-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
        />
        <FieldHelp>Optional. Shown on the public guild page to help recruiting.</FieldHelp>
      </div>
      <div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isPublic" defaultChecked={defaultIsPublic} />
          Listed in public discovery
        </label>
        <FieldHelp>
          When on, signed-in users can find this guild on /guilds and join with
          one click. When off, you can only invite members via invite link.
        </FieldHelp>
      </div>

      <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-4 dark:border-gray-800">
        <div>
          <label className="block text-sm font-medium mb-1">Server #</label>
          <input
            name="serverNumber"
            type="number"
            min={1001}
            max={9999}
            step={1}
            defaultValue={defaultServerNumber}
            placeholder="e.g. 1234"
            className="w-full border rounded px-3 py-2 font-mono dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
          />
          <FieldHelp>
            Game-server number (1001-9999). Optional. Shown for ops reference.
          </FieldHelp>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Guild Tag</label>
          <input
            name="tag"
            type="text"
            minLength={2}
            maxLength={4}
            defaultValue={defaultTag}
            placeholder="e.g. SHFT"
            className="w-full border rounded px-3 py-2 font-mono uppercase dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
          />
          <FieldHelp>
            2-4 characters. When set, prepended to every member&apos;s
            displayed name as <code>[TAG] name</code>.
          </FieldHelp>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-300">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {submitting ? "Saving..." : "Save"}
        </button>
        {savedAt && <span className="text-xs text-emerald-600 dark:text-emerald-300">Saved.</span>}
      </div>
    </form>
  );
}
