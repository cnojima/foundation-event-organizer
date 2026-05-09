"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FieldHelp } from "@/components/field-help";

export function GuildSettingsForm({
  guildId,
  defaultName,
  defaultDescription,
  defaultIsPublic,
}: {
  guildId: string;
  defaultName: string;
  defaultDescription: string;
  defaultIsPublic: boolean;
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
    const res = await fetch(`/api/guilds/${guildId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        description: form.get("description") || null,
        isPublic: form.get("isPublic") === "on",
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
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border bg-white p-4">
      <div>
        <label className="block text-sm font-medium mb-1">Name</label>
        <input
          name="name"
          required
          defaultValue={defaultName}
          className="w-full border rounded px-3 py-2"
        />
        <FieldHelp>Display name shown in the sidebar and discovery list.</FieldHelp>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <textarea
          name="description"
          rows={3}
          defaultValue={defaultDescription}
          className="w-full border rounded px-3 py-2"
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
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {submitting ? "Saving..." : "Save"}
        </button>
        {savedAt && <span className="text-xs text-emerald-600">Saved.</span>}
      </div>
    </form>
  );
}
