"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  locales,
  localeLabels,
  localeFlagCountry,
  LOCALE_COOKIE,
  type Locale,
} from "@/i18n/config";

// Kept as a standalone module-level function (rather than inline in the
// event handler) so the DOM mutation isn't attributed to component render
// scope by the react-compiler lint rule.
function setLocaleCookie(next: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}

function FlagIcon({ locale, className = "size-4" }: { locale: Locale; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static SVG, not worth next/image's overhead
    <img
      src={`/flags/${localeFlagCountry[locale]}.svg`}
      alt=""
      aria-hidden
      className={`inline-block shrink-0 rounded-[2px] object-cover ring-1 ring-black/10 dark:ring-white/10 ${className}`}
    />
  );
}

// When `signedIn` is false (the default for the landing page), the
// switcher sets NEXT_LOCALE via document.cookie and refreshes — no API
// call, no user-record update. Signed-in users get the original PATCH
// /api/me flow so their choice persists across devices.
//
// `variant="compact"` renders an icon-only trigger (flag only, no label) to
// match the other icon buttons in the top bar; `variant="full"` (default)
// shows the flag plus the language name, for the standalone signed-out
// pages (landing, sign in, sign up) where it replaces what used to be a
// plain <select>. A native <select> can't render the flag images inside its
// options, so both variants use a custom dropdown instead.
export function LocaleSwitcher({
  className = "",
  signedIn = true,
  variant = "full",
}: {
  className?: string;
  signedIn?: boolean;
  variant?: "full" | "compact";
}) {
  const router = useRouter();
  const current = useLocale() as Locale;
  const t = useTranslations("localeSwitcher");
  const [, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
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

  async function selectLocale(next: Locale) {
    setOpen(false);
    if (next === current) return;
    setSubmitting(true);
    if (signedIn) {
      // Persist to user record + set the cookie via the API response.
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
      if (res.ok) {
        startTransition(() => router.refresh());
      }
    } else {
      // Signed-out — just set the cookie client-side. next-intl reads
      // NEXT_LOCALE on the next request. 1 year so it survives browser
      // sessions. SameSite=Lax matches the API-set cookie.
      setLocaleCookie(next);
      startTransition(() => router.refresh());
    }
    setSubmitting(false);
  }

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={submitting}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("ariaLabel")}
        title={variant === "compact" ? localeLabels[current] : undefined}
        className={
          variant === "compact"
            ? "grid size-8 place-items-center rounded-md transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
            : "flex items-center gap-2 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
        }
      >
        <FlagIcon locale={current} className={variant === "compact" ? "size-5" : "size-4"} />
        {variant === "full" && <span>{localeLabels[current]}</span>}
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={t("ariaLabel")}
          className="absolute right-0 z-50 mt-1 max-h-80 w-56 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
        >
          {locales.map((loc) => (
            <button
              key={loc}
              type="button"
              role="option"
              aria-selected={loc === current}
              onClick={() => selectLocale(loc)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                loc === current
                  ? "bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-200"
                  : "text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
              }`}
            >
              <FlagIcon locale={loc} className="size-4" />
              <span>{localeLabels[loc]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
