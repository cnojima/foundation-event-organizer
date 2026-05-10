// Next.js calls register() once per server runtime on startup. We use it to
// install process-level handlers (so we capture *why* the process is going
// away — Fly graceful shutdown, OOM, unhandled rejection, etc.) and to boot
// the Discord bot in the same Node process as the web server.
//
// Node-only logic lives in ./src/instrumentation-node.ts. We dynamic-import
// it so Next's Edge-runtime static analyzer doesn't see any process.*
// references.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { registerNode } = await import("@/instrumentation-node");
  await registerNode();
}
