type NameSource = {
  inGameName?: string | null;
};

// Only show the user-chosen in-game alias. OAuth-provided name and email
// are PII and intentionally never surfaced in the UI.
export function displayName(user: NameSource | null | undefined): string {
  if (!user) return "Unknown";
  return user.inGameName?.trim() || "Unknown";
}
