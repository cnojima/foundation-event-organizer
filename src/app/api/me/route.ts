import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import {
  countGuildAdmins,
  countGuildMembers,
  softDeleteGuildAndEvents,
} from "@/lib/rbac";
import { isSupportedLocale, LOCALE_COOKIE } from "@/i18n/config";

const MAX_NAME_LENGTH = 32;

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

function isPowerTier(v: unknown): v is PowerTier {
  return typeof v === "string" && (POWER_TIERS as readonly string[]).includes(v);
}

// PATCH /api/me — partial update of the current user's profile fields.
// Supports `inGameName`, `locale`, `powerTier` (I–XIII or null), and
// `discoverableForDuels` (boolean). Any field can be updated independently.
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};
  let cookieToSet: string | null = null;

  if ("inGameName" in body) {
    const raw = body.inGameName;
    if (typeof raw !== "string") {
      return NextResponse.json(
        { error: "inGameName must be a string" },
        { status: 400 }
      );
    }
    const inGameName = raw.trim();
    if (inGameName.length === 0) {
      return NextResponse.json(
        { error: "Name cannot be empty" },
        { status: 400 }
      );
    }
    if (inGameName.length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        { error: `Name must be ${MAX_NAME_LENGTH} characters or fewer` },
        { status: 400 }
      );
    }
    updates.inGameName = inGameName;
  }

  if ("locale" in body) {
    if (!isSupportedLocale(body.locale)) {
      return NextResponse.json(
        { error: "Unsupported locale" },
        { status: 400 }
      );
    }
    updates.locale = body.locale;
    cookieToSet = body.locale;
  }

  if ("powerTier" in body) {
    const raw = body.powerTier;
    if (raw === null || raw === "") {
      updates.powerTier = null;
    } else if (isPowerTier(raw)) {
      updates.powerTier = raw;
    } else {
      return NextResponse.json(
        { error: "Power tier must be one of I–XIII or null." },
        { status: 400 }
      );
    }
  }

  if ("discoverableForDuels" in body) {
    if (typeof body.discoverableForDuels !== "boolean") {
      return NextResponse.json(
        { error: "discoverableForDuels must be a boolean" },
        { status: 400 }
      );
    }
    updates.discoverableForDuels = body.discoverableForDuels;
  }

  if ("duelDmEnabled" in body) {
    if (typeof body.duelDmEnabled !== "boolean") {
      return NextResponse.json(
        { error: "duelDmEnabled must be a boolean" },
        { status: 400 }
      );
    }
    updates.duelDmEnabled = body.duelDmEnabled;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  await db.update(users).set(updates).where(eq(users.id, session.user.id));

  const res = NextResponse.json({ success: true, ...updates });
  if (cookieToSet) {
    res.cookies.set({
      name: LOCALE_COOKIE,
      value: cookieToSet,
      // 1 year — locale preference shouldn't expire mid-session.
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      sameSite: "lax",
    });
  }
  return res;
}

// Hard-deletes the current user's account. FK cascades remove their signups,
// accounts (OAuth links), and sessions. Same last-admin guard as guild leave —
// you can't orphan a guild by deleting yourself if you're the only admin.
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const me = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!me) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  // If user is in a guild, check leave-blocking rules. Special case: if
  // they're the LAST member of the guild, we let them go and soft-delete
  // the guild instead of requiring a non-existent successor admin.
  let lastMemberGuildId: string | null = null;
  if (me.guildId) {
    const totalMembers = await countGuildMembers(me.guildId);
    if (totalMembers <= 1) {
      lastMemberGuildId = me.guildId;
    } else if (me.guildRole === "admin") {
      const admins = await countGuildAdmins(me.guildId);
      if (admins <= 1) {
        return NextResponse.json(
          {
            error:
              "You're the only admin of your guild. Promote someone else first, or have a super-admin take over.",
          },
          { status: 409 }
        );
      }
    }
  }

  // The last super-admin can't delete themselves either — keeps the platform
  // operable. Mirrors the rule in PATCH /api/super-admin/users/[id].
  if (me.isSuperAdmin === true) {
    const remaining = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(and(eq(users.isSuperAdmin, true)))
      .get();
    if (Number(remaining?.count ?? 0) <= 1) {
      return NextResponse.json(
        {
          error:
            "You're the last super-admin. Promote someone else to super-admin before deleting your account.",
        },
        { status: 409 }
      );
    }
  }

  db.transaction((tx) => {
    if (lastMemberGuildId) {
      softDeleteGuildAndEvents(tx, lastMemberGuildId);
    }
    tx.delete(users).where(eq(users.id, userId)).run();
  });
  return NextResponse.json({ success: true });
}
