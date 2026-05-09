import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

const MAX_NAME_LENGTH = 32;

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
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

  await db
    .update(users)
    .set({ inGameName })
    .where(eq(users.id, session.user.id));

  return NextResponse.json({ success: true, inGameName });
}
