import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const partialsDir = path.join(appRoot, "src", "views", "pages", "partials");
const stylesDir = path.join(appRoot, "public", "styles");

const partial = (name) => readFileSync(path.join(partialsDir, name), "utf8");
const style = (file) => readFileSync(path.join(stylesDir, file), "utf8");

const NORMAL_ROUTES = [
  "home-content.ejs",
  "statistics-content.ejs",
  "my-prayers-content.ejs",
  "community-content.ejs",
  "settings-content.ejs",
  "achievements-content.ejs",
  "help-content.ejs",
  "profile-content.ejs",
  "customer-content.ejs",
];

describe("shared page shell contract", () => {
  for (const view of NORMAL_ROUTES) {
    it(`${view} wraps its content in the shared page shell`, () => {
      assert.match(
        partial(view),
        /class="page-shell(?![-\w])/,
        `${view} must use .page-shell as its outer wrapper`,
      );
    });

    it(`${view} does not narrow the whole route`, () => {
      assert.doesNotMatch(
        partial(view),
        /class="[^"]*\bpage-shell--focus\b/,
        `${view} narrows its entire route instead of capping inner content`,
      );
    });
  }

  it("keeps one canonical outer measure and gutter", () => {
    const shell = style("shell.css");

    assert.match(shell, /\.page-shell\s*{[^}]*max-width:\s*var\(--measure-wide\)/s);
    assert.match(shell, /\.page-shell\s*{[^}]*padding-inline:\s*var\(--padding\)/s);
  });

  it("uses the Community header-to-title gap on every primary route", () => {
    const shell = style("shell.css");
    const battle = style("game/battle.css");
    const today = style("pages/daily-check-in.css");
    const todayHorizon = today.match(/\.today-page \.horizon\s*{([^}]*)}/s)?.[1] || "";

    assert.match(
      shell,
      /\.page-shell\s*{[^}]*padding-block:\s*var\(--section-gap\)/s,
      "the shared page shell owns the Community top gap",
    );
    assert.doesNotMatch(
      battle,
      /(?:\.battle-container|\.battle-page \.page-head)\s*{[^}]*padding-block-start/s,
      "Battle must not replace the shared top gap",
    );
    assert.match(
      todayHorizon,
      /padding-block-start:\s*var\(--section-gap\)/,
      "Today must use the same top gap as Community",
    );
    assert.match(todayHorizon, /justify-content:\s*flex-start/, "Today must align its title from the top gap");
  });

  it("keeps the legacy container wrapper on exactly the shared measure", () => {
    const globals = style("globals.css");
    const containerRule = globals.match(/\.container\s*{[^}]*}/s)?.[0] || "";

    assert.match(containerRule, /max-width:\s*var\(--measure-wide\)/, ".container must read the shared measure token");
    assert.match(containerRule, /padding-inline:\s*var\(--padding\)/, ".container must use the shared gutter");
  });

  it("caps the prayer composer internally rather than narrowing the page", () => {
    assert.match(
      style("pages/prayers.css"),
      /max-width:\s*var\(--measure-reading\)/,
      "the composer keeps its own reading cap",
    );
  });

  it("does not invent page-specific outer widths", () => {
    const pageSheets = [
      "pages/daily-check-in.css",
      "pages/prayers.css",
      "pages/settings.css",
      "pages/statistics.css",
      "pages/community.css",
      "game/help.css",
      "game/profile.css",
      "game/achievements.css",
    ];

    for (const file of pageSheets) {
      const css = style(file)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/@[a-z-]+[^{]*\{/gi, "{");
      const hardCoded = [...css.matchAll(/max-width:\s*(\d{3,4})px/g)].map((match) => match[1]);
      const outerish = hardCoded.filter((value) => Number(value) >= 640);

      assert.deepEqual(
        outerish,
        [],
        `${file} hard-codes an outer width (${outerish.join(", ")}) instead of using a measure token`,
      );
    }
  });

  it("does not wrap a page header in a card or glass surface", () => {
    const help = style("game/help.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const headRules = [...help.matchAll(/\.help-head\s*{([^}]*)}/g)].map((match) => match[1]).join("\n");

    assert.doesNotMatch(headRules, /background:\s*var\(--glass-1\)/, "the help header must not be a glass card");
    assert.doesNotMatch(headRules, /box-shadow:\s*var\(--shadow-panel\)/, "the help header must not be elevated");
    assert.doesNotMatch(headRules, /border-radius/, "the help header must not be a rounded panel");
  });

  it("aligns the achievements and help headings to the shared grid", () => {
    const achievements = style("game/achievements.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const heroRule = achievements.match(/\.achievements-hero\s*{([^}]*)}/s)?.[1] || "";

    assert.doesNotMatch(
      heroRule,
      /padding:\s*var\(--space-5\)/,
      "the achievements page header must not inset itself from the shared grid",
    );
  });
});
