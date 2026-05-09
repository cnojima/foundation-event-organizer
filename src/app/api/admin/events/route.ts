import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/admin";
import { db } from "@/db";
import { events } from "@/db/schema";
import { generateId } from "@/lib/ids";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !(await isAdmin(session.user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const kind: "match" | "simple" = body.kind === "simple" ? "simple" : "match";

  const event = {
    id: generateId(),
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
