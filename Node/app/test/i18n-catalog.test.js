import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import en from "../src/i18n/locales/en.js";
import ru from "../src/i18n/locales/ru.js";
import { localPath, resolveLocale, resolveTheme, translate } from "../src/i18n/index.js";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFileSync(path.join(appRoot, relative), "utf8");

function filesUnder(relative, extension) {
  return readdirSync(path.join(appRoot, relative), { recursive: true })
    .filter((file) => file.endsWith(extension))
    .map((file) => path.join(relative, file));
}

const unescape = (raw) => JSON.parse(`"${raw}"`);
const matches = (source, pattern) => [...source.matchAll(pattern)].map((match) => unescape(match[1]));

const getByPath = (source, key) => key.split(".").reduce((node, part) => (node && Object.hasOwn(node, part) ? node[part] : undefined), source);
const hasRussian = (key) => getByPath(ru, key) !== undefined || Object.hasOwn(ru.messages, key);

/** Every string the product can show that goes through the catalogue by its literal text. */
function catalogueKeys() {
  const keys = new Map();
  const add = (key, file) => {
    if (!keys.has(key)) keys.set(key, file);
  };

  const literalT = /\bt\(\s*"((?:[^"\\]|\\.)*)"/g;
  for (const file of [...filesUnder("src/views", ".ejs"), ...filesUnder("public/scripts", ".js"), ...filesUnder("src", ".js")]) {
    if (file.startsWith(path.join("src", "i18n"))) continue;
    for (const key of matches(read(file), literalT)) add(key, file);
  }

  // Messages that reach the reader through req.t / errorHandler rather than a literal t().
  for (const file of filesUnder("src", ".js")) {
    const source = read(file);
    for (const key of matches(source, /new AppError\(\s*"((?:[^"\\]|\\.)*)"/g)) add(key, file);
    for (const key of matches(source, /messageKey:\s*"((?:[^"\\]|\\.)*)"/g)) add(key, file);
  }
  for (const file of filesUnder("src/validators", ".js")) {
    for (const key of matches(read(file), /"([A-Z][a-z][^"]* [^"]*)"/g)) add(key, file);
  }
  for (const key of matches(read("src/config/security.js"), /"([A-Z][^"]+\.)"/g)) add(key, "src/config/security.js");
  for (const key of matches(read("src/domain/loadout.js"), /reason:\s*[`"]([^`"$]+)[`"]/g)) add(key, "src/domain/loadout.js");

  // Domain content the views and scripts pass through t() by value.
  const displayFields = /(?:label|name|description|summary|tactic|nextStep|blurb|counter|effectSummary):\s*"((?:[^"\\]|\\.)*)"/g;
  for (const file of [
    "src/domain/achievements.js",
    "src/domain/spells.js",
    "src/domain/constants.js",
    "src/domain/statuses.js",
    "src/domain/bossPhases.js",
    "src/domain/bosses.js",
    "src/services/profileService.js",
  ]) {
    for (const key of matches(read(file), displayFields)) add(key, file);
  }
  for (const { name } of JSON.parse(read("src/data/bibleBooks.json")).books) add(name, "src/data/bibleBooks.json");

  return keys;
}

const placeholders = (text) => new Set([...String(text).matchAll(/\{(\w+)\}/g)].map((match) => match[1]));
const forms = (value) => (value && typeof value === "object" ? Object.values(value) : [value]);

describe("the Russian catalogue covers the product", () => {
  it("translates every string the interface, the server and the domain can show", () => {
    const missing = [...catalogueKeys()].filter(([key]) => !hasRussian(key)).map(([key, file]) => `${file}: ${key}`);

    assert.deepEqual(missing, [], "add these to src/i18n/locales/ru.js");
  });

  it("never invents a placeholder the English source does not fill", () => {
    const invented = [];
    for (const [key, value] of Object.entries(ru.messages)) {
      const allowed = new Set([...placeholders(key), ...forms(en.messages[key]).flatMap((form) => [...placeholders(form)])]);
      for (const form of forms(value)) {
        for (const name of placeholders(form)) {
          if (!allowed.has(name)) invented.push(`${key} → {${name}}`);
        }
      }
    }

    assert.deepEqual(invented, []);
  });

  it("gives every plural the categories its language has", () => {
    for (const [key, value] of Object.entries(ru.messages)) {
      if (typeof value !== "object") continue;
      assert.deepEqual(Object.keys(value).sort(), ["few", "many", "one", "other"], `ru plural ${key}`);
    }
    for (const [key, value] of Object.entries(en.messages)) {
      assert.deepEqual(Object.keys(value).sort(), ["one", "other"], `en plural ${key}`);
    }
  });

  it("keeps the structured sections in the same shape as English", () => {
    const shape = (node) => (Array.isArray(node)
      ? node.map(shape)
      : node && typeof node === "object"
        ? Object.fromEntries(Object.entries(node).filter(([key]) => key !== "messages").map(([key, value]) => [key, shape(value)]))
        : typeof node);

    assert.deepEqual(shape(ru), shape(en));
    assert.deepEqual(ru.header.nav.map((link) => link.to), en.header.nav.map((link) => link.to), "the same destinations, in the same order");
  });

  it("documents the same Help sections and screenshots in both languages", () => {
    const english = read("src/views/pages/partials/help-content.ejs");
    const russian = read("src/views/pages/partials/help-content.ru.ejs");
    const ids = (markup) => matches(markup, /<section class="help-section" id="([^"]+)"/g);
    const images = (markup) => matches(markup, /src="(\/images\/help\/[^"]+)"/g);

    assert.deepEqual(ids(russian), ids(english));
    assert.deepEqual(images(russian), images(english));
  });

  it("includes every localised Help document by a path EJS can actually find", () => {
    // EJS appends ".ejs" only when a name has no extension of its own, and it
    // reads "help-content.ru" as having one — which is how Russian Help once 500'd.
    for (const name of matches(read("src/views/pages/help.ejs"), /"(\.\/partials\/help-content[^"]*)"/g)) {
      const file = path.extname(name) ? name : `${name}.ejs`;
      assert.ok(existsSync(path.join(appRoot, "src/views/pages", file)), `help.ejs includes ${name}, which EJS resolves to a missing ${file}`);
    }
  });

  it("offers the same encouragement verses in both languages", () => {
    const ids = (file) => JSON.parse(read(file)).map((phrase) => phrase.id);

    assert.deepEqual(ids("src/data/motivationPhrases.ru.json"), ids("src/data/motivationPhrases.json"));
  });
});

describe("translation behaviour", () => {
  it("falls back from Russian to English to the source text", () => {
    assert.equal(translate("ru", "Settings"), "Настройки");
    assert.equal(translate("ru", "auth.login.title"), "Вход");
    assert.equal(translate("ru", "A sentence nobody translated"), "A sentence nobody translated");
    assert.equal(translate("xx", "Settings"), "Settings", "an unknown locale reads as English");
  });

  it("interpolates values and chooses the CLDR plural form", () => {
    assert.equal(translate("en", "{count} days", { count: 1 }), "1 day");
    assert.equal(translate("en", "{count} days", { count: 5 }), "5 days");
    assert.equal(translate("ru", "{count} days", { count: 1 }), "1 день");
    assert.equal(translate("ru", "{count} days", { count: 3 }), "3 дня");
    assert.equal(translate("ru", "{count} days", { count: 11 }), "11 дней");
    assert.equal(translate("ru", "{count} days", { count: 21 }), "21 день");
    assert.equal(translate("ru", "Best · {name}", { name: "Анна" }), "Лучший результат · Анна");
  });

  it("resolves the language from the saved choice, then the browser, then English", () => {
    const request = (cookies, accepted) => ({ cookies, acceptsLanguages: () => accepted });

    assert.equal(resolveLocale(request({ locale: "ru" }, "en")), "ru");
    assert.equal(resolveLocale(request({ locale: "de" }, "ru")), "ru");
    assert.equal(resolveLocale(request({}, false)), "en");
    assert.equal(resolveTheme({ cookies: { theme: "dark" } }), "dark");
    assert.equal(resolveTheme({ cookies: { theme: "sepia" } }), "system");
  });

  it("only ever returns the reader to a path on this site", () => {
    assert.equal(localPath("/statistics?streak=bible"), "/statistics?streak=bible");
    assert.equal(localPath("//evil.example/phish"), "/");
    assert.equal(localPath("https://evil.example/"), "/");
    assert.equal(localPath(undefined), "/");
  });
});
