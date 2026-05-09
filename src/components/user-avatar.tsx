type Props = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  /** Tailwind size class, e.g. "size-9", "size-10". Defaults to "size-10". */
  size?: string;
};

export function UserAvatar({ name, email, image, size = "size-10" }: Props) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt=""
        className={`${size} rounded-full object-cover ring-1 ring-gray-200`}
      />
    );
  }

  const initial = (name ?? email ?? "?").slice(0, 1).toUpperCase();
  return (
    <div
      className={`${size} grid place-items-center rounded-full bg-violet-100 text-sm font-semibold text-violet-700`}
    >
      {initial}
    </div>
  );
}
