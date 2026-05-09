import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireGuildAdminApi } from "@/lib/rbac";
import { db } from "@/db";
import { guilds } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const guard = requireGuildAdminApi(session, id);
  if (!guard.ok) return guard.response;

  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();
  if ("description" in body) {
    updates.description = body.description ? String(body.description).trim() : null;
  }
  if (typeof body.isPublic === "boolean") updates.isPublic = body.isPublic;
  if ("discordChannelId" in body) {
    const raw = body.discordChannelId;
    if (raw === null || raw === "") {
      updates.discordChannelId = null;
    } else if (typeof raw === "string" && /^\d{17,20}$/.test(raw.trim())) {
      updates.discordChannelId = raw.trim();
    } else {
      return NextResponse.json(
        { error: "Invalid Discord channel ID (expected a 17-20 digit number)" },
        { status: 400 }
      );
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  await db.update(guilds).set(updates).where(eq(guilds.id, id));
  return NextResponse.json({ success: true });
}
