import { db } from "@/db";
import { guilds } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { auth } from "@/auth";
import { requireGuildAdminPage, resolveAdminGuildId } from "@/lib/rbac";
import { loadSetupState, type SetupItemKey } from "@/lib/setup-state";
import { BOT_INSTALL_URL } from "@/lib/bot-install-url";

export const metadata = {
  title: "Guild setup",
};

// Per-step copy + link target. Each row maps a SetupItemKey to:
//   - title:      short label shown in the row header
//   - body:       fixed JSX rendered inside the row; receives the admin
//                 links pre-pinned to the right guildId via `withGuild()`
//   - cta:        primary button text + path (to be passed through
//                 `withGuild()` for impersonation safety)
// Discord-side items embed the install URL inline so admins don't have to
// dig through the help page to find it.

function withGuild(path: string, suffix: string): string {
  return suffix ? `${path}${path.includes("?") ? "&" : "?"}${suffix.replace(/^\?/, "")}` : path;
}

const KIND_LABELS: Record<"required" | "optional" | "ongoing", string> = {
  required: "Required",
  optional: "Optional",
  ongoing: "Ongoing",
};

const KIND_STYLES: Record<"required" | "optional" | "ongoing", string> = {
  required:
    "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300",
  optional:
    "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400",
  ongoing:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300",
};

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ guildId?: string }>;
}) {
  const session = await auth();
  const membership = requireGuildAdminPage(session);
  const { guildId: requestedGuildId } = await searchParams;
  const targetGuildId = await resolveAdminGuildId(membership, requestedGuildId);
  if (!targetGuildId) {
    return <p className="text-red-600 dark:text-red-300">Guild not found.</p>;
  }

  const guild = await db.query.guilds.findFirst({
    where: eq(guilds.id, targetGuildId),
  });
  if (!guild) {
    return <p className="text-red-600 dark:text-red-300">Guild not found.</p>;
  }

  const state = await loadSetupState(targetGuildId);
  const isImpersonating =
    membership.isSuperAdmin && targetGuildId !== membership.guildId;
  const guildSuffix = isImpersonating ? `guildId=${targetGuildId}` : "";

  // Render copy + link for each item. Each entry is keyed by SetupItemKey
  // so a future "skip step" or "ignore" toggle can latch onto the same key.
  const ITEM_BODIES: Record<
    SetupItemKey,
    { title: string; help: React.ReactNode; cta?: { label: string; href: string } }
  > = {
    name: {
      title: "Name your guild",
      help: (
        <p>
          Your guild&apos;s display name. Already set to{" "}
          <strong>{guild.name}</strong>. Change it any time in Settings.
        </p>
      ),
      cta: {
        label: "Edit name",
        href: withGuild("/admin/settings", guildSuffix),
      },
    },
    serverNumber: {
      title: "Set your server number",
      help: (
        <p>
          The game server number (1001–9999) your guild plays on. Required
          so scrim opponents and the cross-server player discovery page can
          find you.
        </p>
      ),
      cta: {
        label: "Open Settings",
        href: withGuild("/admin/settings", guildSuffix),
      },
    },
    description: {
      title: "Add a description",
      help: (
        <p>
          A short blurb shown on the public guilds page. Helps prospective
          members understand whether your guild&apos;s style fits theirs.
        </p>
      ),
      cta: {
        label: "Edit description",
        href: withGuild("/admin/settings", guildSuffix),
      },
    },
    botInvited: {
      title: "Invite the Discord bot",
      help: (
        <div className="space-y-2">
          <p>
            Open this install URL in a browser, pick the Discord server
            you want the bot in, and click <strong>Authorize</strong>. You
            need the <em>Manage Server</em> permission on the Discord side.
          </p>
          <p>
            This step shows as done after the bot first posts to your
            channel — usually right after you click <strong>Test
            integration</strong> in the next step.
          </p>
          <code className="block break-all rounded border border-gray-200 bg-gray-50 p-2 text-xs dark:border-gray-800 dark:bg-gray-900">
            {BOT_INSTALL_URL}
          </code>
        </div>
      ),
      cta: { label: "Open install URL", href: BOT_INSTALL_URL },
    },
    botChannel: {
      title: "Set the bot channel ID",
      help: (
        <p>
          Enable Discord <strong>Developer Mode</strong> (User Settings →
          Advanced), right-click the channel where reminders should be
          posted, choose <strong>Copy Channel ID</strong>, and paste it
          into Settings. Click <strong>Test integration</strong> to verify
          — that also marks the bot as installed.
        </p>
      ),
      cta: {
        label: "Open Discord settings",
        href: withGuild("/admin/settings", guildSuffix),
      },
    },
    voiceChannels: {
      title: "Configure voice channels",
      help: (
        <p>
          Create two voice channels in your Discord server (one per squad).
          Right-click each, <strong>Copy Channel ID</strong>, and paste
          both into Settings. The bot will DM each assigned squadmate a
          clickable join link ~10 min before their squad&apos;s start time.
        </p>
      ),
      cta: {
        label: "Open Discord settings",
        href: withGuild("/admin/settings", guildSuffix),
      },
    },
    inviteLink: {
      title: "Create an invite link",
      help: (
        <p>
          Generate a shareable join link for your members. Optional — you
          can also pre-create members yourself on the Members page (handy
          for rostering players who don&apos;t use the website).
        </p>
      ),
      cta: {
        label: "Open Invites",
        href: withGuild("/admin/invites", guildSuffix),
      },
    },
    events: {
      title: "Create your first event",
      help: (
        <p>
          Match, scrim, or simple event — whatever your guild runs. Players
          sign up; admins manage attendance and rosters from the same page.
        </p>
      ),
      cta: {
        label: "Create event",
        href: withGuild("/admin/event/new", guildSuffix),
      },
    },
    members: {
      title: "Add members",
      help: (
        <p>
          Beyond yourself: share the invite link, or pre-create members on
          the Members page (paste in-game names directly, paste a Discord
          ID for bot DMs, or upload a roster screenshot for batch import).
        </p>
      ),
      cta: {
        label: "Open Members",
        href: withGuild("/admin/members", guildSuffix),
      },
    },
  };

  return (
    <div className="mx-auto max-w-3xl">
      {isImpersonating && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          Acting as admin of <strong>{guild.name}</strong> (super-admin override).
        </div>
      )}

      <h1 className="mb-1 text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
        {guild.name} — Setup
      </h1>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        Walk through these steps to get your guild ready for match nights.
        Most can be done in any order; the Discord steps need you to bounce
        over to Discord briefly. You can come back here any time.
      </p>

      <SetupProgress state={state} />

      <ol className="mt-6 space-y-3">
        {state.items.map((item, i) => {
          const body = ITEM_BODIES[item.key];
          return (
            <li
              key={item.key}
              className={`rounded-lg border p-4 transition-colors ${
                item.done
                  ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/60 dark:bg-emerald-950/20"
                  : "border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
              }`}
            >
              <div className="flex items-start gap-3">
                <CheckBubble done={item.done} index={i + 1} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2
                      className={`text-base font-semibold ${
                        item.done
                          ? "text-emerald-800 dark:text-emerald-300"
                          : "text-gray-900 dark:text-gray-100"
                      }`}
                    >
                      {body.title}
                    </h2>
                    <span
                      className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${KIND_STYLES[item.kind]}`}
                    >
                      {KIND_LABELS[item.kind]}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    {body.help}
                  </div>
                  {!item.done && body.cta && (
                    <div className="mt-3">
                      <Link
                        href={body.cta.href}
                        target={body.cta.href.startsWith("http") ? "_blank" : undefined}
                        rel={body.cta.href.startsWith("http") ? "noreferrer" : undefined}
                        className="inline-block rounded-md bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-700"
                      >
                        {body.cta.label}
                        {body.cta.href.startsWith("http") && (
                          <span aria-hidden> ↗</span>
                        )}
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function SetupProgress({
  state,
}: {
  state: Awaited<ReturnType<typeof loadSetupState>>;
}) {
  const requiredPct = state.requiredTotal
    ? (state.requiredDone / state.requiredTotal) * 100
    : 100;
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium text-gray-900 dark:text-gray-100">
          {state.requiredDone} / {state.requiredTotal} required steps
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {state.allDone} / {state.total} total
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        <div
          className={`h-full ${state.isComplete ? "bg-emerald-500" : "bg-violet-500"}`}
          style={{ width: `${Math.min(100, requiredPct)}%` }}
        />
      </div>
      {state.isComplete && (
        <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
          ✓ Required setup complete. Optional and ongoing items remain for
          tuning as you grow.
        </p>
      )}
    </div>
  );
}

function CheckBubble({ done, index }: { done: boolean; index: number }) {
  if (done) {
    return (
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
        <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden>
          <path
            d="M5 10l3 3 7-7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }
  return (
    <div className="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-gray-300 text-xs font-bold text-gray-500 dark:border-gray-700 dark:text-gray-400">
      {index}
    </div>
  );
}
