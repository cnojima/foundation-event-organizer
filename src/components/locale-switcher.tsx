"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { locales, localeLabels, type Locale } from "@/i18n/config";

export function LocaleSwitcher({ className = "" }: { className?: string }) {
  const router = useRouter();
  const current = useLocale();
  const t = useTranslations("localeSwitcher");
  const [, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as Locale;
    if (next === current) return;
    setSubmitting(true);
    // Persist to user record + set the cookie. The server endpoint sets
    // NEXT_LOCALE on the response so subsequent requests use the new value.
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: next }),
    });
    if (res.ok) {
      // Re-fetch the current route under the new locale.
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
