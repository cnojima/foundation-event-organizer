import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { getDefaultDestination, getCapacitySummary } from "@/lib/migration-tracker";

export const metadata = { title: "Migration Tracker" };

const CLASSIFICATION_LABEL: Record<string, string> = {
  high: "High-power server",
  mid: "Mid-power server",
  low: "Low-power server",
};

export default async function MigrationTrackerPage() {
  const destination = getDefaultDestination();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        kicker="Migration Tracker"
        title={destination ? `Server #${destination.serverNumber}` : "Migration Tracker"}
        subtitle={
          destination
            ? `${CLASSIFICATION_LABEL[destination.classification]} — see how much room is left in each power tier before you apply.`
            : "This server's migration tracker hasn't been configured yet."
        }
        rightSlot={
          destination ? (
            <Link
              href="/migration-tracker/submit"
              className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
            >
              Apply to migrate
            </Link>
          ) : null
        }
      />

      {!destination ? (
        <p className="text-gray-500 dark:text-gray-400">Check back soon.</p>
      ) : (
        <MigrationCapacityTable destinationId={destination.id} />
      )}
    </div>
  );
}

function MigrationCapacityTable({ destinationId }: { destinationId: string }) {
  const summary = getCapacitySummary(destinationId);

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500 dark:bg-gray-900 dark:text-gray-400">
          <tr>
            <th className="px-3 py-2 font-semibold">Power tier</th>
            <th className="px-3 py-2 text-right font-semibold">Cap</th>
            <th className="px-3 py-2 text-right font-semibold">Reserved</th>
            <th className="px-3 py-2 text-right font-semibold">Remaining</th>
            <th className="px-3 py-2 text-right font-semibold">Waitlisted</th>
          </tr>
        </thead>
        <tbody>
          {summary.map((row) => (
            <tr key={row.tier} className="border-t border-gray-100 dark:border-gray-800">
              <td className="px-3 py-3 font-medium text-gray-900 dark:text-gray-100">
                {row.flavorName}
              </td>
              <td className="px-3 py-3 text-right text-gray-600 dark:text-gray-400">{row.cap}</td>
              <td className="px-3 py-3 text-right text-gray-600 dark:text-gray-400">
                {row.reserved}
              </td>
              <td className="px-3 py-3 text-right">
                <span
                  className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    row.remaining > 0
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
                  }`}
                >
                  {row.remaining}
                </span>
              </td>
              <td className="px-3 py-3 text-right text-gray-600 dark:text-gray-400">
                {row.waitlisted}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
