"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { DatetimeLocalField } from "@/components/datetime-local-field";

type Tier = "ultra_high" | "high" | "mid" | "low";
type Classification = "high" | "mid" | "low";

const OFFICIAL_TIER_ANNOUNCEMENT_URL =
  "https://discord.com/channels/1275441685031157902/1275454764968312917/1532302222115733575";

function formatPowerM(power: number): string {
  return `${Math.round(power / 1_000_000)}M`;
}

function TierInfoChevron() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className="size-4 shrink-0 text-gray-400 transition-transform group-open:rotate-90 dark:text-gray-500"
    >
      <path
        d="M7 5l5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MigrationSettingsForm({
  destinationId,
  classification,
  opensAt,
  closesAt,
  windowClosed,
  allocations,
  thresholds,
  classificationStandards,
  canEditThresholds,
}: {
  destinationId: string;
  classification: Classification;
  opensAt: string;
  closesAt: string;
  windowClosed: boolean;
  allocations: { tier: Tier; maxSlots: number }[];
  thresholds: { tier: Tier; flavorName: string; minPower: number | null }[];
  classificationStandards: { classification: Classification; slotsByTier: Record<Tier, number> }[];
  canEditThresholds: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("migrationTrackerSettings");
  const tShared = useTranslations("migrationTracker");
  const tc = useTranslations("common");

  const tierInfoLines = thresholds.map((th, i) => {
    if (i === 0) return `${th.flavorName}: Above ${formatPowerM(th.minPower ?? 0)}`;
    const prevMinPower = thresholds[i - 1].minPower ?? 0;
    if (th.minPower === null) return `${th.flavorName}: Below ${formatPowerM(prevMinPower)}`;
    return `${th.flavorName}: ${formatPowerM(th.minPower)}–${formatPowerM(prevMinPower)}`;
  });

  const standardByClassification = Object.fromEntries(
    classificationStandards.map((s) => [s.classification, s.slotsByTier])
  ) as Record<Classification, Record<Tier, number>>;
  const classificationSlotLines = (slotsByTier: Record<Tier, number>) =>
    thresholds.map((th) => `${slotsByTier[th.tier]} ${th.flavorName}s`);
  const highSlotLines = classificationSlotLines(standardByClassification.high);
  const midSlotLines = classificationSlotLines(standardByClassification.mid);
  const lowSlotLines = classificationSlotLines(standardByClassification.low);

  const [datesSubmitting, setDatesSubmitting] = useState(false);
  const [datesError, setDatesError] = useState<string | null>(null);
  const [datesSaved, setDatesSaved] = useState(false);

  async function saveDates(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setDatesError(null);
    setDatesSaved(false);
    const form = new FormData(e.currentTarget);
    const nextOpensAt = String(form.get("opensAt") ?? "");
    const nextClosesAt = String(form.get("closesAt") ?? "");
    if (!nextOpensAt || !nextClosesAt) {
      setDatesError(t("errorDatesRequired"));
      return;
    }
    if (nextClosesAt <= nextOpensAt) {
      setDatesError(t("errorCloseAfterOpen"));
      return;
    }
    setDatesSubmitting(true);
    const res = await fetch(`/api/admin/migration-tracker/destinations/${destinationId}/dates`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opensAt: nextOpensAt, closesAt: nextClosesAt }),
    });
    setDatesSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setDatesError(data?.error ?? t("errorGeneric"));
      return;
    }
    setDatesSaved(true);
    router.refresh();
  }

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
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {t("datesHeading")}
        </h2>
        <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">{t("datesDesc")}</p>
        <form onSubmit={saveDates} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
              {t("opensAtLabel")}
            </label>
            <DatetimeLocalField name="opensAt" defaultUtcIso={opensAt} required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
              {t("closesAtLabel")}
            </label>
            <DatetimeLocalField name="closesAt" defaultUtcIso={closesAt} required />
          </div>
          {datesError && (
            <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              {datesError}
            </p>
          )}
          {datesSaved && !datesError && (
            <p className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
              {tc("saved")}
            </p>
          )}
          <button
            type="submit"
            disabled={datesSubmitting}
            className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {datesSubmitting ? tc("saving") : t("saveDates")}
          </button>
        </form>
      </div>

      <details className="group rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-gray-500 [&::-webkit-details-marker]:hidden dark:text-gray-400">
          <TierInfoChevron />
          {t("tierInfoHeading")}
        </summary>
        <div className="mt-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("tierInfoTiersHeading")}
              </p>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-gray-700 dark:text-gray-300">
                {tierInfoLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t("tierInfoHighServersHeading")}
                </p>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-gray-700 dark:text-gray-300">
                  {highSlotLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t("tierInfoMidServersHeading")}
                </p>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-gray-700 dark:text-gray-300">
                  {midSlotLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t("tierInfoLowServersHeading")}
                </p>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-gray-700 dark:text-gray-300">
                  {lowSlotLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <a
            href={OFFICIAL_TIER_ANNOUNCEMENT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block text-sm font-medium text-violet-600 hover:underline dark:text-violet-400"
          >
            {t("tierInfoDiscordLink")}
          </a>
        </div>
      </details>

      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {t("classificationHeading")}
        </h2>
        {windowClosed && (
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">{t("closedNote")}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {classificationOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSelectedClassification(opt.value)}
              disabled={windowClosed}
              className={`rounded-md border px-3 py-1.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
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
          disabled={windowClosed || classSubmitting || selectedClassification === classification}
          className="mt-3 rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {classSubmitting ? tc("saving") : t("saveClassification")}
        </button>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {t("allocationsHeading")}
        </h2>
        {windowClosed && (
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">{t("closedNote")}</p>
        )}
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
                disabled={windowClosed}
                value={allocationDrafts[a.tier]}
                onChange={(e) =>
                  setAllocationDrafts((prev) => ({ ...prev, [a.tier]: e.target.value }))
                }
                className="w-24 rounded border border-gray-300 px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800"
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
          disabled={windowClosed || allocSubmitting}
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
