import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import {
  encryptEmail,
  hashEmail,
  isEmailCryptoConfigured,
} from "@/lib/email-crypto";

// One-shot startup pass: for every users row that has a plaintext `email`
// but no `email_hash` / `email_encrypted` yet, compute and write the
// derived columns. After this completes, the Auth.js adapter override can
// look up users by email_hash even though the original signup wrote only
// the plaintext column.
//
// Idempotent: skips rows that already have both derived columns. Safe to
// run on every boot. The eventual `email` column drop will come in a
// follow-up migration once production has run this pass at least once
// and operators have confirmed OAuth still works against real accounts.

export type BackfillResult = {
  scanned: number;
  filled: number;
  skipped: number;
  // True when EMAIL_PEPPER / EMAIL_ENCRYPTION_KEY are unset. The pass
  // returns a zero-row result rather than crashing — the operator will
  // see the boot log message and set the secrets before any user signs in.
  configMissing: boolean;
};

export function backfillEmailHashes(): BackfillResult {
  if (!isEmailCryptoConfigured()) {
    return { scanned: 0, filled: 0, skipped: 0, configMissing: true };
  }

  // Pull every row that has a plaintext email but no hash. Encrypted may
  // also be missing — we recompute both together so they stay in sync.
  const rows = db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(and(isNotNull(users.email), isNull(users.emailHash)))
    .all();

  let filled = 0;
  let skipped = 0;
  for (const row of rows) {
    if (!row.email) {
      skipped++;
      continue;
    }
    try {
      const hash = hashEmail(row.email);
      const encrypted = encryptEmail(row.email);
      db.update(users)
        .set({ emailHash: hash, emailEncrypted: encrypted })
        .where(eq(users.id, row.id))
        .run();
      filled++;
    } catch (err) {
      // A row with a malformed email (empty after trim, etc) shouldn't
      // tank the whole pass. Log + skip.
      console.warn(`[email-backfill] skipped user=${row.id}:`, err);
      skipped++;
    }
  }

  return { scanned: rows.length, filled, skipped, configMissing: false };
}
