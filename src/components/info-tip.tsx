"use client";

import { useEffect, useRef, useState } from "react";

// Wraps any element with a hover/click popover. The wrapped element is the
// trigger — no extra icon. Use for badges, buttons, status pills.
export function InfoTip({
  content,
  children,
  className = "",
  placement = "top",
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  placement?: "top" | "bottom";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const positionClasses =
    placement === "top"
      ? "bottom-full left-1/2 mb-1.5 -translate-x-1/2"
      : "top-full left-1/2 mt-1.5 -translate-x-1/2";

  return (
    <span
      ref={ref}
      className={`relative inline-flex group ${className}`}
      onClick={(e) => {
        // Don't trigger when clicks are inside form controls within children.
        if ((e.target as HTMLElement).closest("button, input, select, textarea, a")) {
          return;
        }
        setOpen((v) => !v);
      }}
    >
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 w-max max-w-xs rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs leading-relaxed text-gray-700 shadow-lg transition-opacity ${positionClasses} ${
          open
            ? "opacity-100 visible"
            : "invisible opacity-0 group-hover:visible group-hover:opacity-100"
        }`}
      >
        {content}
      </span>
    </span>
  );
}

// Small "?" icon trigger — use when wrapping the underlying element isn't
// ergonomic (e.g., next to a form label that already has its own click target).
export function InfoTipIcon({
  content,
  label = "More info",
  placement = "top",
}: {
  content: React.ReactNode;
  label?: string;
  placement?: "top" | "bottom";
}) {
  return (
    <InfoTip content={content} placement={placement}>
      <button
        type="button"
        aria-label={label}
        className="inline-flex size-4 items-center justify-center rounded-full border border-gray-300 bg-white text-[10px] font-bold text-gray-500 hover:border-gray-400 hover:text-gray-700"
      >
        ?
      </button>
    </InfoTip>
  );
}
