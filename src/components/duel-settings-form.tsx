"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FieldHelp } from "@/components/field-help";

// Roman-numeral milestones I–XIII matching the in-game major power tiers.
// Order is significant — rendered top-down in the dropdown.
const POWER_TIERS = [
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
  "XI",
  "XII",
  "XIII",
] as const;
type PowerTier = (typeof POWER_TIERS)[number];

// Foundational settings for 1v1 duels: self-reported power tier,
// discoverability opt-out, and Discord-DM opt-out. All three PATCH
// /api/me; saved together via a single Save button to keep the UX
// consistent with the rest of My Account.
export function DuelSettingsForm({
  defaultPowerTier,
  defaultDiscoverable,
  defaultDmEnabled,
  discordLinked,
}: {
  defaultPowerTier: PowerTier | null;
  defaultDiscoverable: boolean;
  defaultDmEnabled: boolean;
  // True when the user has signed in with Discord at least once (so we
  // have a Discord ID to DM). When false, the DM toggle is shown but
  // greyed out with a hint to link Discord.
  discordLinked: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("myAccount");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");

  const [powerTier, setPowerTier] = useState<PowerTier | "">(
    defaultPowerTier ?? ""
  );
  const [discoverable, setDiscoverable] = useState(defaultDiscoverable);
  const [dmEnabled, setDmEnabled] = useState(defaultDmEnabled);
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
      body: JSON.stringify({
        powerTier: powerTier === "" ? null : powerTier,
        discoverableForDuels: discoverable,
        duelDmEnabled: dmEnabled,
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

  const dirty =
    powerTier !== (defaultPowerTier ?? "") ||
    discoverable !== defaultDiscoverable ||
    dmEnabled !== defaultDmEnabled;

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border bg-white p-4"
    >
      <div>
        <label className="block text-sm font-medium mb-1">
          {t("duels.powerTier")}
        </label>
        <select
          value={powerTier}
          onChange={(e) => setPowerTier(e.target.value as PowerTier | "")}
          className="w-full border rounded px-3 py-2 font-mono"
        >
          <option value="">{t("duels.powerTierNotSet")}</option>
          {POWER_TIERS.map((tier) => (
            <option key={tier} value={tier}>
              {tier}
            </option>
          ))}
        </select>
        <FieldHelp>{t("duels.powerTierHelp")}</FieldHelp>
      </div>

      <div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={discoverable}
            onChange={(e) => setDiscoverable(e.target.checked)}
            className="mt-0.5"
          />
          <span>{t("duels.discoverableLabel")}</span>
        </label>
        <FieldHelp>{t("duels.discoverableHelp")}</FieldHelp>
      </div>

      <div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={dmEnabled}
            onChange={(e) => setDmEnabled(e.target.checked)}
            disabled={!discordLinked}
            className="mt-0.5"
          />
          <span className={discordLinked ? "" : "text-gray-400"}>
            {t("duels.dmLabel")}
          </span>
        </label>
        <FieldHelp>
          {discordLinked
            ? t("duels.dmHelp")
            : t("duels.dmHelpUnlinked")}
        </FieldHelp>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

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
