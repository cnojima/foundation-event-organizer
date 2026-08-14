#!/usr/bin/env node
// Translate messages/en.json into the other supported locales using Google
// Cloud Translation v3.
//
// Usage:
//   node scripts/translate-messages.mjs [--locales=fr,de] [--force]
//
// Reads GOOGLE_TRANSLATE_API_KEY from .env.local (Next.js-style) or the
// process env. Process env wins so CI can override.
//
// By default skips strings that are unchanged from the previous run (compares
// against messages/.translation-cache/<locale>.json). Pass --force to
// re-translate every key.
//
// ICU placeholders ({count}, {name}, etc.), plural/select argument syntax
// ({count, plural, one {...} other {...}}), and rich-text tags
// (<feedbackLink>...</feedbackLink>) are wrapped in <span translate="no">
// before sending to Google so they survive translation, then unwrapped
// after. Every translated result is also parsed with the same ICU
// MessageFormat engine next-intl uses at runtime; anything that fails to
// parse is dropped so the deep-merge in src/i18n/request.ts falls back to
// the English string instead of shipping a message that throws at render.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IntlMessageFormat } from "intl-messageformat";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const messagesDir = path.join(repoRoot, "messages");

loadDotEnvLocal();

// Minimal .env.local loader — no dep on dotenv. Parses KEY=VALUE lines,
// strips surrounding quotes, ignores comments/blank lines. Doesn't overwrite
// existing process.env entries (explicit shell exports win).
function loadDotEnvLocal() {
  const envPath = path.join(repoRoot, ".env.local");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key || key in process.env) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
// Source-text snapshots used to skip re-translating unchanged keys. Lives
// outside messages/*.json because next-intl validates the loaded JSON tree
// and rejects keys with "." (which our flattened snapshot keys contain).
const cacheDir = path.join(messagesDir, ".translation-cache");

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
  "nb"
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
  const cachePath = path.join(cacheDir, `${locale}.json`);
  const existing = fs.existsSync(outPath)
    ? JSON.parse(fs.readFileSync(outPath, "utf8"))
    : {};

  // Strip any legacy _meta block from earlier script versions — next-intl
  // validates the loaded JSON tree and rejects keys containing ".", which
  // our flattened snapshot uses. Never re-emit it.
  if (existing._meta) delete existing._meta;

  const cache = fs.existsSync(cachePath)
    ? JSON.parse(fs.readFileSync(cachePath, "utf8"))
    : {};
  const prevEnSnapshot = cache.sourceSnapshot ?? {};

  // Flatten en.json + existing into key paths, decide which need translation.
  const flatEn = flatten(en);
  const flatExisting = flatten(existing);
  const toTranslate = [];
  const result = {};
  for (const [key, value] of Object.entries(flatEn)) {
    const prevSource = prevEnSnapshot[key];
    const existingValue = flatExisting[key];
    // Re-translate if the source changed OR the existing translation has
    // structurally broken tags (Google occasionally drops closing tags when
    // restructuring sentences for non-English grammar) OR invalid ICU
    // syntax (catches translations written before the protectPlaceholders
    // nested-plural fix, or corruption from any other source).
    const stale =
      !existingValue ||
      prevSource !== value ||
      !hasMatchingTags(value, existingValue) ||
      !isValidIcuMessage(existingValue, locale);
    if (!force && !stale) {
      result[key] = existingValue;
    } else {
      toTranslate.push({ key, value });
    }
  }

  if (toTranslate.length === 0) {
    console.log(`  up to date (${Object.keys(flatEn).length} keys)`);
    // Still rewrite to scrub any lingering _meta block.
    if (Object.keys(result).length > 0) {
      fs.writeFileSync(outPath, JSON.stringify(unflatten(result), null, 2) + "\n");
    }
    return;
  }

  console.log(`  translating ${toTranslate.length} keys…`);
  const targetLang = GOOGLE_CODE_OVERRIDES[locale] ?? locale;

  // Google's NMT occasionally duplicates or drops a fragment when a string
  // is short, code-like, and built almost entirely of protected spans (a
  // terse backtick-wrapped command example with one placeholder is a worse
  // case for it than an ordinary sentence) — verified non-deterministic
  // across repeated calls with the exact same input. A couple of retries
  // clears most of these; anything still broken after that falls back to
  // English rather than looping forever on a string that may just never
  // translate cleanly.
  const MAX_ATTEMPTS = 3;
  let pending = toTranslate;
  let droppedForBrokenTags = 0;
  let droppedForInvalidIcu = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS && pending.length > 0; attempt++) {
    const stillFailing = [];
    for (let i = 0; i < pending.length; i += MAX_BATCH_SIZE) {
      if (i > 0 || attempt > 1) await new Promise((r) => setTimeout(r, 1000));
      const batch = pending.slice(i, i + MAX_BATCH_SIZE);
      const wrapped = batch.map((b) => protectPlaceholders(b.value));
      const translated = await callGoogleTranslate({
        apiKey,
        texts: wrapped,
        target: targetLang,
      });
      for (let j = 0; j < batch.length; j++) {
        const out = unprotectPlaceholders(translated[j]);
        const isLastAttempt = attempt === MAX_ATTEMPTS;
        // Validate the result has the same tag set as the source — Google
        // sometimes drops or duplicates protected spans when restructuring
        // for the target language. Don't persist broken values: omit the
        // key so the deep-merge fallback in src/i18n/request.ts uses the
        // English source instead.
        if (!hasMatchingTags(batch[j].value, out)) {
          if (isLastAttempt) {
            droppedForBrokenTags++;
            console.warn(`  ! ${batch[j].key}: tag mismatch — falling back to English`);
          } else {
            stillFailing.push(batch[j]);
          }
          continue;
        }
        // Belt-and-suspenders: actually parse the result as ICU MessageFormat
        // the same way next-intl will at runtime. Catches any remaining edge
        // case protectPlaceholders doesn't anticipate, rather than shipping a
        // string that throws INVALID_MESSAGE when a page renders.
        if (!isValidIcuMessage(out, targetLang)) {
          if (isLastAttempt) {
            droppedForInvalidIcu++;
            console.warn(`  ! ${batch[j].key}: invalid ICU syntax — falling back to English`);
          } else {
            stillFailing.push(batch[j]);
          }
          continue;
        }
        result[batch[j].key] = out;
      }
    }
    if (stillFailing.length > 0 && attempt < MAX_ATTEMPTS) {
      console.log(`  retrying ${stillFailing.length} key(s) (attempt ${attempt + 1})…`);
    }
    pending = stillFailing;
  }
  if (droppedForBrokenTags > 0) {
    console.warn(
      `  dropped ${droppedForBrokenTags} translation(s) with broken tags (fallback to English)`
    );
  }
  if (droppedForInvalidIcu > 0) {
    console.warn(
      `  dropped ${droppedForInvalidIcu} translation(s) with invalid ICU syntax (fallback to English)`
    );
  }

  const merged = unflatten(result);
  fs.writeFileSync(outPath, JSON.stringify(merged, null, 2) + "\n");
  console.log(`  wrote ${outPath}`);

  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(
    cachePath,
    JSON.stringify(
      {
        sourceLocale: "en",
        targetLocale: locale,
        translatedAt: new Date().toISOString(),
        sourceSnapshot: flatEn,
      },
      null,
      2
    ) + "\n"
  );
}

async function callGoogleTranslate({ apiKey, texts, target }) {
  // POST with a JSON body — putting `q` params in the URL query string
  // works for small batches but blows past Google's URL length limit on
  // larger ones (returns 411 Length Required when the encoded URL gets too
  // long). The API key still lives in the query string per Google's
  // recommendation.
  const res = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: texts,
        target,
        source: "en",
        // Lets us use <span translate="no"> to protect placeholders.
        format: "html",
      }),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Translate API ${res.status}: ${body}`);
  }
  const json = await res.json();
  return json.data.translations.map((t) => decodeHtmlEntities(t.translatedText));
}

// ---- Placeholder protection ----

// Wraps {placeholders}, <tags>, and ICU quoted-literals ('...') in
// <span translate="no"> so Google leaves them alone. ICU placeholders use
// curlies; rich-text tags (next-intl) use angle brackets like
// <feedbackLink>...</feedbackLink>; ICU quoting ('<name>') escapes text
// that would otherwise look like tag/argument syntax.
//
// Plural/select arguments need special handling: `{count, plural, one {# a}
// other {# b}}` has *nested* curly braces, so a naive `\{[^}]+\}` match
// swallows only up to the first inner `}` (i.e. "{count, plural, one {# a}"),
// leaving " other {# b}" as bare exposed text. Google then translates the
// literal ICU keyword "other" into the target language, which next-intl
// can't parse (INVALID_MESSAGE / MISSING_OTHER_CLAUSE) — the whole message
// throws at render time instead of just failing to translate cleanly.
//
// This is a single character-by-character pass that recognizes all three
// protectable constructs and never re-scans text it has already wrapped —
// deliberately *not* two passes (e.g. "protect tags globally, then protect
// ICU syntax"), because a later pass matching bare `<tag>`/`'...'` patterns
// would also match — and re-wrap — the `<span>`/`'` characters an earlier
// pass just inserted, or wrap a tag a second time inside a quote span that
// already contains it. Both produced real corruption in testing (stray
// empty spans, and Google outright duplicating a sentence when it received
// doubly-nested spans).
function protectPlaceholders(text) {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "'") {
      const end = findIcuQuoteEnd(text, i);
      out += `<span translate="no">${text.slice(i, end)}</span>`;
      i = end;
      continue;
    }
    if (ch === "<") {
      const tagMatch = /^<\/?[a-zA-Z][a-zA-Z0-9]*>/.exec(text.slice(i));
      if (tagMatch) {
        out += `<span translate="no">${tagMatch[0]}</span>`;
        i += tagMatch[0].length;
        continue;
      }
    }
    if (ch === "{") {
      const end = findMatchingBrace(text, i);
      if (end === -1) {
        // Unbalanced braces — protect the remainder verbatim rather than
        // risk mangling it further.
        out += `<span translate="no">${text.slice(i)}</span>`;
        break;
      }
      const inner = text.slice(i + 1, end);
      const icuMatch = inner.match(
        /^(\s*[\w#]+\s*,\s*)(plural|select|selectordinal)(\s*,\s*)([\s\S]*)$/
      );
      if (icuMatch) {
        const [, argPart, keyword, sepPart] = icuMatch;
        const clausesPart = icuMatch[4];
        out += `<span translate="no">{${argPart}${keyword}${sepPart}</span>`;
        out += protectIcuClauses(clausesPart);
        out += `<span translate="no">}</span>`;
      } else {
        out += `<span translate="no">{${inner}}</span>`;
      }
      i = end + 1;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

// Walks a sequence of "label {sub-message}" clauses — the part of a
// plural/select argument after its keyword — protecting each label and its
// braces while recursing into the sub-message so its text stays
// translatable (and any placeholders/nested plurals inside it stay
// protected too).
function protectIcuClauses(text) {
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (/\s/.test(text[i])) {
      out += text[i];
      i++;
      continue;
    }
    const labelMatch = /^[=\w]+/.exec(text.slice(i));
    if (!labelMatch) {
      out += `<span translate="no">${text.slice(i)}</span>`;
      break;
    }
    const labelEnd = i + labelMatch[0].length;
    let braceStart = labelEnd;
    while (braceStart < text.length && /\s/.test(text[braceStart])) braceStart++;
    if (text[braceStart] !== "{") {
      out += `<span translate="no">${text.slice(i)}</span>`;
      break;
    }
    const braceEnd = findMatchingBrace(text, braceStart);
    if (braceEnd === -1) {
      out += `<span translate="no">${text.slice(i)}</span>`;
      break;
    }
    const submessage = text.slice(braceStart + 1, braceEnd);
    out += `<span translate="no">${text.slice(i, braceStart)}{</span>`;
    out += protectPlaceholders(submessage);
    out += `<span translate="no">}</span>`;
    i = braceEnd + 1;
  }
  return out;
}

// Finds the index of the `}` that closes the `{` at openIndex, accounting
// for nested braces in between. Returns -1 if unbalanced.
function findMatchingBrace(text, openIndex) {
  let depth = 0;
  for (let k = openIndex; k < text.length; k++) {
    if (text[k] === "{") depth++;
    else if (text[k] === "}") {
      depth--;
      if (depth === 0) return k;
    }
  }
  return -1;
}

// Finds the index just past the `'` that closes the ICU quoted-literal span
// starting at openIndex. Per ICU MessageFormat rules, `''` inside a quoted
// span is an escaped literal apostrophe and does not end the span. Returns
// text.length (protect to the end) if unterminated.
function findIcuQuoteEnd(text, openIndex) {
  let k = openIndex + 1;
  while (k < text.length) {
    if (text[k] === "'") {
      if (text[k + 1] === "'") {
        k += 2;
        continue;
      }
      return k + 1;
    }
    k++;
  }
  return text.length;
}

function unprotectPlaceholders(text) {
  // Google occasionally rewraps tokens or leaves empty wrapper spans behind.
  // Run the substitution twice and then strip any remaining empty wrappers
  // defensively — the regex is the same shape for filled and empty spans.
  let out = text;
  for (let i = 0; i < 2; i++) {
    out = out.replace(/<span translate="no">([\s\S]*?)<\/span>/g, "$1");
  }
  return out;
}

// Counts each tag name (opening vs closing tracked separately) so we can
// detect when Google's translation dropped a tag.
function countTags(text) {
  const counts = {};
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)>/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const isClosing = m[0].startsWith("</");
    const key = (isClosing ? "/" : "") + m[1];
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

// Returns true when the translated string has exactly the same set of
// rich-text tags as the source. Tag *order* may differ (right-to-left
// languages legitimately reorder), but every opening/closing tag in the
// source must appear in the translation the same number of times.
function hasMatchingTags(source, translation) {
  const a = countTags(source);
  const b = countTags(translation);
  for (const k of Object.keys(a)) if (a[k] !== (b[k] || 0)) return false;
  for (const k of Object.keys(b)) if (a[k] === undefined) return false;
  return true;
}

// Parses `text` with the same ICU MessageFormat engine next-intl uses at
// runtime. Strings with no `{...}` at all always pass trivially; this only
// meaningfully gates plural/select/argument syntax.
function isValidIcuMessage(text, locale) {
  try {
    new IntlMessageFormat(text, locale);
    return true;
  } catch {
    return false;
  }
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
