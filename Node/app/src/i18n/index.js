import { createHash } from "node:crypto";
import en from "./locales/en.js";
import ru from "./locales/ru.js";

/*
 * Adding a language: create locales/<code>.js with the same shape as ru.js,
 * register it here and give it an endonym. Anything the new dictionary does not
 * carry falls back to English, and English falls back to the source text the
 * template was written with, so a missing entry degrades to readable English
 * rather than to a key. `test/i18n-catalog.test.js` lists what is missing.
 */
const dictionaries = { en, ru };

export const defaultLocale = "en";
export const supportedLocales = Object.keys(dictionaries);

/* Each language is offered in its own name, which is why these are not
   translated: a reader looking for Русский does not read English. */
export const languageNames = { en: "English", ru: "Русский" };

export const supportedThemes = ["system", "light", "dark"];

function getByPath(source, path) {
  return path.split(".").reduce((acc, key) => {
    if (acc && Object.prototype.hasOwnProperty.call(acc, key)) {
      return acc[key];
    }
    return undefined;
  }, source);
}

/*
 * Two kinds of key share one lookup. A dotted path ("auth.login.title") names
 * structured content such as the navigation; anything else is the English
 * source string itself, looked up in the dictionary's `messages` catalogue,
 * gettext-style. A catalogue entry may be a plural object keyed by the CLDR
 * categories (one, few, many, other), chosen with Intl.PluralRules from
 * `params.count`.
 */
function lookup(dict, key) {
  return getByPath(dict, key) ?? dict.messages?.[key];
}

function format(locale, value, params) {
  let text = value;
  if (text && typeof text === "object" && "other" in text && typeof params?.count === "number") {
    text = text[new Intl.PluralRules(locale).select(params.count)] ?? text.other;
  }
  if (typeof text !== "string" || !params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

/*
 * The browser half of the catalogue. Page scripts also show labels that arrive
 * in API responses (battle statuses, a trial's announced move), so they get the
 * whole message catalogue rather than a hand-kept subset that would drift. It is
 * served as a script whose URL carries a hash of its content, so it is cached
 * until a translation actually changes.
 */
export const clientCatalogs = Object.fromEntries(
  supportedLocales.map((locale) => {
    const messages = { ...en.messages, ...dictionaries[locale].messages };
    const body = `window.appI18nMessages=${JSON.stringify(messages).replace(/</g, "\\u003c")};\n`;
    return [locale, { body, version: createHash("sha256").update(body).digest("hex").slice(0, 12) }];
  }),
);

export function translate(locale, key, params) {
  const value = lookup(dictionaries[locale] ?? en, key) ?? lookup(en, key) ?? key;
  return format(locale, value, params);
}

/** A saved choice wins, then the browser's language list, then English. */
export function resolveLocale(req) {
  if (supportedLocales.includes(req.cookies?.locale)) return req.cookies.locale;
  return req.acceptsLanguages?.(supportedLocales) || defaultLocale;
}

/** "system" leaves the scheme to prefers-color-scheme. */
export function resolveTheme(req) {
  return supportedThemes.includes(req.cookies?.theme) ? req.cookies.theme : "system";
}

/* Only ever a path on this site: "//host" and absolute URLs resolve to another
   origin and are refused, so a redirect built from this cannot leave the app. */
export function localPath(value, fallback = "/") {
  if (typeof value !== "string" || !value) return fallback;
  try {
    const url = new URL(value, "http://local");
    if (url.origin === "http://local") return url.pathname + url.search;
  } catch {
    // fall through
  }
  return fallback;
}

export function createViewLocals(req) {
  const locale = resolveLocale(req);
  const dict = dictionaries[locale];
  const t = (key, params) => translate(locale, key, params);

  return {
    currentPath: req.path,
    /* Where the preferences form sends the reader back to. A page rendered by
       a POST (a form with errors) has no GET address of its own, so it returns
       to the page the form was submitted from. */
    currentUrl:
      req.method === "GET"
        ? req.originalUrl
        : localPath(req.get?.("referer")?.replace(/^https?:\/\/[^/]+/, "")),
    locale,
    theme: resolveTheme(req),
    dateLocale: dict.localeTag || locale,
    supportedLocales,
    languageNames,
    supportedThemes,
    i18nVersion: clientCatalogs[locale].version,
    t,
  };
}
