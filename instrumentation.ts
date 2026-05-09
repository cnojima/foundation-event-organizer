// Next.js calls this once per server runtime on startup. We use it to
// boot the Discord bot alongside the web server in the same process so it
// shares the SQLite handle (same volume, no cross-machine coordination).
//
// The bot only runs in the Node.js runtime (not Edge) and only when the
// DISCORD_BOT_TOKEN env var is set. Calling startBot() multiple times is a
// no-op.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startBot } = await import("@/bot/discord-bot");
  startBot();
}
