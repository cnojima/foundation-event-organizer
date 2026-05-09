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
    if (expiresAtInput) body.expiresAt = new Date(expiresAtInput).toISOString();
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
      className="grid grid-cols-3 gap-3 rounded-lg border bg-white p-4"
    >
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Expires at (optional)
        </label>
        <input
          name="expiresAt"
          type="datetime-local"
          className="w-full border rounded px-2 py-1 text-sm"
        />
        <FieldHelp>Link stops working after this time. Blank = never expires.</FieldHelp>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Max uses (optional)
        </label>
        <input
          name="maxUses"
          type="number"
          min={1}
          className="w-full border rounded px-2 py-1 text-sm"
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
      {error && <p className="col-span-3 text-xs text-red-600">{error}</p>}
    </form>
  );
}
