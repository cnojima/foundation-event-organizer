import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { DateTime } from "@/components/date-time";
import { getActiveDestinations, getCapacitySummary, getWindowStatus } from "@/lib/migration-tracker";

// Big CTA banner pointing signed-out visitors at the public migration
// tracker. Shared between the landing page and the sign-in page so both
// carry the same promo without duplicating markup. Fixed height regardless
// of how many servers are active: one server's detail when there's exactly
// one, else a single summary line linking to the index — never stacks
// multiple servers' details, and never renders anything if none are active.
export async function MigrationTrackerBanner() {
  const destinations = getActiveDestinations();
  if (destinations.length === 0) return null;

  const t = await getTranslations("migrationTrackerBanner");

  if (destinations.length > 1) {
    return (
      <Link
        href="/migration-tracker"
        className="group mb-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-400/60 bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-4 shadow-[0_8px_24px_-8px_rgba(124,58,237,0.6)] transition-transform hover:scale-[1.01] dark:border-violet-700"
      >
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-violet-100">
            {t("nowOpen")}
          </p>
          <p className="mt-1 text-lg font-bold text-white sm:text-xl">
            {t("multiTitle", { count: destinations.length })}
          </p>
        </div>
        <span className="shrink-0 rounded-md bg-white px-4 py-2 text-sm font-semibold text-violet-700 group-hover:bg-violet-50">
          {t("cta")}
        </span>
      </Link>
    );
  }

  const destination = destinations[0];
  const status = getWindowStatus(destination);

  let subhead: React.ReactNode;
  if (status === "upcoming") {
    subhead = (
      <>
        {t("subheadOpensOn")} <DateTime iso={destination.opensAt} />
      </>
    );
  } else {
    const summary = getCapacitySummary(destination.id);
    const totalRemaining = summary.reduce((sum, r) => sum + Math.max(r.remaining, 0), 0);
    const totalWaitlisted = summary.reduce((sum, r) => sum + r.waitlisted, 0);
    subhead =
      totalRemaining > 0
        ? t("subheadSlotsOpen", { count: totalRemaining })
        : totalWaitlisted > 0
          ? t("subheadFull")
          : t("subheadDefault");
  }

  return (
    <Link
      href={`/migration-tracker/${destination.serverNumber}`}
      className="group mb-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-400/60 bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-4 shadow-[0_8px_24px_-8px_rgba(124,58,237,0.6)] transition-transform hover:scale-[1.01] dark:border-violet-700"
    >
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-violet-100">
          {t("nowOpen")}
        </p>
        <p className="mt-1 text-lg font-bold text-white sm:text-xl">
          {t("title", { serverNumber: destination.serverNumber })}
        </p>
        <p className="mt-1 text-sm text-violet-100">{subhead}</p>
      </div>
      <span className="shrink-0 rounded-md bg-white px-4 py-2 text-sm font-semibold text-violet-700 group-hover:bg-violet-50">
        {t("cta")}
      </span>
    </Link>
  );
}
