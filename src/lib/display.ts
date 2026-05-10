type NameSource = {
  inGameName?: string | null;
};

// Only show the user-chosen in-game alias. OAuth-provided name and email
// are PII and intentionally never surfaced in the UI.
//
// When `guildTag` is set on the user's guild, prepend it as `[TAG] name` so
// guild affiliation is visible everywhere a member is rendered.
export function displayName(
  user: NameSource | null | undefined,
  guildTag?: string | null
): string {
  if (!user) return "Unknown";
  const base = user.inGameName?.trim() || "Unknown";
  const tag = guildTag?.trim();
  if (!tag) return base;
  return `[${tag}] ${base}`;
}
