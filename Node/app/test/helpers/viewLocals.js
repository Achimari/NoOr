import { ICON_NAMES, renderIcon } from "../../src/utils/icons.js";
import { languageNames, supportedLocales, supportedThemes, translate } from "../../src/i18n/index.js";

/**
 * The locals every view can assume, for suites that render a partial directly
 * with `ejs.renderFile` instead of going through the request pipeline.
 *
 * `src/middleware/viewLocals.js` is the production owner of these; this keeps
 * the two in step so a partial that uses a shared helper does not have to be
 * rendered differently in a test than it is in the app. Views render in
 * English, with the system colour scheme, unless a test says otherwise.
 */
export const sharedViewLocals = Object.freeze({
  renderIcon,
  iconNames: ICON_NAMES,
  locale: "en",
  theme: "system",
  currentUrl: "/",
  supportedLocales,
  languageNames,
  supportedThemes,
  i18nVersion: "test",
  t: (key, params) => translate("en", key, params),
});

/**
 * Template source with every plain `<%= t("English") %>` resolved to its English
 * text, for contract suites that assert copy against the .ejs file itself. The
 * English source string is the copy, so the contract is unchanged.
 */
export const sourceCopy = (markup) => markup.replace(/<%=\s*t\("((?:[^"\\]|\\.)*)"\)\s*%>/g, "$1");

/** Spreads the shared locals under any per-test overrides. */
export const withSharedLocals = (locals = {}) => ({ ...sharedViewLocals, ...locals });
