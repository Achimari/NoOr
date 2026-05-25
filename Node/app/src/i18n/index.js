import en from "./locales/en.js";
import ru from "./locales/ru.js";

export const supportedLocales = ["ru", "en"];

const dictionaries = { ru, en };

function resolveLocale(req) {
  const queryLocale = req.query.lang;
  if (supportedLocales.includes(queryLocale)) return queryLocale;

  const cookieLocale = req.cookies?.locale;
  if (supportedLocales.includes(cookieLocale)) return cookieLocale;

  const accepted = req.acceptsLanguages(supportedLocales);
  return accepted || "ru";
}

function getByPath(source, path) {
  return path.split(".").reduce((acc, key) => {
    if (acc && Object.prototype.hasOwnProperty.call(acc, key)) {
      return acc[key];
    }
    return undefined;
  }, source);
}

export function createViewLocals(req) {
  const locale = resolveLocale(req);
  const dict = dictionaries[locale] || dictionaries.ru;

  const t = (path, fallback = "") => {
    const resolved = getByPath(dict, path);
    return resolved ?? fallback;
  };

  return {
    currentPath: req.path,
    locale,
    supportedLocales,
    languages: t("header.languages", {}),
    t,
  };
}
