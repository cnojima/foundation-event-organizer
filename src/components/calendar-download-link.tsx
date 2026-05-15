import { headerActionClasses } from "@/components/header-action-button";

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
      className={className ?? headerActionClasses("violet")}
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
