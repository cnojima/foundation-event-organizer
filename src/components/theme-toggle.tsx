"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

// Three-state toggle: system / light / dark. Cycles on click so we can
// fit in the top bar without a popover. Tooltip-style hover label tells
// the user which mode they're about to switch to.
//
// Hydration guard: `useTheme()` returns "" on the server, so we render a
// placeholder until mounted to avoid a hydration mismatch on the icon.
export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <button
        type="button"
        aria-label="Theme"
        className="grid size-8 place-items-center rounded-md text-gray-500"
      >
        <span className="size-4" />
      </button>
    );
  }

  const current = theme === "system" ? "system" : theme;
  const next =
    current === "system" ? "light" : current === "light" ? "dark" : "system";
  const labels: Record<string, string> = {
    system: "Switch to light",
    light: "Switch to dark",
    dark: "Switch to system",
  };

  // Show whichever icon represents the *active* appearance — when on
  // "system" the resolvedTheme tells us what the OS chose.
  const showDark = current === "dark" || (current === "system" && resolvedTheme === "dark");

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      title={labels[current ?? "system"]}
      aria-label={labels[current ?? "system"]}
      className="grid size-8 place-items-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
    >
      {current === "system" ? (
        <SystemIcon />
      ) : showDark ? (
        <MoonIcon />
      ) : (
        <SunIcon />
      )}
    </button>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden>
      <circle cx="10" cy="10" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10 1.5v2.5M10 16v2.5M3.7 3.7l1.8 1.8M14.5 14.5l1.8 1.8M1.5 10H4M16 10h2.5M3.7 16.3l1.8-1.8M14.5 5.5l1.8-1.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden>
      <path
        d="M16.5 12.5A7 7 0 1 1 7.5 3.5a5.5 5.5 0 0 0 9 9Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SystemIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden>
      <rect
        x="2.5"
        y="3.5"
        width="15"
        height="11"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M7 17h6M10 14.5v2.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
