// Node-only instrumentation: process signal handlers, boot audit log, and
// Discord bot startup. Dynamic-imported from /instrumentation.ts so that
// Next.js's Edge runtime analyzer doesn't see any of these process.*
// references.

const APP_BOOT_AT = new Date().toISOString();

let lifecycleInstalled = false;

export async function registerNode(): Promise<void> {
  console.log(
    `[boot] register called runtime=${process.env.NEXT_RUNTIME} node=${process.version} pid=${process.pid} at=${APP_BOOT_AT}`
  );

  installLifecycleHandlers();

  // Apply pending DB migrations BEFORE booting the bot — the bot reads
  // from the same DB and would fail on schema mismatches. Migrations are
  // idempotent (Drizzle tracks applied ones in __drizzle_migrations) so
  // this is safe to run every boot.
  try {
    const { runMigrations } = await import("@/db/migrate");
    runMigrations();
    console.log("[boot] migrations applied");
  } catch (err) {
    console.error("[boot] migration failed:", err);
    // Don't throw — let the app boot so /api/health still responds and the
    // operator can investigate via logs.
  }

  // Backfill email_hash + email_encrypted for users created before the
  // PII-protection migration. Idempotent — only touches rows that have a
  // plaintext email but no derived columns. If EMAIL_PEPPER /
  // EMAIL_ENCRYPTION_KEY aren't configured yet, this no-ops with a
  // warning so the boot still succeeds; the operator then sets the
  // secrets and the next boot completes the backfill.
  try {
    const { backfillEmailHashes } = await import("@/lib/email-backfill");
    const r = backfillEmailHashes();
    if (r.configMissing) {
      console.warn(
        "[boot] email backfill skipped — EMAIL_PEPPER and/or EMAIL_ENCRYPTION_KEY are not set. Configure them as Fly secrets, then restart."
      );
    } else if (r.filled > 0 || r.skipped > 0) {
      console.log(
        `[boot] email backfill: filled=${r.filled} skipped=${r.skipped} of ${r.scanned} candidates`
      );
    }
  } catch (err) {
    console.error("[boot] email backfill failed:", err);
  }

  // Backfill canonical event templates for guilds that predate the
  // event_templates table. Idempotent — skips any guild that already has
  // at least one template row, so re-running on boot is a near-no-op.
  try {
    const { seedDefaultTemplatesForAllGuilds } = await import(
      "@/lib/event-templates"
    );
    const result = seedDefaultTemplatesForAllGuilds();
    if (result.guildsSeeded > 0) {
      console.log(
        `[boot] event templates seeded for ${result.guildsSeeded}/${result.guildsScanned} guilds`
      );
    }
  } catch (err) {
    console.error("[boot] event template seed failed:", err);
  }

  const { startBot } = await import("@/bot/discord-bot");
  startBot();
}

function installLifecycleHandlers(): void {
  if (lifecycleInstalled) return;
  lifecycleInstalled = true;

  // Fly stops machines with SIGINT first, then SIGTERM, then SIGKILL after
  // ~5s. Logging both is enough to tell graceful shutdowns apart from
  // hard crashes (where neither line appears).
  for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"] as const) {
    process.on(sig, () => {
      console.log(
        `[lifecycle] received ${sig} — shutting down (uptime=${Math.round(
          process.uptime()
        )}s)`
      );
      process.exit(0);
    });
  }

  process.on("uncaughtException", (err) => {
    console.error("[lifecycle] uncaughtException:", err);
  });

  process.on("unhandledRejection", (reason) => {
    console.error("[lifecycle] unhandledRejection:", reason);
  });

  process.on("warning", (warning) => {
    console.warn(
      `[lifecycle] node warning name=${warning.name} message=${warning.message}`
    );
  });
}
