"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("guildSettingsPage");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
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
      setError(data?.error ?? te("failed"));
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div>
        <label className="block text-sm font-medium mb-1">{t("name")}</label>
        <input
          name="name"
          required
          defaultValue={defaultName}
          className="w-full border rounded px-3 py-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
        />
        <FieldHelp>{t("nameHelp")}</FieldHelp>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">{t("description")}</label>
        <textarea
          name="description"
          rows={3}
          defaultValue={defaultDescription}
          className="w-full border rounded px-3 py-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
        />
        <FieldHelp>{t("descriptionHelp")}</FieldHelp>
      </div>
      <div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isPublic" defaultChecked={defaultIsPublic} />
          {t("isPublic")}
        </label>
        <FieldHelp>{t("isPublicHelp")}</FieldHelp>
      </div>

      <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-4 dark:border-gray-800">
        <div>
          <label className="block text-sm font-medium mb-1">{t("serverNumber")}</label>
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
          <FieldHelp>{t("serverNumberHelp")}</FieldHelp>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{t("guildTag")}</label>
          <input
            name="tag"
            type="text"
            minLength={2}
            maxLength={4}
            defaultValue={defaultTag}
            placeholder="e.g. SHFT"
            className="w-full border rounded px-3 py-2 font-mono uppercase dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
          />
          <FieldHelp>{t("guildTagHelp")}</FieldHelp>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-300">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {submitting ? tc("saving") : tc("save")}
        </button>
        {savedAt && <span className="text-xs text-emerald-600 dark:text-emerald-300">{tc("saved")}</span>}
      </div>
    </form>
  );
}
