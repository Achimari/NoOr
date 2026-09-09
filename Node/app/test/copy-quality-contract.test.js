import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFileSync(path.join(appRoot, relative), "utf8");

describe("copy quality contract", () => {
  it("renders semantic page and section titles in uppercase", () => {
    const globals = read("public/styles/globals.css");

    assert.match(globals, /:where\(h1,\s*h2,\s*h3\)\s*{[^}]*text-transform:\s*uppercase/s);
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
