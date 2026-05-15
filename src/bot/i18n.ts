import {
  defaultLocale,
  isSupportedLocale,
  negotiateLocale,
  type Locale,
} from "@/i18n/config";

// Bot-local translator: the Next.js `getTranslations` path is bound to the
// request context (cookies/headers), but the bot dispatches handlers from a
// long-running gateway connection, not an HTTP request. So we load the
// messages bundles directly and look keys up by dot path.
//
// Translation keys passed to t() are relative to the `bot` namespace —
// callers say `t("upcoming.empty")`, this module resolves `bot.upcoming.empty`
// in the bundle.
//
// Bundles are cached after first load. The dev server restarts the bot
// process on edits, so we don't need a TTL.

const bundleCache = new Map<Locale, Record<string, unknown>>();

async function loadBundle(locale: Locale): Promise<Record<string, unknown>> {
  const cached = bundleCache.get(locale);
  if (cached) return cached;
  const mod = await import(`@/../messages/${locale}.json`);
  const bundle = (mod.default ?? mod) as Record<string, unknown>;
  bundleCache.set(locale, bundle);
  return bundle;
}

function getByPath(obj: Record<string, unknown>, dotKey: string): unknown {
  let cur: unknown = obj;
  for (const part of dotKey.split(".")) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function interpolate(
  template: string,
  values: Record<string, string | number>
): string {
  return template.replace(/\{(\w+)\}/g, (m, k) =>
    values[k] === undefined ? m : String(values[k])
  );
}

export type BotTranslator = (
  key: string,
  values?: Record<string, string | number>
) => string;

// Returns a translator scoped to the `bot` namespace. Missing keys fall
// back to English, then to the dotted key path (mirrors the website i18n
// fallback chain in src/i18n/request.ts).
export async function getBotTranslator(locale: Locale): Promise<BotTranslator> {
  const target = await loadBundle(locale);
  const en =
    locale === defaultLocale ? target : await loadBundle(defaultLocale);
  return (key, values = {}) => {
    const fullKey = `bot.${key}`;
    const raw = getByPath(target, fullKey) ?? getByPath(en, fullKey);
    if (typeof raw !== "string") return fullKey;
    return interpolate(raw, values);
  };
}

// Resolve which locale to render bot output in. Priority:
//   1. The user's stored preference (users.locale) — set on the website.
//   2. Discord's interaction.locale (the user's Discord client language).
//   3. Default ("en").
// The interaction-locale fallback uses the same Accept-Language negotiator
// the website uses, so prefix matches (e.g. "en-US" → "en") work the same way.
export function resolveBotLocale(
  storedLocale: string | null | undefined,
  interactionLocale: string | null | undefined
): Locale {
  if (storedLocale && isSupportedLocale(storedLocale)) return storedLocale;
  if (interactionLocale) return negotiateLocale(interactionLocale);
  return defaultLocale;
}
