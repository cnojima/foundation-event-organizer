// Translate messages/en.json into the other supported locales using Google
// Cloud Translation v3.
//
// Usage:
//   GOOGLE_TRANSLATE_API_KEY=... GOOGLE_PROJECT_ID=... \
//     node scripts/translate-messages.mjs [--locales=fr,de] [--force]
//
// By default skips strings that are unchanged from the previous run (compares
// against the existing locale file's prior English source recorded in `_meta`).
// Pass --force to re-translate every key.
//
// ICU placeholders ({count}, {name}, etc.) and rich-text tags
// (<feedbackLink>...</feedbackLink>) are wrapped in <span translate="no">
// before sending to Google so they survive translation, then unwrapped after.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const messagesDir = path.join(repoRoot, "messages");

// All locales except `en` (source). Keep in sync with src/i18n/config.ts.
const TARGET_LOCALES = [
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
];

// Google's expected codes are mostly the same as BCP-47, with a few
// adjustments for region tags they don't accept verbatim.
const GOOGLE_CODE_OVERRIDES = {
  "zh-CN": "zh-CN",
  "pt-BR": "pt-BR",
};

const MAX_BATCH_SIZE = 100; // Google API limit per request.

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!apiKey) {
    console.error(
      "GOOGLE_TRANSLATE_API_KEY env var is required. Get a key from\n" +
        "https://console.cloud.google.com/apis/credentials and enable the\n" +
        "Cloud Translation API on your project."
    );
    process.exit(1);
  }

  const enPath = path.join(messagesDir, "en.json");
  const en = JSON.parse(fs.readFileSync(enPath, "utf8"));

  const targets = args.locales ?? TARGET_LOCALES;
  for (const locale of targets) {
    if (!TARGET_LOCALES.includes(locale)) {
      console.warn(`[skip] ${locale} is not in the supported locale list`);
      continue;
    }
    await translateLocale({ locale, en, apiKey, force: args.force });
  }
}

async function translateLocale({ locale, en, apiKey, force }) {
  console.log(`\n=== ${locale} ===`);
  const outPath = path.join(messagesDir, `${locale}.json`);
  const existing = fs.existsSync(outPath)
    ? JSON.parse(fs.readFileSync(outPath, "utf8"))
    : {};
  const prevEnSnapshot = existing._meta?.sourceSnapshot ?? {};

  // Flatten en.json + existing into key paths, decide which need translation.
  const flatEn = flatten(en);
  const flatExisting = flatten(existing);
  const toTranslate = [];
  const result = {};
  for (const [key, value] of Object.entries(flatEn)) {
    if (key.startsWith("_meta.")) continue;
    const prevSource = prevEnSnapshot[key];
    const existingValue = flatExisting[key];
    if (!force && existingValue && prevSource === value) {
      // Source unchanged since last run → keep existing translation.
      result[key] = existingValue;
    } else {
      toTranslate.push({ key, value });
    }
  }

  if (toTranslate.length === 0) {
    console.log(`  up to date (${Object.keys(flatEn).length} keys)`);
    return;
  }

  console.log(`  translating ${toTranslate.length} keys…`);
  const targetLang = GOOGLE_CODE_OVERRIDES[locale] ?? locale;

  for (let i = 0; i < toTranslate.length; i += MAX_BATCH_SIZE) {
    const batch = toTranslate.slice(i, i + MAX_BATCH_SIZE);
    const wrapped = batch.map((b) => protectPlaceholders(b.value));
    const translated = await callGoogleTranslate({
      apiKey,
      texts: wrapped,
      target: targetLang,
    });
    for (let j = 0; j < batch.length; j++) {
      result[batch[j].key] = unprotectPlaceholders(translated[j]);
    }
  }

  const merged = unflatten(result);
  merged._meta = {
    sourceLocale: "en",
    targetLocale: locale,
    translatedAt: new Date().toISOString(),
    // Snapshot of the English source for diffing on the next run.
    sourceSnapshot: flatEn,
  };
  fs.writeFileSync(outPath, JSON.stringify(merged, null, 2) + "\n");
  console.log(`  wrote ${outPath}`);
}

async function callGoogleTranslate({ apiKey, texts, target }) {
  const params = new URLSearchParams({
    key: apiKey,
    target,
    source: "en",
    format: "html", // Lets us use <span translate="no"> to protect placeholders.
  });
  for (const text of texts) params.append("q", text);

  const res = await fetch(
    `https://translation.googleapis.com/language/translate/v2?${params.toString()}`,
    { method: "POST" }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Translate API ${res.status}: ${body}`);
  }
  const json = await res.json();
  return json.data.translations.map((t) => decodeHtmlEntities(t.translatedText));
}

// ---- Placeholder protection ----

// Wraps {placeholders} and <tags> in <span translate="no"> so Google leaves
// them alone. ICU placeholders use curlies; rich-text tags (next-intl) use
// angle brackets like <feedbackLink>...</feedbackLink>.
function protectPlaceholders(text) {
  return text
    .replace(/(\{[^}]+\})/g, '<span translate="no">$1</span>')
    .replace(
      /(<\/?[a-zA-Z][a-zA-Z0-9]*>)/g,
      '<span translate="no">$1</span>'
    );
}

function unprotectPlaceholders(text) {
  return text.replace(
    /<span translate="no">([\s\S]*?)<\/span>/g,
    "$1"
  );
}

function decodeHtmlEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}

// ---- JSON flatten / unflatten ----

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      flatten(v, key, out);
    } else if (typeof v === "string") {
      out[key] = v;
    }
  }
  return out;
}

function unflatten(flat) {
  const out = {};
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split(".");
    let cursor = out;
    for (let i = 0; i < parts.length - 1; i++) {
      cursor[parts[i]] = cursor[parts[i]] ?? {};
      cursor = cursor[parts[i]];
    }
    cursor[parts[parts.length - 1]] = value;
  }
  return out;
}

// ---- CLI ----

function parseArgs(argv) {
  const out = { locales: null, force: false };
  for (const arg of argv) {
    if (arg === "--force") out.force = true;
    else if (arg.startsWith("--locales=")) {
      out.locales = arg.slice("--locales=".length).split(",").map((s) => s.trim());
    }
  }
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
