import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFileSync(path.join(appRoot, relative), "utf8");

describe("copy quality contract", () => {
  it("writes page and section titles in sentence case", () => {
    // Achimari Hand is a handwritten face: all-caps strips the ascender and
    // descender shapes a reader uses to recognise a word. Uppercase survives
    // only where the markup writes it, on the short Yes/No decision labels.
    const globals = read("public/styles/globals.css");
    const shell = read("public/styles/shell.css");
    const today = read("public/styles/pages/daily-check-in.css");

    assert.doesNotMatch(
      globals,
      /:where\([^)]*h2[^)]*\)\s*\{[^}]*text-transform:\s*uppercase/s,
      "the global sheet must not case every heading",
    );

    for (const sheet of [shell, today]) {
      assert.doesNotMatch(sheet, /text-transform:\s*uppercase/, "titles read in sentence case");
    }

    assert.match(today, /\.today-title\s*\{[^}]*text-transform:\s*none/s);
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
