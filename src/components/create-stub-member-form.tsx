"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FieldHelp } from "@/components/field-help";

// Admin-only form: pre-creates a "stub" guild member with no OAuth account
// attached. The stub functions as a regular member (rosterable, DM-able if
// discordUserId is set) until the player signs in for the first time, at
// which point Auth.js merges the OAuth identity onto the stub via either
// the Discord snowflake or a matching email.
export function CreateStubMemberForm({ guildId }: { guildId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [inGameName, setInGameName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [discordUserId, setDiscordUserId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await fetch("/api/admin/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guildId,
        inGameName: inGameName.trim(),
        name: name.trim() || null,
        email: email.trim() || null,
        discordUserId: discordUserId.trim() || null,
      }),
    });
    if (res.ok) {
      setInGameName("");
      setName("");
      setEmail("");
      setDiscordUserId("");
      setOpen(false);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Failed");
    }
    setSubmitting(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-violet-300 bg-violet-50 px-3 py-1.5 text-sm font-semibold text-violet-700 hover:bg-violet-100 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-900/50"
      >
        + Add pre-claim member
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Add pre-claim member
        </h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400"
        >
          Cancel
        </button>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Creates a member record for a player who hasn&rsquo;t signed in yet.
        When they sign in via Discord (matched on Discord ID) or Google
        (matched on email), the account auto-attaches to this record.
      </p>

      <div>
        <label className="block text-sm font-medium mb-1">In-game name *</label>
        <input
          type="text"
          required
          maxLength={40}
          value={inGameName}
          onChange={(e) => setInGameName(e.target.value)}
          className="w-full rounded border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Display name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
        <FieldHelp>
          Optional. Pre-fills the &ldquo;name&rdquo; field until they sign in.
        </FieldHelp>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Discord User ID</label>
        <input
          type="text"
          inputMode="numeric"
          value={discordUserId}
          onChange={(e) => setDiscordUserId(e.target.value)}
          placeholder="e.g. 235088799074484224"
          className="w-full rounded border px-3 py-2 font-mono text-sm dark:border-gray-700 dark:bg-gray-800"
        />
        <FieldHelp>
          17–20 digit snowflake. Enables Discord DMs immediately AND auto-claim
          on first Discord sign-in.
        </FieldHelp>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
        <FieldHelp>
          Optional. Auto-claims on first Google sign-in if the address matches.
          A typo could silently merge with the wrong account, so leave blank if
          unsure.
        </FieldHelp>
      </div>

      {error && (
        <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting || inGameName.trim() === ""}
          className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Create member"}
        </button>
      </div>
    </form>
  );
}
