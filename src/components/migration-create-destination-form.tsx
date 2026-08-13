"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { DatetimeLocalField } from "@/components/datetime-local-field";

type Classification = "high" | "mid" | "low";

export function MigrationCreateDestinationForm() {
  const router = useRouter();
  const t = useTranslations("migrationTrackerCreate");
  const tShared = useTranslations("migrationTracker");
  const tc = useTranslations("common");

  const classificationOptions: { value: Classification; label: string }[] = [
    { value: "high", label: tShared("classificationHigh") },
    { value: "mid", label: tShared("classificationMid") },
    { value: "low", label: tShared("classificationLow") },
  ];

  const [serverNumber, setServerNumber] = useState("");
  const [classification, setClassification] = useState<Classification | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const serverNumberValue = Number(serverNumber);
    if (!Number.isInteger(serverNumberValue) || serverNumberValue < 1001 || serverNumberValue > 9999) {
      setError(t("errorServerNumber"));
      return;
    }
    if (!classification) {
      setError(t("errorClassificationRequired"));
      return;
    }

    const form = new FormData(e.currentTarget);
    const opensAt = String(form.get("opensAt") ?? "");
    const closesAt = String(form.get("closesAt") ?? "");
    if (!opensAt || !closesAt) {
      setError(t("errorDatesRequired"));
      return;
    }
    if (closesAt <= opensAt) {
      setError(t("errorCloseAfterOpen"));
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/super-admin/migration-tracker/destinations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serverNumber: serverNumberValue, classification, opensAt, closesAt }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data?.error ?? t("errorGeneric"));
      setSubmitting(false);
      return;
    }
    router.push(`/admin/migration-tracker/${data.destination.id}/settings`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-md border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
    >
      <div>
        <label htmlFor="mtc-server-number" className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
          {t("serverNumberLabel")}
        </label>
        <input
          id="mtc-server-number"
          type="number"
          inputMode="numeric"
          required
          min={1001}
          max={9999}
          value={serverNumber}
          onChange={(e) => setServerNumber(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-gray-700 dark:text-gray-300">{t("classificationLabel")}</p>
        <div className="flex flex-wrap gap-2">
          {classificationOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setClassification(opt.value)}
              className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${
                classification === opt.value
                  ? "border-violet-500 bg-violet-50 text-violet-700 dark:border-violet-500 dark:bg-violet-950/60 dark:text-violet-200"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
          {t("opensAtLabel")}
        </label>
        <DatetimeLocalField name="opensAt" required />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
          {t("closesAtLabel")}
        </label>
        <DatetimeLocalField name="closesAt" required />
      </div>

      {error && (
        <p
          className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
          role="alert"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
      >
        {submitting ? tc("submitting") : t("submitButton")}
      </button>
    </form>
  );
}
