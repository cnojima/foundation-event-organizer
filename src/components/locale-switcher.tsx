"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { locales, localeLabels, LOCALE_COOKIE, type Locale } from "@/i18n/config";

// When `signedIn` is false (the default for the landing page), the
// switcher sets NEXT_LOCALE via document.cookie and refreshes — no API
// call, no user-record update. Signed-in users get the original PATCH
// /api/me flow so their choice persists across devices.
export function LocaleSwitcher({
  className = "",
  signedIn = true,
}: {
  className?: string;
  signedIn?: boolean;
}) {
  const router = useRouter();
  const current = useLocale();
  const t = useTranslations("localeSwitcher");
  const [, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as Locale;
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
      document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
      startTransition(() => router.refresh());
    }
    setSubmitting(false);
  }

  return (
    <label className={`flex items-center gap-2 text-xs text-gray-600 ${className}`}>
      <span className="sr-only">{t("ariaLabel")}</span>
      <select
        value={current}
        onChange={handleChange}
        disabled={submitting}
        aria-label={t("ariaLabel")}
        className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
      >
        {locales.map((loc) => (
          <option key={loc} value={loc}>
            {localeLabels[loc]}
          </option>
        ))}
      </select>
    </label>
  );
}
