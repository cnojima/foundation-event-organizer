// Foundation Event Organizer logo. Hexagonal shield + stylized "F"
// monogram, rendered as inline SVG so it themes via CSS (currentColor on
// the F, hex fill set by `fill` prop). Two variants:
//
//   <Logo variant="icon" />      → square mark only (favicon-friendly)
//   <Logo variant="wordmark" />  → mark + full product name (hero/header use)
//
// Geometry is hand-tuned in a 100×100 viewBox so the hex sits centered and
// the F has consistent stroke weight at every size. Don't refactor without
// eyeballing the result at 16px (favicon) AND 80px (hero).

type LogoVariant = "icon" | "wordmark";

export function Logo({
  variant = "icon",
  className = "",
}: {
  variant?: LogoVariant;
  className?: string;
}) {
  if (variant === "wordmark") {
    // Matches the sidebar header treatment from sidebar.tsx so the same
    // brand reads identically across surfaces — uppercase main, smaller
    // letter-spaced "EVENT ORGANIZER" subtitle.
    return (
      <span className={`inline-flex items-center gap-3 ${className}`}>
        <LogoMark className="size-10 shrink-0" />
        <span className="flex flex-col leading-tight">
          <span className="text-sm font-bold tracking-wider text-gray-900">
            FOUNDATION GALACTIC FRONTIER
          </span>
          <span className="text-[10px] font-medium tracking-[0.2em] text-gray-500">
            EVENT ORGANIZER
          </span>
        </span>
      </span>
    );
  }
  return <LogoMark className={className} />;
}

function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Foundation Event Organizer"
    >
      {/* Concept #3: two interlocking flat-top hexagons. Lighter hex
          behind, darker hex in front with reduced opacity so the overlap
          region blends to a deep violet. Reads as "two guilds meeting"
          / "network intersection" without any combat imagery.
          (Concept #1 — hex shield + F monogram — is in git history if
          you want to revert.) */}
      <path
        d="M23 28 L47 28 L60 50 L47 72 L23 72 L10 50 Z"
        fill="#a78bfa"
      />
      <path
        d="M53 28 L77 28 L90 50 L77 72 L53 72 L40 50 Z"
        fill="#6d28d9"
        opacity="0.88"
      />
    </svg>
  );
}
