import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFileSync(path.join(appRoot, relative), "utf8");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const profileCss = () => stripComments(read("public/styles/game/profile.css"));
const achievementsCss = () => stripComments(read("public/styles/game/achievements.css"));
const profileView = () => read("src/views/pages/partials/profile-content.ejs");
const sealView = () => read("src/views/components/game/achievement-seal.ejs");

const rule = (selector, css) =>
  (css.match(new RegExp(`(?:^|\\n|,)\\s*${selector}\\s*\\{([^}]*)\\}`)) || [])[1] || "";

/**
 * Profile is the character sheet and Achievements is its record of milestones.
 * They stay separate routes. Sacred Press changes how both are drawn — a
 * personal emblem, headline figures, struck seals — and changes nothing about
 * allocation, derived values, spell and loadout controls, privacy, the Today
 * summary, or which achievements the server says are unlocked.
 */
describe("Profile reads as a character sheet", () => {
  it("opens on the reader's emblem without a decorative portrait", () => {
    const html = profileView();
    assert.match(html, /<span class="profile-emblem" data-emblem="<%= profile\.emblemKey %>"[^>]*aria-hidden="true"/);
    assert.doesNotMatch(html, /profile-portrait|<picture|\/images\/plates\/bust/);
  });

  it("keeps the reader's own emblem beside the profile name", () => {
    const html = profileView();
    assert.ok(html.indexOf("profile-emblem") < html.indexOf("profile-head-text"));
    assert.match(html, /<h1 class="profile-name"><%= profile\.name %><\/h1>/, "the name is still the heading");
  });

  it("sets the character's name and its four stats as headline figures", () => {
    assert.match(rule("\\.profile-name", profileCss()), /font-family:\s*var\(--font-display\)/);
    assert.match(rule("\\.profile-stat-value", profileCss()), /font-family:\s*var\(--font-display\)/);
    assert.match(rule("\\.profile-stat-value", profileCss()), /font-variant-numeric:\s*tabular-nums/);
  });

  it("keeps allocation, its limits and its locked state exactly as they were", () => {
    const html = profileView();

    assert.match(html, /data-allocation-step="-1"/);
    assert.match(html, /data-allocation-step="1"/);
    assert.match(html, /data-allocation-remaining[^>]*role="status"/, "the remaining count stays a live region");
    assert.match(html, /profile\.allocation\.locked \? "disabled" : ""/, "the lock still disables the steppers");
    assert.match(html, /aria-label="Add a point to <%= stat %>"/, "and each stepper still names itself");
    assert.match(html, /aria-label="Remove a point from <%= stat %>"/);
  });

  it("keeps the derived values, spells, privacy and Today summary on the page", () => {
    const html = profileView();

    for (const hook of ["profile-derived", "profile-presentation", "profile-privacy", "profile-streaks"]) {
      assert.match(html, new RegExp(hook), `${hook} must still be composed in`);
    }
    assert.match(html, /include\("\.\/profile-spells"/);
    assert.match(html, /include\("\.\/profile-today"/);
  });

  it("invents no value the server did not send", () => {
    const html = profileView();

    // Every figure on this page comes out of the profile DTO. Matched per line
    // rather than per tag, because EJS expressions inside attributes make a
    // naive open-tag regex stop at the wrong `>`.
    const figureLines = html.split("\n").filter((line) => line.includes("profile-stat-value"));

    assert.ok(figureLines.length > 0, "the character's stats must still be rendered");
    for (const line of figureLines) {
      assert.match(line, /<%=\s*profile\.stats\[/, `a stat is not read from the profile: ${line.trim().slice(0, 80)}`);
      assert.doesNotMatch(line, />\s*\d+\s*</, "no figure is hard-coded into the markup");
    }
  });
});

describe("achievement seals join the printed system", () => {
  it("draws the seal mark at the icon family's weight", () => {
    assert.match(sealView(), /stroke-width="1\.5"/, "one stroke weight across every mark in the product");
    assert.doesNotMatch(sealView(), /stroke-width="(?!1\.5)[\d.]+"/, "and no second weight beside it");
  });

  it("draws the seal container in paper and ink, not as a glossy badge", () => {
    const body = rule("\\.ach-seal-body", achievementsCss());

    assert.match(body, /fill:\s*var\(--paper-raised\)/, "the seal sits on the page's own raised tone");
    assert.match(body, /stroke:\s*var\(--rule-strong\)/, "inside a printed rule");
    assert.match(body, /stroke-width:\s*1\.5/);
    assert.doesNotMatch(achievementsCss(), /radial-gradient\(circle at 34%/, "a printed seal carries no gloss highlight");
  });

  it("strikes an earned seal into the ink field", () => {
    const earned = rule('\\.ach-seal\\[data-status="EARNED"\\] \\.ach-seal-body', achievementsCss());

    assert.match(earned, /fill:\s*var\(--field\)/, "earned is struck into the black field");
  });

  it("uses the overprint for progress, and never as the only signal", () => {
    const ring = rule("\\.ach-seal-ring", achievementsCss());

    assert.match(ring, /stroke:\s*var\(--accent\)/, "progress carries the one emphasis colour");

    // The same progress must also be written, so colour is never load-bearing.
    const page = read("src/views/pages/partials/achievements-content.ejs");
    assert.match(page, /achievements-card-progress|\bof\b/, "progress is stated in text beside the seal");
  });

  it("keeps the seal catalogue closed to the domain's own list", () => {
    const declared = sealView().match(/const sealIcons = \[([\s\S]*?)\];/)[1];
    const names = [...declared.matchAll(/"([^"]+)"/g)].map(([, name]) => name);

    assert.ok(names.length >= 16, "the domain catalogue must still be complete");
    assert.match(sealView(), /sealIcons\.includes\(iconKey\) \? iconKey : "fallback"/, "an unknown key is explicit");
  });

  it("keeps every unlock state owned by the server", () => {
    assert.match(sealView(), /\["EARNED", "IN_PROGRESS", "NOT_STARTED"\]\.includes\(status\)/);
    assert.doesNotMatch(
      read("public/scripts/pages/achievements.js"),
      /status\s*=\s*"EARNED"/,
      "the client never decides that something is earned",
    );
  });

  it("answers forced colours for the seal, since it is drawn in SVG", () => {
    const forced = achievementsCss().match(/@media \(forced-colors: active\)\s*\{[\s\S]*?\n\}/);

    assert.ok(forced, "the achievements sheet must answer forced colours");
    assert.match(forced[0], /\.ach-seal-ring \{ stroke: CanvasText; \}/);
  });
});

describe("Profile and Achievements stay two routes", () => {
  it("keeps a route file for each", () => {
    const pages = readdirSync(path.join(appRoot, "src", "views", "pages"));

    assert.ok(pages.includes("profile.ejs"));
    assert.ok(pages.includes("achievements.ejs"));
  });

  it("links between them rather than merging them", () => {
    assert.match(profileView(), /href="\/achievements"/, "the character sheet points at the record");
  });
});
