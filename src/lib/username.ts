// Username format validation for the username/password auth flow. Distinct
// from `inGameName` (which is the player's display name in the game, can be
// any unicode) — usernames are the canonical sign-in identifier and need
// stricter rules so they're URL-safe and unambiguous.
//
// Rules:
//   - 3–30 characters
//   - Lowercase letters, digits, underscore, hyphen
//   - Cannot start or end with hyphen/underscore
//   - Cannot be a reserved word (auth/admin route names + generic UX-conflict
//     terms — keeps the namespace clean for future "/u/<username>" URLs)

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/;

const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "api",
  "auth",
  "bot",
  "claude",
  "discord",
  "help",
  "join",
  "login",
  "logout",
  "me",
  "members",
  "moderator",
  "new",
  "rallyup",
  "root",
  "settings",
  "signin",
  "signup",
  "staff",
  "super-admin",
  "superadmin",
  "support",
  "system",
  "user",
  "users",
  "you",
]);

export type UsernameValidationResult =
  | { ok: true; normalized: string }
  | { ok: false; reason: string };

export function validateUsername(value: unknown): UsernameValidationResult {
  if (typeof value !== "string") {
    return { ok: false, reason: "Username is required." };
  }
  const normalized = value.trim().toLowerCase();
  if (normalized.length < 3) {
    return {
      ok: false,
      reason: "Username must be at least 3 characters.",
    };
  }
  if (normalized.length > 30) {
    return {
      ok: false,
      reason: "Username must be at most 30 characters.",
    };
  }
  if (!USERNAME_PATTERN.test(normalized)) {
    return {
      ok: false,
      reason:
        "Username can only contain lowercase letters, digits, hyphens, and underscores — and can't start or end with a hyphen or underscore.",
    };
  }
  if (RESERVED_USERNAMES.has(normalized)) {
    return { ok: false, reason: "That username is reserved. Pick another." };
  }
  return { ok: true, normalized };
}
