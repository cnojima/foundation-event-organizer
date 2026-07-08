import Link from "next/link";
import { auth } from "@/auth";
import { requireSuperAdminPage } from "@/lib/rbac";
import { db } from "@/db";
import { damageSessions, damageReadings } from "@/db/schema";
import { desc, sql } from "drizzle-orm";
import { DateTime } from "@/components/date-time";
import { DeleteSessionButton } from "@/components/damage-calculator/delete-session-button";

export default async function DamageCalculatorPage() {
  const session = await auth();
  requireSuperAdminPage(session);

  const rows = await db
    .select({
      id: damageSessions.id,
      label: damageSessions.label,
      eventName: damageSessions.eventName,
      totalTimeSeconds: damageSessions.totalTimeSeconds,
      createdAt: damageSessions.createdAt,
      fleetCount: sql<number>`(select count(distinct ${damageReadings.fleetId}) from ${damageReadings} where ${damageReadings.sessionId} = ${damageSessions.id})`,
      readingCount: sql<number>`(select count(*) from ${damageReadings} where ${damageReadings.sessionId} = ${damageSessions.id})`,
    })
    .from(damageSessions)
    .orderBy(desc(damageSessions.createdAt));

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Damage Calculator
        </h1>
        <Link
          href="/damage-calculator/new"
          className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-700"
        >
          + New session
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
          No sessions yet. Upload a screenshot folder to get started.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900"
            >
              <Link href={`/damage-calculator/${r.id}`} className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900 dark:text-gray-100">{r.label}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{r.eventName}</span>
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {r.fleetCount} fleet{r.fleetCount === 1 ? "" : "s"} · {r.readingCount} reading
                  {r.readingCount === 1 ? "" : "s"} · Created <DateTime iso={r.createdAt} mode="date" />
                  {!r.totalTimeSeconds && (
                    <span className="ml-1 font-medium text-amber-600 dark:text-amber-400">
                      · Total time not set
                    </span>
                  )}
                </p>
              </Link>
              <DeleteSessionButton sessionId={r.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
