import { db } from "@/db";
import { auditLog, guilds, users } from "@/db/schema";
import { and, count, desc, eq, isNotNull, like, or } from "drizzle-orm";
import { auth } from "@/auth";
import { requireGuildAdminPage, resolveAdminGuildId } from "@/lib/rbac";
import { DateTime } from "@/components/date-time";
import { AuditRow } from "@/components/audit-row";
import Link from "next/link";

export const metadata = {
  title: "Audit Log — Foundation Event Organizer",
};

const PAGE_SIZE = 50;

// Per-guild audit viewer. Phase 1 of the "per-guild changelog" feature —
// read-only listing with a flag-for-review toggle. Revert is deferred.
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    guildId?: string;
    page?: string;
    action?: string;
    q?: string;
    flagged?: string;
  }>;
}) {
  const session = await auth();
  const membership = requireGuildAdminPage(session);
  const params = await searchParams;
  const resolved = await resolveAdminGuildId(membership, params.guildId);
  if (!resolved) {
    return <p className="text-red-600 dark:text-red-300">Guild not found.</p>;
  }
  const targetGuildId: string = resolved;

  const page = Math.max(1, Number(params.page) || 1);
  const action = (params.action ?? "").trim();
  const q = (params.q ?? "").trim();
  const flaggedOnly = params.flagged === "1";

  const actingGuild = await db.query.guilds.findFirst({
    where: eq(guilds.id, targetGuildId),
  });
  const isImpersonating =
    membership.isSuperAdmin && targetGuildId !== membership.guildId;

  const conditions = [eq(auditLog.guildId, targetGuildId)];
  if (action) conditions.push(eq(auditLog.action, action));
  if (flaggedOnly) conditions.push(isNotNull(auditLog.flaggedAt));
  if (q) {
    const pattern = `%${q}%`;
    conditions.push(
      or(
        like(auditLog.actorDisplay, pattern),
        like(auditLog.entityLabel, pattern)
      )!
    );
  }
  const whereClause = and(...conditions);

  // Total for pagination. Counting on the same filter is cheap relative to
  // the page-fetch — both hit the same index on guildId.
  const totalRow = await db
    .select({ n: count() })
    .from(auditLog)
    .where(whereClause)
    .get();
  const total = Number(totalRow?.n ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const rows = await db
    .select()
    .from(auditLog)
    .where(whereClause)
    .orderBy(desc(auditLog.createdAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  // Build flagger display names in one round-trip — most pages will have a
  // handful of distinct flaggers.
  const flaggerIds = [
    ...new Set(rows.map((r) => r.flaggedByUserId).filter(Boolean) as string[]),
  ];
  const flaggers = flaggerIds.length
    ? await db
        .select({
          id: users.id,
          inGameName: users.inGameName,
          name: users.name,
          email: users.email,
        })
        .from(users)
        .where(or(...flaggerIds.map((id) => eq(users.id, id)))!)
    : [];
  const flaggerDisplay = new Map(
    flaggers.map((u) => [u.id, u.inGameName ?? u.name ?? u.email ?? u.id])
  );

  // Distinct action keys actually present in this guild's log — drives the
  // filter dropdown. Avoids showing every possible AuditAction even ones
  // the guild has never produced.
  const distinctActionsRaw = await db
    .selectDistinct({ action: auditLog.action })
    .from(auditLog)
    .where(eq(auditLog.guildId, targetGuildId))
    .orderBy(auditLog.action);
  const distinctActions = distinctActionsRaw.map((r) => r.action);

  function buildHref(overrides: Partial<{
    page: number;
    action: string;
    q: string;
    flagged: boolean;
  }>): string {
    const sp = new URLSearchParams();
    if (isImpersonating) sp.set("guildId", targetGuildId);
    const nextPage = overrides.page ?? page;
    if (nextPage > 1) sp.set("page", String(nextPage));
    const nextAction = overrides.action ?? action;
    if (nextAction) sp.set("action", nextAction);
    const nextQ = overrides.q ?? q;
    if (nextQ) sp.set("q", nextQ);
    const nextFlagged = overrides.flagged ?? flaggedOnly;
    if (nextFlagged) sp.set("flagged", "1");
    const qs = sp.toString();
    return qs ? `/admin/audit?${qs}` : "/admin/audit";
  }

  return (
    <div className="mx-auto max-w-5xl">
      {isImpersonating && actingGuild && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          Acting as admin of <strong>{actingGuild.name}</strong> (super-admin override).
        </div>
      )}
      <header className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          {actingGuild ? `${actingGuild.name} — Audit Log` : "Audit Log"}
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Every state-changing action in this guild, newest first. Flag rows
          you want to revisit — flagged rows are visible to all guild admins.
        </p>
      </header>

      <form
        method="get"
        className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
      >
        {isImpersonating && (
          <input type="hidden" name="guildId" value={targetGuildId} />
        )}
        <div className="flex-1 min-w-48">
          <label className="block text-xs font-medium text-gray-600 mb-1 dark:text-gray-400">
            Search actor or target
          </label>
          <input
            name="q"
            defaultValue={q}
            placeholder="e.g. curisu, Shadowfront May 16"
            className="w-full border rounded px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1 dark:text-gray-400">
            Action
          </label>
          <select
            name="action"
            defaultValue={action}
            className="border rounded px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            <option value="">All</option>
            {distinctActions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            name="flagged"
            value="1"
            defaultChecked={flaggedOnly}
          />
          Flagged only
        </label>
        <button
          type="submit"
          className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-700"
        >
          Filter
        </button>
        {(action || q || flaggedOnly) && (
          <Link
            href={buildHref({
              page: 1,
              action: "",
              q: "",
              flagged: false,
            })}
            className="text-sm text-gray-500 hover:underline dark:text-gray-400"
          >
            Clear
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
          No audit entries match.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500 dark:bg-gray-900 dark:text-gray-400">
              <tr>
                <th className="px-3 py-2 font-semibold">When</th>
                <th className="px-3 py-2 font-semibold">Actor</th>
                <th className="px-3 py-2 font-semibold">Action</th>
                <th className="px-3 py-2 font-semibold">Target</th>
                <th className="px-3 py-2 font-semibold text-right">Flag</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <AuditRow
                  key={r.id}
                  row={{
                    id: r.id,
                    createdAt: r.createdAt,
                    actorDisplay: r.actorDisplay,
                    action: r.action,
                    entityType: r.entityType,
                    entityLabel: r.entityLabel,
                    changes: r.changes,
                    flaggedAt: r.flaggedAt,
                    flaggedByUserId: r.flaggedByUserId,
                    flagNote: r.flagNote,
                    flaggerDisplay: r.flaggedByUserId
                      ? flaggerDisplay.get(r.flaggedByUserId) ?? null
                      : null,
                  }}
                  DateTime={DateTime}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-gray-500 dark:text-gray-400">
            Page {page} of {totalPages} · {total} entries
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={buildHref({ page: page - 1 })}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                ← Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={buildHref({ page: page + 1 })}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
