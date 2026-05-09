type Props = {
  size?: number;
  className?: string;
};

export function BrandMark({ size = 32, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M16 2 L28 16 L16 30 L4 16 Z"
        fill="url(#brand-mark-gradient)"
        stroke="#7c3aed"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M16 8 L22 16 L16 24 L10 16 Z"
        fill="#fff"
        fillOpacity="0.85"
        stroke="#7c3aed"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient id="brand-mark-gradient" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#a78bfa" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
    </svg>
  );
}
