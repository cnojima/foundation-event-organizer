import crypto from "node:crypto";

// Email PII protection. Plaintext email is never stored in the DB — two
// derived columns are kept instead:
//
//   - users.email_hash       (HMAC-SHA-256, deterministic, indexed/unique)
//                            used by the app for lookup ("is this email in
//                            the DB?", OAuth-merge, dedup).
//   - users.email_encrypted  (AES-256-GCM, recoverable)
//                            decrypted only by the password-reset endpoint
//                            when a user explicitly requests a reset email.
//
// Threat model (per design discussion):
//   - Bulk DB dump → both columns useless without server-held secrets.
//   - Targeted lookup ("is alice@example.com in the DB?") with DB + pepper
//     access → possible (deterministic hash). Acceptable for our scope.
//   - Live app compromise → attacker has access to the secrets in process
//     memory anyway. Out of scope.

const HASH_ALGO = "sha256";
const ENC_ALGO = "aes-256-gcm";
const ENC_IV_BYTES = 12; // GCM standard
const ENC_KEY_BYTES = 32; // 256 bits

// Lazy-loaded secrets. We don't read the env at import time — that would
// crash app boot if either is missing, even when no email-touching code
// runs. Instead, throw at first use so the affected request fails
// loudly while everything else keeps working.
let cachedPepper: Buffer | null = null;
let cachedKey: Buffer | null = null;

function getPepper(): Buffer {
  if (cachedPepper) return cachedPepper;
  const raw = process.env.EMAIL_PEPPER;
  if (!raw || raw.length === 0) {
    throw new Error(
      "EMAIL_PEPPER is not configured. Set it as a base64-encoded 32-byte secret — see .env.local.example."
    );
  }
  // Accept base64 or raw string. Anything goes through HMAC, so length
  // only matters insofar as too-short reduces entropy.
  cachedPepper = Buffer.from(raw, "base64");
  if (cachedPepper.length < 16) {
    // Fallback: treat as raw string. This lets devs paste an arbitrary
    // secret and still get a sensible hash.
    cachedPepper = Buffer.from(raw, "utf-8");
  }
  return cachedPepper;
}

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.EMAIL_ENCRYPTION_KEY;
  if (!raw || raw.length === 0) {
    throw new Error(
      "EMAIL_ENCRYPTION_KEY is not configured. Set it as a base64-encoded 32-byte secret — see .env.local.example."
    );
  }
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length !== ENC_KEY_BYTES) {
    throw new Error(
      `EMAIL_ENCRYPTION_KEY must decode to exactly ${ENC_KEY_BYTES} bytes (got ${decoded.length}). Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
    );
  }
  cachedKey = decoded;
  return cachedKey;
}

// Normalize for consistent hashing: trim + lowercase. We don't try to
// canonicalize beyond that (no plus-tag stripping, no Gmail dot folding) —
// users get the result they typed in. If two users happen to share a
// canonical address, they sign up as two distinct rows.
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Deterministic HMAC of the normalized email with the server pepper.
// Used as the unique index on users.email_hash.
export function hashEmail(email: string): string {
  const normalized = normalizeEmail(email);
  if (normalized.length === 0) {
    throw new Error("hashEmail called with empty email.");
  }
  return crypto
    .createHmac(HASH_ALGO, getPepper())
    .update(normalized, "utf-8")
    .digest("hex");
}

// AES-256-GCM encrypt. Output format: `<iv-base64>:<ciphertext-base64>:<tag-base64>`.
// Random IV per call, so encrypting the same email twice produces different
// blobs (intended — non-deterministic protects against ciphertext-based
// equality testing).
export function encryptEmail(email: string): string {
  const normalized = normalizeEmail(email);
  if (normalized.length === 0) {
    throw new Error("encryptEmail called with empty email.");
  }
  const iv = crypto.randomBytes(ENC_IV_BYTES);
  const cipher = crypto.createCipheriv(ENC_ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(normalized, "utf-8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${ciphertext.toString("base64")}:${tag.toString("base64")}`;
}

// Reverse of `encryptEmail`. Returns null if the blob is malformed or the
// auth tag doesn't verify — callers can treat that as "lost" PII rather
// than throwing.
export function decryptEmail(blob: string): string | null {
  if (!blob) return null;
  const parts = blob.split(":");
  if (parts.length !== 3) return null;
  try {
    const iv = Buffer.from(parts[0], "base64");
    const ciphertext = Buffer.from(parts[1], "base64");
    const tag = Buffer.from(parts[2], "base64");
    if (iv.length !== ENC_IV_BYTES) return null;
    const decipher = crypto.createDecipheriv(ENC_ALGO, getKey(), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return plaintext.toString("utf-8");
  } catch {
    // Malformed blob, tag mismatch, or wrong key. Don't leak which.
    return null;
  }
}

// True when both secrets are configured. Surfaces in /admin/setup or
// startup-time checks so an operator knows the email-PII protection is
// actually active. Calling this never throws.
export function isEmailCryptoConfigured(): boolean {
  try {
    getPepper();
    getKey();
    return true;
  } catch {
    return false;
  }
}
