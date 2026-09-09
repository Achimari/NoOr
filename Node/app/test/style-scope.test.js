import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { pageBundles, sharedStyles } from "../src/config/assetSources.js";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const publicDir = path.join(appRoot, "public");
const partialsDir = path.join(appRoot, "src", "views", "pages", "partials");

const VIEW_PAGE = {
  "home-content.ejs": "daily-check-in",
  "catch-up.ejs": "daily-check-in",
  "reading-modal.ejs": "daily-check-in",
  "statistics-content.ejs": "statistics",
  "my-prayers-content.ejs": "my-prayers",
  "community-content.ejs": "community",
  "settings-content.ejs": "settings",
  "profile-content.ejs": "profile",
  "profile-spells.ejs": "profile",
  "profile-today.ejs": "profile",
  "battle-content.ejs": "battle",
  "help-content.ejs": "help",
  "achievements-content.ejs": "achievements",
  "auth-login.ejs": "login",
  "auth-onboarding.ejs": "onboarding",
};

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

function classesIn(files) {
  const found = new Set();
  for (const file of files) {
    const css = stripComments(readFileSync(path.join(publicDir, file), "utf8"));
    for (const match of css.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) found.add(match[1]);
  }
  return found;
}

describe("stylesheet scoping", () => {
  it("never styles a view's class only in a bundle that view does not load", () => {
    const shared = classesIn(sharedStyles);
    const perPage = Object.fromEntries(
      Object.entries(pageBundles)
        .filter(([, bundle]) => bundle.styles?.length)
        .map(([pageId, bundle]) => [pageId, classesIn(bundle.styles)]),
    );

    const stranded = [];
    for (const [view, pageId] of Object.entries(VIEW_PAGE)) {
      const file = path.join(partialsDir, view);
      if (!existsSync(file)) continue;

      const markup = readFileSync(file, "utf8");
      const used = new Set();
      for (const attr of markup.matchAll(/class="([^"]*)"/g)) {
        for (const token of attr[1].split(/[\s<>%=]+/)) if (token) used.add(token);
      }

      const own = perPage[pageId] || new Set();
      for (const cls of used) {
        if (shared.has(cls) || own.has(cls)) continue;
        const elsewhere = Object.keys(perPage).filter((id) => perPage[id].has(cls));
        if (elsewhere.length) stranded.push(`${view} (${pageId}) uses .${cls}, styled only by [${elsewhere}]`);
      }
    }

    assert.deepEqual(stranded, []);
  });

  it("declares both screen-reader-only utilities in the shared layer", () => {
    const shared = classesIn(sharedStyles);

    assert.ok(shared.has("sr-only"));
    assert.ok(shared.has("visually-hidden"));
  });
});
