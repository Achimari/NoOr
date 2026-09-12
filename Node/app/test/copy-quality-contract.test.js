import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFileSync(path.join(appRoot, relative), "utf8");

describe("copy quality contract", () => {
  it("writes every title in sentence case in the markup that ships", () => {
    // Sacred Press sets display titles in capitals as a *typographic
    // treatment*. The copy itself stays sentence case, which is what a screen
    // reader announces, what a translator receives, and what survives if the
    // stylesheet never loads. `text-transform` is presentation; the DOM text is
    // the content, and only the content is asserted here.
    //
    // This supersedes the handwritten-face rule that banned the treatment
    // outright (CONSTRAINTS.md, 2026-09-11): Unbounded is a geometric display
    // face whose capitals are drawn to be set as capitals.
    const globals = read("public/styles/globals.css");

    assert.doesNotMatch(
      globals,
      /:where\([^)]*h2[^)]*\)\s*\{[^}]*text-transform:\s*uppercase/s,
      "the global sheet must not case every heading",
    );

    const titles = [
      ["src/views/pages/partials/home-content.ejs", /class="page-head-title today-title">([^<]+)</],
      ["src/views/pages/partials/my-prayers-content.ejs", /class="page-head-title">([^<]+)</],
      ["src/views/pages/partials/statistics-content.ejs", /class="page-head-title">([^<]+)</],
    ];

    for (const [view, pattern] of titles) {
      const [, text] = read(view).match(pattern) || [];
      assert.ok(text, `${view} must still render a page title`);
      assert.notEqual(text, text.toUpperCase(), `${view} writes "${text}" in capitals in the markup`);
      assert.match(text.trim(), /^[A-Z][a-z]/, `${view} must open its title with one capital`);
    }
  });

  it("tracks every uppercase treatment, and confines it to display and data", () => {
    // A capital run set at default spacing collides. Every rule that cases text
    // must also track it, and the treatment belongs to page openings, mono
    // marks and short controls — never to prose.
    const sheets = ["public/styles/shell.css", "public/styles/pages/daily-check-in.css"];

    for (const sheet of sheets) {
      const css = read(sheet).replace(/\/\*[\s\S]*?\*\//g, "");
      for (const [block] of css.matchAll(/[^{}]*\{[^}]*\}/g)) {
        if (!/text-transform:\s*uppercase/.test(block)) continue;
        const selector = block.slice(0, block.indexOf("{")).trim().replace(/\s+/g, " ");
        assert.match(
          block,
          /letter-spacing:/,
          `${sheet} — ${selector} sets capitals without tracking them`,
        );
        // Prose is set in the body role; a count or a date is set in the data
        // role. The treatment belongs to the second and never to the first, so
        // the rule is drawn on the face rather than on a selector name —
        // `.section-head-note` is a count, `.settings-group-note` is a sentence.
        assert.doesNotMatch(
          selector,
          /lede|prose|subtitle|message|copy|paragraph|description|hint/i,
          `${sheet} — ${selector} cases running text`,
        );
        assert.doesNotMatch(
          block,
          /font-family:\s*var\(--font-(?:body|reading)\)/,
          `${sheet} — ${selector} cases text set in the body face`,
        );
      }
    }
  });

  it("keeps the Today heading reading as Today", () => {
    const home = read("src/views/pages/partials/home-content.ejs");

    assert.match(home, /class="page-head-title today-title">Today</);
    assert.doesNotMatch(home, />TODAY</);
    // The approved uppercase: short, large, expressive decision labels.
    assert.match(home, /class="dashboard-action-label">YES</);
    assert.match(home, /class="dashboard-action-label">NO</);
  });

  it("uses concrete language for Progress data", () => {
    const progress = read("src/views/pages/partials/statistics-content.ejs");

    assert.match(progress, />Answer patterns</);
    assert.match(progress, />Community time zones</);
    assert.doesNotMatch(progress, /How answers land|Where people are/);
    assert.match(progress, /does not track anyone's location/);
  });

  it("makes privacy and account behavior explicit", () => {
    const prayers = read("src/views/pages/partials/my-prayers-content.ejs");
    const settings = read("src/views/pages/partials/settings-content.ejs");
    const profile = read("src/views/pages/partials/profile-content.ejs");

    assert.match(prayers, /Share only what you are comfortable making public/);
    assert.match(settings, /does not sign out your other sessions/);
    assert.doesNotMatch(settings, /signs you out of nothing else/);
    assert.match(profile, /Sharing is off by default/);
  });

  it("describes the current profile identity button in Help", () => {
    const help = read("src/views/pages/partials/help-content.ejs");

    assert.doesNotMatch(help, /three-dot button/);
    assert.match(help, /profile identity button/);
  });

  it("adds useful guidance to the authentication screens", () => {
    const dictionary = read("src/i18n/locales/en.js");

    assert.match(dictionary, /subtitle:\s*"Return to your daily practice\."/);
    assert.match(dictionary, /subtitle:\s*"Create your account and begin your daily record\."/);
  });
});
