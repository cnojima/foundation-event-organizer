"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FieldHelp } from "@/components/field-help";

const MAX_NAME_LENGTH = 32;

export function InGameNameForm({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();
  const t = useTranslations("myAccount");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const [value, setValue] = useState(defaultValue);
  const [submitting, setSubmitting] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inGameName: value.trim() }),
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

  const dirty = value.trim() !== defaultValue.trim();

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border bg-white p-4"
    >
      <div>
        <label className="block text-sm font-medium mb-1">{t("inGameName")}</label>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={MAX_NAME_LENGTH}
          required
          className="w-full border rounded px-3 py-2"
        />
        <FieldHelp>{t("inGameNameHelp", { max: MAX_NAME_LENGTH })}</FieldHelp>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting || !dirty || !value.trim()}
          className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {submitting ? tCommon("saving") : tCommon("save")}
        </button>
        {savedAt && <span className="text-xs text-emerald-600">{tCommon("saved")}</span>}
      </div>
    </form>
  );
}
