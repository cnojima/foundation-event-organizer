// Soft-deprecation switches. Flip a flag to `true` to bring a feature back
// without reverting code — routes, APIs, and data stay intact; only nav
// entries, CTAs, and help docs are gated on the flag.
export const FEATURE_FLAGS = {
  // Duels, scrimmages, the leaderboard, and cross-guild player discovery
  // (findPlayers). Usage data showed these features aren't being used.
  socialFeaturesEnabled: false,
} as const;
