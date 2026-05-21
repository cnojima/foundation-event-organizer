import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateUsername } from "@/lib/username";
import {
  hashPassword,
  validatePasswordComplexity,
} from "@/lib/password-policy";
import {
  encryptEmail,
  hashEmail,
  isEmailCryptoConfigured,
} from "@/lib/email-crypto";

// Username + password signup. Distinct from Auth.js's Credentials sign-in
// (which only authenticates already-created users) — this endpoint creates
// the new `users` row. After a successful signup, the client is expected
// to POST to /api/auth/callback/credentials to actually sign in.
//
// Coexists with OAuth: a signup here just inserts a row with a
// passwordHash. Later, the same user can link Google or Discord by going
// through OAuth — Auth.js's adapter will see the existing row (matched
// by email hash, if email was provided) and link to it.

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Username validation.
  const usernameResult = validateUsername(body.username);
  if (!usernameResult.ok) {
    return NextResponse.json({ error: usernameResult.reason }, { status: 400 });
  }
  const username = usernameResult.normalized;

  // Password complexity.
  const passwordResult = validatePasswordComplexity(body.password);
  if (!passwordResult.ok) {
    return NextResponse.json({ error: passwordResult.reason }, { status: 400 });
  }
  const password = body.password as string;

  // Optional email. If provided, it goes through the same hash + encrypt
  // pipeline OAuth-created rows use.
  let emailPlaintext: string | null = null;
  let emailHashValue: string | null = null;
  let emailEncryptedValue: string | null = null;
  if (typeof body.email === "string" && body.email.trim() !== "") {
    const candidate = body.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) {
      return NextResponse.json(
        { error: "Email is not a valid address." },
        { status: 400 }
      );
    }
    emailPlaintext = candidate;
    if (isEmailCryptoConfigured()) {
      emailHashValue = hashEmail(candidate);
      emailEncryptedValue = encryptEmail(candidate);
    }
  }

  // Uniqueness checks. Username is the canonical sign-in key; emails are
  // unique via the hash column when crypto is configured.
  const usernameClash = await db.query.users.findFirst({
    where: eq(users.username, username),
    columns: { id: true },
  });
  if (usernameClash) {
    return NextResponse.json(
      { error: "That username is taken. Pick another." },
      { status: 409 }
    );
  }

  if (emailHashValue) {
    const emailClash = await db.query.users.findFirst({
      where: eq(users.emailHash, emailHashValue),
      columns: { id: true },
    });
    if (emailClash) {
      // Don't reveal whether the email was used by an existing account —
      // it's a privacy leak ("alice@example.com is registered here"). The
      // generic message covers it.
      return NextResponse.json(
        {
          error:
            "Couldn't create the account. Try a different email, or sign in if you already have one.",
        },
        { status: 409 }
      );
    }
  }

  // Hash the password and insert.
  const passwordHash = await hashPassword(password);

  const userId = crypto.randomUUID();
  await db.insert(users).values({
    id: userId,
    username,
    passwordHash,
    email: emailPlaintext,
    emailHash: emailHashValue,
    emailEncrypted: emailEncryptedValue,
  });

  return NextResponse.json({ success: true, userId }, { status: 201 });
}
