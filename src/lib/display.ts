type NameSource = {
  inGameName?: string | null;
  name?: string | null;
  email?: string | null;
};

export function displayName(user: NameSource | null | undefined): string {
  if (!user) return "Unknown";
  return (
    user.inGameName?.trim() ||
    user.name?.trim() ||
    user.email?.trim() ||
    "Unknown"
  );
}
