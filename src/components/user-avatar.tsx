type Props = {
  name?: string | null;
  /** Tailwind size class, e.g. "size-9", "size-10". Defaults to "size-10". */
  size?: string;
};

// Avatars are derived from the in-game name only. We deliberately do not
// render OAuth-provided profile photos because they leak the user's external
// identity (Google face photo, Discord avatar tied to handle).
export function UserAvatar({ name, size = "size-10" }: Props) {
  const initial = (name ?? "?").trim().slice(0, 1).toUpperCase() || "?";
  return (
    <div
      className={`${size} grid place-items-center rounded-full bg-violet-100 text-sm font-semibold text-violet-700`}
    >
      {initial}
    </div>
  );
}
