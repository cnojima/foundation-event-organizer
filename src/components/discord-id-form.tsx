"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FieldHelp } from "@/components/field-help";

// Manual Discord-user-ID entry for /me. No OAuth — the user looks up
// their ID in Discord (Developer Mode → right-click profile → Copy User
// ID) and pastes it here. The bot uses it for duel DM targeting.
//
// We don't verify ownership; format validation (17-20 digit snowflake)
// is enforced on the API side. Misuse is contained because the target
// Discord user can disable DMs from server members in their own
// settings.
export function DiscordIdForm({
  defaultValue,
}: {
  defaultValue: string | null;
}) {
  const router = useRouter();
  const t = useTranslations("myAccount.discord");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");

  const [value, setValue] = useState(defaultValue ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const trimmed = value.trim();
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        discordUserId: trimmed === "" ? null : trimmed,
      }),
    });
    if (res.ok) {
      setSavedAt(Date.now());
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? tErrors("failed"));
    }
    setSubmitting(false);
  }

  const dirty = value.trim() !== (defaultValue ?? "");

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium mb-1">
          {t("idLabel")}
        </label>
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. 235088799074484224"
          className="w-full border rounded px-3 py-2 font-mono text-sm"
        />
        <FieldHelp>{t("idHelp")}</FieldHelp>
      </div>
      {error && (
        <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting || !dirty}
          className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {submitting ? tCommon("saving") : tCommon("save")}
        </button>
        {savedAt && (
          <span className="text-xs text-emerald-600">{tCommon("saved")}</span>
        )}
      </div>
    </form>
  );
}
