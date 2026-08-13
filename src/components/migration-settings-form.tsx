"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

type Tier = "ultra_high" | "high" | "mid" | "low";
type Classification = "high" | "mid" | "low";

export function MigrationSettingsForm({
  destinationId,
  classification,
  allocations,
  thresholds,
  canEditThresholds,
}: {
  destinationId: string;
  classification: Classification;
  allocations: { tier: Tier; maxSlots: number }[];
  thresholds: { tier: Tier; flavorName: string; minPower: number | null }[];
  canEditThresholds: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("migrationTrackerSettings");
  const tShared = useTranslations("migrationTracker");
  const tc = useTranslations("common");

  const tierLabel: Record<Tier, string> = {
    ultra_high: tShared("tierUltraHigh"),
    high: tShared("tierHigh"),
    mid: tShared("tierMid"),
    low: tShared("tierLow"),
  };
  const classificationOptions: { value: Classification; label: string }[] = [
    { value: "high", label: tShared("classificationHigh") },
    { value: "mid", label: tShared("classificationMid") },
    { value: "low", label: tShared("classificationLow") },
  ];

  const [selectedClassification, setSelectedClassification] = useState(classification);
  const [classSubmitting, setClassSubmitting] = useState(false);
  const [classError, setClassError] = useState<string | null>(null);

  const [allocationDrafts, setAllocationDrafts] = useState(
    Object.fromEntries(allocations.map((a) => [a.tier, String(a.maxSlots)]))
  );
  const [allocSubmitting, setAllocSubmitting] = useState(false);
  const [allocError, setAllocError] = useState<string | null>(null);
  const [allocSaved, setAllocSaved] = useState(false);

  const [thresholdDrafts, setThresholdDrafts] = useState(
    Object.fromEntries(thresholds.map((th) => [th.tier, th.minPower === null ? "" : String(th.minPower)]))
  );
  const [thresholdSubmitting, setThresholdSubmitting] = useState(false);
  const [thresholdError, setThresholdError] = useState<string | null>(null);
  const [thresholdSaved, setThresholdSaved] = useState(false);

  async function saveClassification() {
    setClassError(null);
    if (selectedClassification !== classification && !confirm(t("reclassifyConfirm"))) {
      return;
    }
    setClassSubmitting(true);
    const res = await fetch(`/api/admin/migration-tracker/destinations/${destinationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classification: selectedClassification }),
    });
    setClassSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setClassError(data?.error ?? t("errorGeneric"));
      return;
    }
    router.refresh();
  }

  async function saveAllocations() {
    setAllocError(null);
    setAllocSaved(false);
    const updates = Object.entries(allocationDrafts).map(([tier, value]) => ({
      tier,
      maxSlots: Number(value),
    }));
    if (updates.some((u) => !Number.isFinite(u.maxSlots) || u.maxSlots < 0)) {
      setAllocError(t("errorAllocation"));
      return;
    }
    setAllocSubmitting(true);
    const res = await fetch(`/api/admin/migration-tracker/destinations/${destinationId}/allocations`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    setAllocSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setAllocError(data?.error ?? t("errorGeneric"));
      return;
    }
    setAllocSaved(true);
    router.refresh();
  }

  async function saveThresholds() {
    setThresholdError(null);
    setThresholdSaved(false);
    const updates = Object.entries(thresholdDrafts).map(([tier, value]) => ({
      tier,
      minPower: value.trim() === "" ? null : Number(value),
    }));
    if (updates.some((u) => u.minPower !== null && !Number.isFinite(u.minPower))) {
      setThresholdError(t("errorThreshold"));
      return;
    }
    setThresholdSubmitting(true);
    const res = await fetch("/api/super-admin/migration-tracker/thresholds", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    setThresholdSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setThresholdError(data?.error ?? t("errorGeneric"));
      return;
    }
    setThresholdSaved(true);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {t("classificationHeading")}
        </h2>
        <div className="flex flex-wrap gap-2">
          {classificationOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSelectedClassification(opt.value)}
              className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${
                selectedClassification === opt.value
                  ? "border-violet-500 bg-violet-50 text-violet-700 dark:border-violet-500 dark:bg-violet-950/60 dark:text-violet-200"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {classError && (
          <p className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            {classError}
          </p>
        )}
        <button
          type="button"
          onClick={saveClassification}
          disabled={classSubmitting || selectedClassification === classification}
          className="mt-3 rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {classSubmitting ? tc("saving") : t("saveClassification")}
        </button>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {t("allocationsHeading")}
        </h2>
        <div className="space-y-2">
          {allocations.map((a) => (
            <div key={a.tier} className="flex items-center justify-between gap-3">
              <label htmlFor={`alloc-${a.tier}`} className="text-sm text-gray-700 dark:text-gray-300">
                {tierLabel[a.tier]}
              </label>
              <input
                id={`alloc-${a.tier}`}
                type="number"
                min={0}
                step={1}
                value={allocationDrafts[a.tier]}
                onChange={(e) =>
                  setAllocationDrafts((prev) => ({ ...prev, [a.tier]: e.target.value }))
                }
                className="w-24 rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
              />
            </div>
          ))}
        </div>
        {allocError && (
          <p className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            {allocError}
          </p>
        )}
        {allocSaved && !allocError && (
          <p className="mt-2 rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
            {tc("saved")}
          </p>
        )}
        <button
          type="button"
          onClick={saveAllocations}
          disabled={allocSubmitting}
          className="mt-3 rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {allocSubmitting ? tc("saving") : t("saveCaps")}
        </button>
      </div>

      {canEditThresholds && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-1 text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {t("thresholdsHeading")}
          </h2>
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">{t("thresholdsDesc")}</p>
          <div className="space-y-2">
            {thresholds.map((th) => (
              <div key={th.tier} className="flex items-center justify-between gap-3">
                <label htmlFor={`threshold-${th.tier}`} className="text-sm text-gray-700 dark:text-gray-300">
                  {tierLabel[th.tier]}
                </label>
                <input
                  id={`threshold-${th.tier}`}
                  type="number"
                  min={0}
                  step={1}
                  placeholder={t("thresholdPlaceholder")}
                  value={thresholdDrafts[th.tier]}
                  onChange={(e) =>
                    setThresholdDrafts((prev) => ({ ...prev, [th.tier]: e.target.value }))
                  }
                  className="w-40 rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
                />
              </div>
            ))}
          </div>
          {thresholdError && (
            <p className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              {thresholdError}
            </p>
          )}
          {thresholdSaved && !thresholdError && (
            <p className="mt-2 rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
              {tc("saved")}
            </p>
          )}
          <button
            type="button"
            onClick={saveThresholds}
            disabled={thresholdSubmitting}
            className="mt-3 rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {thresholdSubmitting ? tc("saving") : t("saveThresholds")}
          </button>
        </div>
      )}
    </div>
  );
}
