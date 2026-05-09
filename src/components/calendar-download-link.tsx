type Props = {
  href: string;
  label?: string;
  filename?: string;
  className?: string;
};

export function CalendarDownloadLink({
  href,
  label = "Add to Calendar",
  filename,
  className,
}: Props) {
  return (
    <a
      href={href}
      download={filename}
      className={
        className ??
        "inline-flex items-center gap-2 rounded-md border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-700 hover:bg-violet-100"
      }
    >
      <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden>
        <rect
          x="2.5"
          y="4"
          width="15"
          height="13.5"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M6 2v4M14 2v4M2.5 8.5h15M10 11.5v4M8 13.5h4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      {label}
    </a>
  );
}
