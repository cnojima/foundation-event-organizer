"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FieldHelp } from "@/components/field-help";

export function CreateInviteForm({ guildId }: { guildId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    const expiresAtInput = String(form.get("expiresAt") ?? "");
    const maxUsesInput = String(form.get("maxUses") ?? "");
    const body: Record<string, unknown> = {};
    // Input is wall-clock UTC; append :00Z so the parser treats it as such
    // regardless of viewer or server TZ.
    if (expiresAtInput)
      body.expiresAt = new Date(`${expiresAtInput}:00Z`).toISOString();
    if (maxUsesInput) body.maxUses = Number(maxUsesInput);

    const res = await fetch(`/api/guilds/${guildId}/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Failed");
    }
    setSubmitting(false);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-3 gap-3 rounded-lg border bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
    >
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1 dark:text-gray-400">
          Expires at (UTC, optional)
        </label>
        <input
          name="expiresAt"
          type="datetime-local"
          // 24-hour rendering to match the UTC label — see
          // DatetimeLocalField for the rationale.
          lang="en-GB"
          className="w-full border rounded px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
        <FieldHelp>Link stops working after this time (UTC). Blank = never expires.</FieldHelp>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1 dark:text-gray-400">
          Max uses (optional)
        </label>
        <input
          name="maxUses"
          type="number"
          min={1}
          className="w-full border rounded px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
        <FieldHelp>Number of joins allowed. Blank = unlimited.</FieldHelp>
      </div>
      <div className="flex items-end">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-violet-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {submitting ? "Creating..." : "Create"}
        </button>
      </div>
      {error && <p className="col-span-3 text-xs text-red-600 dark:text-red-300">{error}</p>}
    </form>
  );
}
