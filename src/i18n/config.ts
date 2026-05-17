// Source of truth for the locales the app supports. Add a code here AND a
// matching messages/<code>.json file before checking it in.

export const locales = [
  "en",
  "fr",
  "de",
  "ru",
  "uk",
  "zh-CN",
  "ko",
  "ja",
  "es",
  "pt-BR",
  "it",
  "id",
  "nl",
  "tr",
  "pl",
  "vi",
  "sv",
  "nb",
] as const;

export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export const LOCALE_COOKIE = "NEXT_LOCALE";

// Display names for the locale switcher. Each rendered in its own locale
// (autonyms) so users see their language listed in their language.
export const localeLabels: Record<Locale, string> = {
  en: "English",
  fr: "Français",
  de: "Deutsch",
  ru: "Русский",
  uk: "Українська",
  "zh-CN": "简体中文",
  ko: "한국어",
  ja: "日本語",
  es: "Español",
  "pt-BR": "Português (Brasil)",
  it: "Italiano",
  id: "Bahasa Indonesia",
  nl: "Nederlands",
  tr: "Türkçe",
  pl: "Polski",
  vi: "Tiếng Việt",
  sv: "Svenska",
  nb: "Norsk bokmål",
};

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

// Picks the closest supported locale from a comma-separated Accept-Language
// header, falling back to the default. Honors quality values lazily — for an
// alpha, exact-match first then prefix-match (e.g., "pt-PT" → "pt-BR").
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return defaultLocale;
  const tags = acceptLanguage
    .split(",")
    .map((s) => s.split(";")[0].trim())
    .filter(Boolean);
  for (const tag of tags) {
    if (isSupportedLocale(tag)) return tag;
  }
  for (const tag of tags) {
    const prefix = tag.split("-")[0].toLowerCase();
    const match = locales.find((l) => l.toLowerCase().startsWith(prefix));
    if (match) return match;
  }
  return defaultLocale;
}
