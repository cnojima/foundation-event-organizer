import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import {
  defaultLocale,
  isSupportedLocale,
  LOCALE_COOKIE,
  negotiateLocale,
  type Locale,
} from "./config";

// next-intl calls this once per request to resolve the active locale and
// load its message bundle. We pick from cookie → Accept-Language → default,
// then load messages/<locale>.json deep-merged on top of messages/en.json so
// any key missing from the target locale silently falls back to English
// instead of rendering its key path.
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;

  let locale: Locale;
  if (cookieLocale && isSupportedLocale(cookieLocale)) {
    locale = cookieLocale;
  } else {
    const headerStore = await headers();
    locale = negotiateLocale(headerStore.get("accept-language"));
  }

  const messages = await loadMessages(locale);

  return {
    locale,
    messages,
    // Treat any thrown formatter / missing message as a soft fallback rather
    // than a 500. We log to the console so it shows up in dev logs.
    onError(error) {
      console.warn("[i18n]", error);
    },
    // Truly missing keys (not in en either) get the key path — easier to
    // spot during development than an empty string.
    getMessageFallback({ key, namespace }) {
      return namespace ? `${namespace}.${key}` : key;
    },
  };
});

async function loadMessages(
  locale: Locale
): Promise<Record<string, unknown>> {
  const en = await loadFile(defaultLocale);
  if (locale === defaultLocale) return en;
  try {
    const target = await loadFile(locale);
    return deepMerge(en, target);
  } catch (err) {
    console.warn(`[i18n] failed to load messages/${locale}.json:`, err);
    return en;
  }
}

async function loadFile(locale: Locale): Promise<Record<string, unknown>> {
  const mod = await import(`@/../messages/${locale}.json`);
  return (mod.default ?? mod) as Record<string, unknown>;
}

// Right-biased deep merge: nested objects merge recursively; leaf values
// from `overrides` win. Returns a new object; inputs untouched.
function deepMerge(
  base: Record<string, unknown>,
  overrides: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    const baseValue = base[key];
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      baseValue &&
      typeof baseValue === "object" &&
      !Array.isArray(baseValue)
    ) {
      out[key] = deepMerge(
        baseValue as Record<string, unknown>,
        value as Record<string, unknown>
      );
    } else {
      // Empty strings shouldn't override a real English value (Google
      // sometimes returns blank for unintelligible inputs).
      if (typeof value === "string" && value.trim() === "") continue;
      out[key] = value;
    }
  }
  return out;
}
