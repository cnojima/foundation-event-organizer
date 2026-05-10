"use client";

import { useEffect } from "react";

export function HelpViewedTracker() {
  useEffect(() => {
    if (document.cookie.split("; ").some((c) => c.startsWith("help_viewed="))) {
      return;
    }
    document.cookie =
      "help_viewed=1; path=/; max-age=31536000; samesite=lax";
  }, []);
  return null;
}
