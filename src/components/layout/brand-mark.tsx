import { Logo } from "@/components/logo";

type Props = {
  size?: number;
  className?: string;
};

// Thin wrapper around the canonical <Logo /> so sidebar, mobile nav, and
// footer share the exact same mark. `size` accepts pixels for API
// compatibility with existing callers; we translate that into an inline
// width/height style on the SVG.
export function BrandMark({ size = 32, className }: Props) {
  return (
    <span
      className={className}
      style={{ display: "inline-flex", width: size, height: size }}
      aria-hidden
    >
      <Logo variant="icon" className="size-full" />
    </span>
  );
}
