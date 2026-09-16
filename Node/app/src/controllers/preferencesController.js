import { isProduction } from "../config/env.js";
import { clientCatalogs, localPath, supportedLocales, supportedThemes } from "../i18n/index.js";

const PREFERENCE_COOKIE = {
  httpOnly: true,
  sameSite: "lax",
  secure: isProduction,
  maxAge: 1000 * 60 * 60 * 24 * 365,
};

/* Language and colour scheme work signed in or out, so they live in cookies
   rather than on the account. Each submit button carries one of the two. */
export function savePreferences(req, res) {
  const { locale, theme, returnTo } = req.body;
  if (supportedLocales.includes(locale)) res.cookie("locale", locale, PREFERENCE_COOKIE);
  if (supportedThemes.includes(theme)) res.cookie("theme", theme, PREFERENCE_COOKIE);
  return res.redirect(303, localPath(returnTo));
}

/* GET /i18n/<locale>.js — the message catalogue for the page scripts. A request
   carrying the current content hash may be cached forever; anything else is
   revalidated, so a deploy that changes a translation is never served stale. */
export function serveClientCatalog(req, res, next) {
  const catalog = clientCatalogs[req.params.file.replace(/\.js$/, "")];
  if (!catalog) return next();

  res.type("application/javascript");
  res.set("Cache-Control", req.query.v === catalog.version ? "public, max-age=31536000, immutable" : "no-cache");
  return res.send(catalog.body);
}
