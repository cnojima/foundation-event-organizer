import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireSignedInApi, isValidSlug, isSlugTaken } from "@/lib/rbac";
import { db } from "@/db";
import { guilds, users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  const session = await auth();
  const guard = requireSignedInApi(session);
  if (!guard.ok) return guard.response;
  const membership = guard.value;

  if (membership.guildId) {
    return NextResponse.json(
      { error: "You're already in a guild. Leave it first." },
      { status: 409 }
    );
  }

  const body = await req.json();
  const name = String(body.name ?? "").trim();
  const slug = String(body.slug ?? "").trim().toLowerCase();
  const description = body.description ? String(body.description).trim() : null;
  const isPublic = body.isPublic !== false;
  const tag =
    typeof body.tag === "string" ? body.tag.trim() : "";
  const serverNumberRaw =
    body.serverNumber == null || body.serverNumber === "" ? null : Number(body.serverNumber);

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!isValidSlug(slug)) {
    return NextResponse.json(
      { error: "Slug must be 3-40 lowercase chars (a-z, 0-9, -) and not reserved" },
      { status: 400 }
    );
  }
  if (await isSlugTaken(slug)) {
    return NextResponse.json({ error: "Slug already taken" }, { status: 409 });
  }
  if (!tag || !/^.{2,4}$/u.test(tag)) {
    return NextResponse.json(
      { error: "Guild Tag is required (2-4 characters)." },
      { status: 400 }
    );
  }
  if (
    serverNumberRaw === null ||
    !Number.isInteger(serverNumberRaw) ||
    serverNumberRaw < 1001 ||
    serverNumberRaw > 9999
  ) {
    return NextResponse.json(
      { error: "Server # is required and must be an integer between 1001 and 9999." },
      { status: 400 }
    );
  }

  const guildId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  db.transaction((tx) => {
    tx.insert(guilds)
      .values({
        id: guildId,
        name,
        slug,
        description,
        isPublic,
        tag,
        serverNumber: serverNumberRaw,
        createdByUserId: membership.userId,
        createdAt,
      })
      .run();
    tx.update(users)
      .set({ guildId, guildRole: "admin" })
      .where(eq(users.id, membership.userId))
      .run();
  });

  return NextResponse.json({ id: guildId, slug }, { status: 201 });
}
