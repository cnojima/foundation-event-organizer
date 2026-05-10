"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { locales, localeLabels, type Locale } from "@/i18n/config";

export function InGameNameDialog({ suggested }: { suggested?: string }) {
  const t = useTranslations("ingameNameDialog");
  const router = useRouter();
  const currentLocale = useLocale();
  const [name, setName] = useState(suggested ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [localeBusy, setLocaleBusy] = useState(false);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleLocaleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as Locale;
    if (next === currentLocale) return;
    setLocaleBusy(true);
    // Persist + set the NEXT_LOCALE cookie. After refresh, the layout
    // re-renders in the new language and this dialog reappears translated
    // (because inGameName is still empty).
    await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: next }),
    });
    startTransition(() => router.refresh());
    setLocaleBusy(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inGameName: name.trim() }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? t("errorGeneric"));
      setSubmitting(false);
      return;
    }
    router.refresh();
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ign-title"
    >
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <h2 id="ign-title" className="text-lg font-bold text-gray-900">
          {t("title")}
        </h2>
        <p className="mt-1 text-sm text-gray-600">{t("explanation")}</p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {t("languageLabel")}
            </label>
            <select
              value={currentLocale}
              onChange={handleLocaleChange}
              disabled={localeBusy}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 disabled:opacity-60"
            >
              {locales.map((loc) => (
                <option key={loc} value={loc}>
                  {localeLabels[loc]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {t("nameLabel")}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("placeholder")}
              maxLength={32}
              required
              autoFocus
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="w-full rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
          >
            {submitting ? t("saving") : t("save")}
          </button>
        </form>
      </div>
    </div>
  );
}
