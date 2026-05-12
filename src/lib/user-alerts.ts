import { db } from "@/db";
import { accounts, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";

// Actionable items the user should see in the notification bell. Each
// alert has a stable `kind` (so the UI can look up i18n strings), and a
// `href` the bell links to. Order in the returned array determines
// display order.
//
// Adding a new alert: pick a `kind`, add the row in computeUserAlerts,
// add an i18n key under `alerts.<kind>` for the label, and (if needed)
// translate it. The NotificationBell renders any alerts it gets without
// caring what they mean.
export type UserAlert = {
  kind: "discord_unlinked";
  href: string;
};

// Returns the list of unmet preconditions / nudges for this user.
// Currently surfaces one alert: "Discord not linked" — relevant for
// players who signed up via Google and therefore can't receive duel
// DMs. Power-tier-unset, profile-incomplete, etc. can be added here.
export async function computeUserAlerts(
  userId: string
): Promise<UserAlert[]> {
  const me = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { duelDmEnabled: true, discordUserId: true },
  });
  if (!me) return [];

  const alerts: UserAlert[] = [];

  // Only nudge users who actually want DMs — if they've explicitly
  // opted out of duel notifications, linking Discord doesn't help them.
  // The Discord ID may be set directly on users.discord_user_id OR (for
  // legacy Discord-OAuth users) only in the accounts table; treat
  // either as "Discord reachable."
  if (me.duelDmEnabled) {
    let discordReachable = !!me.discordUserId;
    if (!discordReachable) {
      const legacyLink = await db
        .select({ id: accounts.providerAccountId })
        .from(accounts)
        .where(
          and(eq(accounts.userId, userId), eq(accounts.provider, "discord"))
        )
        .get();
      discordReachable = !!legacyLink;
    }
    if (!discordReachable) {
      alerts.push({ kind: "discord_unlinked", href: "/me" });
    }
  }

  return alerts;
}
