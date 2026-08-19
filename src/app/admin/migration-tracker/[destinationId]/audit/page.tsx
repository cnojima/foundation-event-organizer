import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { requireMigrationDestinationReviewPage } from "@/lib/rbac";
import { db } from "@/db";
import { auditLog, migrationApplications } from "@/db/schema";
import { and, count, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { DateTime } from "@/components/date-time";

export const metadata = { title: "Migration Tracker — Audit Log" };

const PAGE_SIZE = 50;

// Read-only audit trail for one destination window — visible to server
// admins and assigned officers alike (requireMigrationDestinationReviewPage
// gates both). Unlike /admin/audit, there's no flag control here: flagging
// a guildId-null entry is super-admin-only (see /api/admin/audit/[id]/flag),
// and officers reviewing this page usually aren't super-admins.
//
// A destination row has no direct FK from audit_log, so scoping is
// entityType-specific: migration_destination rows key off entityId =
// destinationId directly; migration_application rows key off entityId
// being one of this destination's application ids; migration_officer rows
// (entityId is the target userId, which says nothing about which
// destination) key off a destinationId stamped into `changes` by the
// assign/revoke routes.
export default async function MigrationDestinationAuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ destinationId: string }>;
  searchParams: Promise<{ page?: string; action?: string; q?: string }>;
}) {
  const { destinationId } = await params;
  const session = await auth();
  const { destination } = await requireMigrationDestinationReviewPage(session, destinationId);

  const t = await getTranslations("migrationTrackerAudit");
  const tShared = await getTranslations("migrationTracker");

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const action = (sp.action ?? "").trim();
  const q = (sp.q ?? "").trim();

  const applicationIdRows = await db
    .select({ id: migrationApplications.id })
    .from(migrationApplications)
    .where(eq(migrationApplications.destinationId, destination.id));
  const applicationIds = applicationIdRows.map((r) => r.id);

  const scopeConditions = [
    and(eq(auditLog.entityType, "migration_destination"), eq(auditLog.entityId, destination.id))!,
    and(
      eq(auditLog.entityType, "migration_officer"),
      sql`json_extract(${auditLog.changes}, '$.destinationId') = ${destination.id}`
    )!,
  ];
  if (applicationIds.length > 0) {
    scopeConditions.push(
      and(eq(auditLog.entityType, "migration_application"), inArray(auditLog.entityId, applicationIds))!
    );
  }
  const scopeClause = or(...scopeConditions)!;

  const conditions = [scopeClause];
  if (action) conditions.push(eq(auditLog.action, action));
  if (q) {
    const pattern = `%${q}%`;
    conditions.push(or(like(auditLog.actorDisplay, pattern), like(auditLog.entityLabel, pattern))!);
  }
  const whereClause = and(...conditions);

  const totalRow = await db.select({ n: count() }).from(auditLog).where(whereClause).get();
  const total = Number(totalRow?.n ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const rows = await db
    .select()
    .from(auditLog)
    .where(whereClause)
    .orderBy(desc(auditLog.createdAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  // Action options are drawn from the destination's full scope, independent
  // of the current action/search filter — same convention as /admin/audit.
  const distinctActionsRaw = await db
    .selectDistinct({ action: auditLog.action })
    .from(auditLog)
    .where(scopeClause)
    .orderBy(auditLog.action);
  const distinctActions = distinctActionsRaw.map((r) => r.action);

  function buildHref(overrides: Partial<{ page: number; action: string; q: string }>): string {
    const search = new URLSearchParams();
    const nextPage = overrides.page ?? page;
    if (nextPage > 1) search.set("page", String(nextPage));
    const nextAction = overrides.action ?? action;
    if (nextAction) search.set("action", nextAction);
    const nextQ = overrides.q ?? q;
    if (nextQ) search.set("q", nextQ);
    const qs = search.toString();
    return qs
      ? `/admin/migration-tracker/${destination.id}/audit?${qs}`
      : `/admin/migration-tracker/${destination.id}/audit`;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        kicker={tShared("kicker")}
        title={t("title", { serverNumber: destination.serverNumber })}
        subtitle={t("desc")}
      />

      <form
        method="get"
        className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
      >
        <div className="flex-1 min-w-48">
          <label className="block text-xs font-medium text-gray-600 mb-1 dark:text-gray-400">
            {t("searchLabel")}
          </label>
          <input
            name="q"
            defaultValue={q}
            className="w-full border rounded px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1 dark:text-gray-400">
            {t("actionLabel")}
          </label>
          <select
            name="action"
            defaultValue={action}
            className="border rounded px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            <option value="">{t("allActions")}</option>
            {distinctActions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-700"
        >
          {t("filter")}
        </button>
        {(action || q) && (
          <Link
            href={buildHref({ page: 1, action: "", q: "" })}
            className="text-sm text-gray-500 hover:underline dark:text-gray-400"
          >
            {t("clear")}
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
          {t("noEntries")}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500 dark:bg-gray-900 dark:text-gray-400">
              <tr>
                <th className="px-3 py-2 font-semibold">{t("colWhen")}</th>
                <th className="px-3 py-2 font-semibold">{t("colActor")}</th>
                <th className="px-3 py-2 font-semibold">{t("colAction")}</th>
                <th className="px-3 py-2 font-semibold">{t("colTarget")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-gray-100 align-top dark:border-gray-800">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                    <DateTime iso={r.createdAt} />
                  </td>
                  <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-200">
                    {r.actorDisplay}
                  </td>
                  <td className="px-3 py-2">
                    <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                      {r.action}
                    </code>
                  </td>
                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                    <div className="flex items-center gap-2">
                      <span className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
                        {r.entityType}
                      </span>
                      <span className="truncate">{r.entityLabel ?? "—"}</span>
                    </div>
                    {r.changes && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-violet-600 hover:underline dark:text-violet-300">
                          {t("diff")}
                        </summary>
                        <pre className="mt-1 max-h-64 overflow-auto rounded border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300">
                          {formatChanges(r.changes)}
                        </pre>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-gray-500 dark:text-gray-400">
            {t("pagination", { page, totalPages, total })}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={buildHref({ page: page - 1 })}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                {t("previous")}
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={buildHref({ page: page + 1 })}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                {t("next")}
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatChanges(raw: string | null): string {
  if (!raw) return "";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
