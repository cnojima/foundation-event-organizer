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

// Single-player display used on /players discovery and /leaderboard.
// Server component — no Challenge handler yet (Phase 3 wires that up).
// `sameGuild=true` labels guildmates with a hint and skips the Challenge
// affordance since cross-guild discovery is for finding new opponents.
export async function PlayerCard({
  player,
  sameGuild = false,
}: {
  player: PlayerCardData;
  sameGuild?: boolean;
}) {
  const t = await getTranslations("players");
  const name = displayName({ inGameName: player.inGameName }, player.guildTag);
  const totalDuels = player.duelWins + player.duelLosses + player.duelDraws;
  const totalFeedback = player.feedbackUpCount + player.feedbackDownCount;
  const reputationPct =
    totalFeedback >= 5
      ? Math.round((player.feedbackUpCount / totalFeedback) * 100)
      : null;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
      {/* Name + avatar area opens the public profile. Keeping Challenge as
          a separate adjacent button avoids accidental "open profile when
          you meant to challenge" misclicks. */}
      <Link
        href={`/players/${player.id}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md -mx-1 -my-1 px-1 py-1 hover:bg-gray-50"
      >
        <UserAvatar name={name} image={player.image} size="size-12" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold text-gray-900">{name}</span>
            {player.powerTier && <TierChip tier={player.powerTier} />}
            {sameGuild && (
              <span className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700">
                {t("sameGuildBadge")}
              </span>
            )}
          </div>
          <p className="truncate text-xs text-gray-500">{player.guildName}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-600">
            <span title={t("ratingTooltip")}>
              <span className="font-semibold text-gray-900">{player.duelRating}</span>{" "}
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
              <span className="text-gray-400">
                {t("lastActiveLabel")}{" "}
                <DateTime iso={player.lastDuelAt} mode="date" />
              </span>
            )}
          </div>
        </div>
      </Link>
      {sameGuild ? (
        <span
          className="shrink-0 rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-400"
          title={t("sameGuildChallengeHint")}
        >
          {t("challenge")}
        </span>
      ) : (
        <Link
          href={`/duels/new?opponent=${player.id}`}
          className="shrink-0 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
        >
          {t("challenge")}
        </Link>
      )}
    </div>
  );
}

function TierChip({ tier }: { tier: NonNullable<PlayerCardData["powerTier"]> }) {
  return (
    <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-700">
      {tier}
    </span>
  );
}
