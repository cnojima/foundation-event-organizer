import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireGuildAdminApi, resolveAdminGuildId } from "@/lib/rbac";
import { db } from "@/db";
import { events } from "@/db/schema";
import { generateId } from "@/lib/ids";

export async function POST(req: Request) {
  const session = await auth();
  const guard = requireGuildAdminApi(session);
  if (!guard.ok) return guard.response;
  const membership = guard.value;

  const body = await req.json();

  // Super-admins may target a different guild via body.guildId; regular guild
  // admins are pinned to their own guild.
  const targetGuildId = await resolveAdminGuildId(membership, body.guildId);
  if (!targetGuildId) {
    return NextResponse.json({ error: "Guild not found" }, { status: 404 });
  }

  const kind: "match" | "simple" = body.kind === "simple" ? "simple" : "match";

  const event = {
    id: generateId(),
    guildId: targetGuildId,
    name: body.name,
    description: body.description || null,
    gameTime: body.gameTime ? new Date(body.gameTime).toISOString() : null,
    signupOpens: body.signupOpens ? new Date(body.signupOpens).toISOString() : null,
    signupCloses: body.signupCloses ? new Date(body.signupCloses).toISOString() : null,
    kind,
    squad1Name: body.squad1Name || "Squad 1",
    squad2Name: body.squad2Name || "Squad 2",
    maxPlayers: body.maxPlayers || 20,
    maxBackups: body.maxBackups || 10,
    leadershipSlots: body.leadershipSlots || 3,
    metadata: body.metadata ? JSON.stringify(body.metadata) : null,
    createdAt: new Date().toISOString(),
  };

  await db.insert(events).values(event);

  return NextResponse.json(event, { status: 201 });
}
