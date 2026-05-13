"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

// Thin wrapper so the rest of the app imports from one place. next-themes
// handles the no-flash inline script, localStorage persistence, and
// system-preference watching; we just need to mount its provider once.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="theme"
    >
      {children}
    </NextThemesProvider>
  );
}
