import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireSuperAdminApi } from "@/lib/rbac";
import { createDestination } from "@/lib/migration-tracker";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

const VALID_CLASSIFICATIONS = ["high", "mid", "low"] as const;

// Opens a new migration window. Super-admin only. Blocked if the target
// server already has an open-or-upcoming window (see createDestination).
export async function POST(req: Request) {
  const session = await auth();
  const guard = requireSuperAdminApi(session);
  if (!guard.ok) return guard.response;
  const membership = guard.value;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const serverNumber = Number(body.serverNumber);
  if (!Number.isInteger(serverNumber) || serverNumber < 1001 || serverNumber > 9999) {
    return NextResponse.json({ error: "Server number must be between 1001 and 9999" }, { status: 400 });
  }
  if (
    typeof body.classification !== "string" ||
    !VALID_CLASSIFICATIONS.includes(body.classification as (typeof VALID_CLASSIFICATIONS)[number])
  ) {
    return NextResponse.json({ error: "classification must be high, mid, or low" }, { status: 400 });
  }
  const opensAt = typeof body.opensAt === "string" ? body.opensAt : "";
  const closesAt = typeof body.closesAt === "string" ? body.closesAt : "";
  if (!opensAt || Number.isNaN(new Date(opensAt).getTime())) {
    return NextResponse.json({ error: "opensAt is required" }, { status: 400 });
  }
  if (!closesAt || Number.isNaN(new Date(closesAt).getTime())) {
    return NextResponse.json({ error: "closesAt is required" }, { status: 400 });
  }

  const result = createDestination({
    serverNumber,
    classification: body.classification as (typeof VALID_CLASSIFICATIONS)[number],
    opensAt,
    closesAt,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status });
  }

  void logAudit({
    guildId: null,
    actorUserId: membership.userId,
    actorDisplay: await resolveActorDisplay(membership.userId),
    action: "migration.destination.create",
    entityType: "migration_destination",
    entityId: result.destination.id,
    entityLabel: `Server #${result.destination.serverNumber}`,
    changes: {
      after: {
        classification: result.destination.classification,
        opensAt: result.destination.opensAt,
        closesAt: result.destination.closesAt,
      },
    },
  });

  return NextResponse.json({ destination: result.destination }, { status: 201 });
}
