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
// then load messages/<locale>.json. Missing keys fall back to en (configured
// in NextIntlClientProvider).
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
    getMessageFallback({ key, namespace }) {
      return namespace ? `${namespace}.${key}` : key;
    },
  };
});

async function loadMessages(locale: Locale): Promise<Record<string, unknown>> {
  try {
    const mod = await import(`@/../messages/${locale}.json`);
    return mod.default ?? mod;
  } catch (err) {
    console.warn(`[i18n] failed to load messages/${locale}.json:`, err);
    if (locale !== defaultLocale) {
      const mod = await import(`@/../messages/${defaultLocale}.json`);
      return mod.default ?? mod;
    }
    return {};
  }
}
