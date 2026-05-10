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
