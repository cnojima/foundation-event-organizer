import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getDefaultDestination, getCapacitySummary } from "@/lib/migration-tracker";

// Big CTA banner pointing signed-out visitors at the public migration
// tracker. Shared between the landing page and the sign-in page so both
// carry the same promo without duplicating markup. Renders nothing if no
// destination has been configured yet (keeps this safe to drop in anywhere).
export async function MigrationTrackerBanner() {
  const destination = getDefaultDestination();
  if (!destination) return null;

  const t = await getTranslations("migrationTrackerBanner");

  const summary = getCapacitySummary(destination.id);
  const totalRemaining = summary.reduce((sum, r) => sum + Math.max(r.remaining, 0), 0);
  const totalWaitlisted = summary.reduce((sum, r) => sum + r.waitlisted, 0);

  const subhead =
    totalRemaining > 0
      ? t("subheadSlotsOpen", { count: totalRemaining })
      : totalWaitlisted > 0
        ? t("subheadFull")
        : t("subheadDefault");

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
