import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canManageMigrationDestination } from "@/lib/rbac";
import { db } from "@/db";
import { users } from "@/db/schema";
import { like, or } from "drizzle-orm";

// Candidate picker for officer assignment — matches name/username/Discord ID
// by substring. SQLite's LIKE is case-insensitive for ASCII by default.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const guard = await canManageMigrationDestination(session, id);
  if (!guard.ok) return guard.response;

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ users: [] });
  }
  const pattern = `%${q}%`;

  const results = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      discordUserId: users.discordUserId,
      inGameName: users.inGameName,
    })
    .from(users)
    .where(or(like(users.name, pattern), like(users.username, pattern), like(users.discordUserId, pattern)))
    .limit(10);

  return NextResponse.json({ users: results });
}
