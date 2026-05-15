import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireGuildAdminApi, resolveAdminGuildId } from "@/lib/rbac";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

// Admin pre-creates a "stub" member: a users row with no OAuth account
// attached yet. The stub functions as a full guild member (rosterable,
// DM-targetable if discordUserId is set) and is auto-claimed on first
// sign-in by the matching Discord ID or email — see auth.ts.
export async function POST(req: Request) {
  const session = await auth();
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const requestedGuildId = typeof body.guildId === "string" ? body.guildId : undefined;
  const guard = requireGuildAdminApi(session, requestedGuildId);
  if (!guard.ok) return guard.response;
  const targetGuildId = await resolveAdminGuildId(guard.value, requestedGuildId);
  if (!targetGuildId) {
    return NextResponse.json({ error: "Guild not found" }, { status: 404 });
  }

  const inGameName =
    typeof body.inGameName === "string" ? body.inGameName.trim() : "";
  if (inGameName.length < 1 || inGameName.length > 40) {
    return NextResponse.json(
      { error: "In-game name must be 1–40 characters." },
      { status: 400 }
    );
  }

  const name =
    typeof body.name === "string" && body.name.trim() !== ""
      ? body.name.trim()
      : null;

  let email: string | null = null;
  if (typeof body.email === "string" && body.email.trim() !== "") {
    const candidate = body.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) {
      return NextResponse.json(
        { error: "Email is not a valid address." },
        { status: 400 }
      );
    }
    const collision = await db.query.users.findFirst({
      where: eq(users.email, candidate),
      columns: { id: true },
    });
    if (collision) {
      return NextResponse.json(
        {
          error:
            "A user with that email already exists. Leave email blank or use a different one.",
        },
        { status: 409 }
      );
    }
    email = candidate;
  }

  let discordUserId: string | null = null;
  if (
    typeof body.discordUserId === "string" &&
    body.discordUserId.trim() !== ""
  ) {
    const candidate = body.discordUserId.trim();
    if (!/^\d{17,20}$/.test(candidate)) {
      return NextResponse.json(
        {
          error:
            "Discord User ID must be a 17–20 digit number (the snowflake).",
        },
        { status: 400 }
      );
    }
    const collision = await db.query.users.findFirst({
      where: eq(users.discordUserId, candidate),
      columns: { id: true },
    });
    if (collision) {
      return NextResponse.json(
        {
          error:
            "A user with that Discord ID already exists. Leave it blank or use a different one.",
        },
        { status: 409 }
      );
    }
    discordUserId = candidate;
  }

  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  await db.insert(users).values({
    id,
    name,
    email,
    inGameName,
    discordUserId,
    guildId: targetGuildId,
    guildRole: "member",
    stubCreatedByUserId: guard.value.userId,
    stubCreatedAt: nowIso,
  });

  void logAudit({
    guildId: targetGuildId,
    actorUserId: guard.value.userId,
    actorDisplay: await resolveActorDisplay(guard.value.userId),
    action: "member.stub_create",
    entityType: "member",
    entityId: id,
    entityLabel: inGameName,
    changes: {
      after: {
        inGameName,
        name,
        email,
        discordUserId,
      },
    },
  });

  return NextResponse.json({ success: true, userId: id }, { status: 201 });
}
