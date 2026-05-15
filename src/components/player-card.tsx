import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { UserAvatar } from "@/components/user-avatar";
import { displayName } from "@/lib/display";
import { DateTime } from "@/components/date-time";

export type PlayerCardData = {
  id: string;
  inGameName: string | null;
  image: string | null;
  powerTier:
    | "I"
    | "II"
    | "III"
    | "IV"
    | "V"
    | "VI"
    | "VII"
    | "VIII"
    | "IX"
    | "X"
    | "XI"
    | "XII"
    | "XIII"
    | null;
  duelRating: number;
  duelWins: number;
  duelLosses: number;
  duelDraws: number;
  feedbackUpCount: number;
  feedbackDownCount: number;
  lastDuelAt: string | null;
  guildName: string;
  guildTag: string | null;
};

// Single-player display used on /players discovery, /leaderboard, and the
// public guild roster. `sameGuild=true` labels guildmates with a hint and,
// by default, also suppresses the Challenge button (since cross-guild
// discovery is for finding new opponents). Pass an explicit `canChallenge`
// to override that default — e.g. on a guild profile where Challenge should
// be hidden when the viewer's server # doesn't match the target guild's.
export async function PlayerCard({
  player,
  sameGuild = false,
  canChallenge,
  challengeDisabledHint,
}: {
  player: PlayerCardData;
  sameGuild?: boolean;
  canChallenge?: boolean;
  challengeDisabledHint?: string;
}) {
  const t = await getTranslations("players");
  const effectiveCanChallenge = canChallenge ?? !sameGuild;
  const name = displayName({ inGameName: player.inGameName }, player.guildTag);
  const totalDuels = player.duelWins + player.duelLosses + player.duelDraws;
  const totalFeedback = player.feedbackUpCount + player.feedbackDownCount;
  const reputationPct =
    totalFeedback >= 5
      ? Math.round((player.feedbackUpCount / totalFeedback) * 100)
      : null;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
      {/* Name + avatar area opens the public profile. Keeping Challenge as
          a separate adjacent button avoids accidental "open profile when
          you meant to challenge" misclicks. */}
      <Link
        href={`/players/${player.id}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md -mx-1 -my-1 px-1 py-1 hover:bg-gray-50 dark:hover:bg-gray-800"
      >
        <UserAvatar name={name} image={player.image} size="size-12" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold text-gray-900 dark:text-gray-100">{name}</span>
            {player.powerTier && <TierChip tier={player.powerTier} />}
            {sameGuild && (
              <span className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300">
                {t("sameGuildBadge")}
              </span>
            )}
          </div>
          <p className="truncate text-xs text-gray-500 dark:text-gray-400">{player.guildName}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-600 dark:text-gray-400">
            <span title={t("ratingTooltip")}>
              <span className="font-semibold text-gray-900 dark:text-gray-100">{player.duelRating}</span>{" "}
              {t("rating")}
            </span>
            {totalDuels > 0 && (
              <span title={t("recordTooltip")}>
                {player.duelWins}W &middot; {player.duelLosses}L
                {player.duelDraws > 0 && ` · ${player.duelDraws}D`}
              </span>
            )}
            {reputationPct !== null && (
              <span title={t("reputationTooltip", { count: totalFeedback })}>
                👍 {reputationPct}%
              </span>
            )}
            {player.lastDuelAt && (
              <span className="text-gray-400 dark:text-gray-500">
                {t("lastActiveLabel")}{" "}
                <DateTime iso={player.lastDuelAt} mode="date" />
              </span>
            )}
          </div>
        </div>
      </Link>
      {effectiveCanChallenge ? (
        <Link
          href={`/duels/new?opponent=${player.id}`}
          className="shrink-0 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
        >
          {t("challenge")}
        </Link>
      ) : (
        <span
          className="shrink-0 rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500"
          title={challengeDisabledHint ?? t("sameGuildChallengeHint")}
        >
          {t("challenge")}
        </span>
      )}
    </div>
  );
}

function TierChip({ tier }: { tier: NonNullable<PlayerCardData["powerTier"]> }) {
  return (
    <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
      {tier}
    </span>
  );
}
