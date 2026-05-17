"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FieldHelp } from "@/components/field-help";

function suggestSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export function CreateGuildForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [tag, setTag] = useState("");
  const [serverNumber, setServerNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(suggestSlug(value));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/guilds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        slug,
        tag: tag.trim(),
        serverNumber: serverNumber === "" ? null : Number(serverNumber),
        description: form.get("description") || null,
        isPublic: form.get("isPublic") === "on",
      }),
    });
    if (res.ok) {
      // Land new admins on the setup checklist rather than the empty
      // event listing — first-time creators have 5+ required steps left.
      router.push("/admin/setup");
      router.refresh();
      return;
    }
    const data = await res.json().catch(() => ({}));
    setError(data?.error ?? "Failed to create");
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div>
        <label className="block text-sm font-medium mb-1">Name *</label>
        <input
          required
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          className="w-full border rounded px-3 py-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
        />
        <FieldHelp>Display name shown in the sidebar and discovery list.</FieldHelp>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Slug *</label>
        <input
          required
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value.toLowerCase());
            setSlugTouched(true);
          }}
          pattern="[a-z0-9\-]{3,40}"
          className="w-full border rounded px-3 py-2 font-mono dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
        />
        <FieldHelp>
          URL-safe ID. 3-40 chars: a-z, 0-9, hyphens. Permanent — can&apos;t be
          changed after creation.
        </FieldHelp>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Server # *</label>
          <input
            required
            type="number"
            min={1001}
            max={9999}
            step={1}
            value={serverNumber}
            onChange={(e) => setServerNumber(e.target.value)}
            placeholder="e.g. 1234"
            className="w-full border rounded px-3 py-2 font-mono dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
          />
          <FieldHelp>Game-server number (1001-9999).</FieldHelp>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Guild Tag *</label>
          <input
            required
            type="text"
            minLength={2}
            maxLength={4}
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="e.g. SHFT"
            className="w-full border rounded px-3 py-2 font-mono uppercase dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
          />
          <FieldHelp>
            2-4 characters. Prepended to every member&apos;s name as{" "}
            <code>[TAG] name</code>.
          </FieldHelp>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <textarea name="description" rows={3} className="w-full border rounded px-3 py-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500" />
        <FieldHelp>Optional. Shown on the public guild page.</FieldHelp>
      </div>
      <div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isPublic" defaultChecked />
          Listed in public discovery
        </label>
        <FieldHelp>
          When on, anyone signed in can find your guild on /guilds and join.
          When off, only people with an invite link can join.
        </FieldHelp>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-300">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
      >
        {submitting ? "Creating..." : "Create Guild"}
      </button>
    </form>
  );
}
