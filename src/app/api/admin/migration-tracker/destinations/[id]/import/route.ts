import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canReviewMigrationDestination } from "@/lib/rbac";
import { getWindowStatus, submitApplication } from "@/lib/migration-tracker";
import { validateImportRow, type ImportRowInput } from "@/lib/migration-import";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

const MAX_IMPORT_ROWS = 500;

type ImportRowBody = ImportRowInput & { rowNumber: number };

type ImportRowResult =
  | { rowNumber: number; ok: true; status: string; tier: string }
  | { rowNumber: number; ok: false; error: string };

// Bulk-loads applications an admin/officer collected outside the site (a
// spreadsheet, a Discord form export, etc). Each row runs through the exact
// same admission logic as the public form (submitApplication) — tier
// derivation, capacity check, auto-waitlist — so an imported row and a
// self-submitted one are indistinguishable afterward except in the audit
// log. Open officers as well as server admins, matching who can already
// act on this destination's queue.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const guard = await canReviewMigrationDestination(session, id);
  if (!guard.ok) return guard.response;
  const { membership, destination } = guard.value;

  const body = await req.json().catch(() => null);
  const rows = Array.isArray(body?.rows) ? (body.rows as unknown[]) : null;
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: "No rows to import" }, { status: 400 });
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    return NextResponse.json(
      { error: `Cannot import more than ${MAX_IMPORT_ROWS} rows at once` },
      { status: 400 }
    );
  }

  if (getWindowStatus(destination) !== "open") {
    return NextResponse.json(
      { error: "This migration window is not currently open" },
      { status: 409 }
    );
  }

  const parsedRows: ImportRowBody[] = rows.map((r, i) => {
    const row = r as Record<string, unknown>;
    return {
      rowNumber: typeof row.rowNumber === "number" ? row.rowNumber : i + 1,
      playerName: typeof row.playerName === "string" ? row.playerName.trim() : "",
      sourceServer: typeof row.sourceServer === "string" ? row.sourceServer.trim() : "",
      power: typeof row.power === "number" ? row.power : null,
      contact:
        typeof row.contact === "string" && row.contact.trim() !== "" ? row.contact.trim() : null,
    };
  });

  const results: ImportRowResult[] = [];
  const actorDisplay = await resolveActorDisplay(membership.userId);

  for (const row of parsedRows) {
    const validation = validateImportRow(row);
    if (!validation.ok) {
      results.push({ rowNumber: row.rowNumber, ok: false, error: validation.error });
      continue;
    }

    const result = submitApplication({
      destinationId: id,
      playerName: row.playerName,
      sourceServer: row.sourceServer,
      power: row.power as number,
      contact: row.contact,
    });

    if (!result.ok) {
      results.push({ rowNumber: row.rowNumber, ok: false, error: result.reason });
      continue;
    }

    results.push({
      rowNumber: row.rowNumber,
      ok: true,
      status: result.application.status,
      tier: result.application.tier,
    });

    void logAudit({
      guildId: null,
      actorUserId: membership.userId,
      actorDisplay,
      action: "migration.import",
      entityType: "migration_application",
      entityId: result.application.id,
      entityLabel: result.application.playerName,
      changes: {
        after: {
          sourceServer: result.application.sourceServer,
          power: result.application.power,
          tier: result.application.tier,
          status: result.application.status,
        },
      },
    });
  }

  const imported = results.filter((r) => r.ok).length;
  return NextResponse.json({ imported, failed: results.length - imported, results });
}
