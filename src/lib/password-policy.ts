import bcrypt from "bcryptjs";

// Password handling for the username/password auth flow. Two concerns:
//   - Server-authoritative complexity validation (no trusting the client).
//   - Hash/verify wrappers around bcryptjs so the rest of the codebase
//     doesn't need to know the cost factor or library quirks.
//
// Complexity policy (per design decision): 10+ chars, ≥1 lowercase,
// ≥1 uppercase, ≥1 digit. Symbol not required — too noisy and the marginal
// security gain is small at this length.

export type PasswordValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

const MIN_LENGTH = 10;
const MAX_LENGTH = 200; // bcrypt truncates at 72 bytes; we cap higher and
// hash anyway to avoid leaking the truncation point.

export function validatePasswordComplexity(
  password: unknown
): PasswordValidationResult {
  if (typeof password !== "string") {
    return { ok: false, reason: "Password is required." };
  }
  if (password.length < MIN_LENGTH) {
    return {
      ok: false,
      reason: `Password must be at least ${MIN_LENGTH} characters.`,
    };
  }
  if (password.length > MAX_LENGTH) {
    return {
      ok: false,
      reason: `Password must be at most ${MAX_LENGTH} characters.`,
    };
  }
  if (!/[a-z]/.test(password)) {
    return {
      ok: false,
      reason: "Password must contain at least one lowercase letter.",
    };
  }
  if (!/[A-Z]/.test(password)) {
    return {
      ok: false,
      reason: "Password must contain at least one uppercase letter.",
    };
  }
  if (!/\d/.test(password)) {
    return { ok: false, reason: "Password must contain at least one digit." };
  }
  return { ok: true };
}

// Cost factor 10 ≈ 60ms on a modern CPU. Tuned to make brute-force
// expensive without making the signin path uncomfortably slow.
const BCRYPT_COST = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    // Malformed hash, etc — treat as wrong password (constant-ish time).
    return false;
  }
}
