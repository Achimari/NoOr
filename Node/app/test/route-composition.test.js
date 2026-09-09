import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFileSync(path.join(appRoot, relative), "utf8");

function rule(relative, selector) {
  const css = read(relative);
  const match = css.match(new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
  return match ? match[2] : null;
}

describe("Today composes each practice as one unit", () => {
  it("sizes the decision control for a daily answer, not a billboard", () => {
    const action = rule("public/styles/pages/daily-check-in.css", ".today-page .dashboard-action");
    const [, min, , max] = action.match(/min-height:\s*clamp\((\d+)px,\s*([\d.]+)vw,\s*(\d+)px\)/);

    assert.ok(Number(min) >= 88, `the floor must stay a comfortable target, got ${min}px`);
    assert.ok(Number(max) <= 112, `the panel must not dominate the page, got ${max}px`);
  });

  it("keeps the answer control above the 44px target floor at every size", () => {
    const action = rule("public/styles/pages/daily-check-in.css", ".today-page .dashboard-action");
    const [, min] = action.match(/min-height:\s*clamp\((\d+)px/);

    assert.ok(Number(min) >= 44, "a decision control is still a tap target");
  });

  it("pays the intro-to-work boundary once, not twice", () => {
    const css = read("public/styles/pages/daily-check-in.css");

    assert.match(
      css,
      /\.today-shell \{[^}]*padding-block-start:\s*0/,
      "the horizon owns the boundary; the shell must not add a second one",
    );
    assert.match(css, /\.today-page \.horizon \{[^}]*padding-block-end:\s*var\(--space-5\)/);
  });

  it("opens each Today chapter with the course rule and its waypoint", () => {
    const markup = read("src/views/pages/partials/home-content.ejs");
    const shell = read("public/styles/shell.css");

    for (const opening of markup.match(/<section class="practice[^"]*"/g) || []) {
      assert.match(opening, /section-frame--ruled/, `${opening} must sit on the course`);
    }
    assert.match(shell, /\.section-frame--ruled::before\s*\{[^}]*border-radius:\s*50%/s, "the waypoint is a dot on the rule");
  });

  it("binds a practice title, its question and its control into one frame", () => {
    const markup = read("src/views/pages/partials/home-content.ejs");

    const practices = markup.match(/<section class="practice[^"]*"/g) || [];
    assert.ok(practices.length >= 2, "Today has at least the two practices");
    for (const opening of practices) {
      assert.match(opening, /section-frame/, `${opening} must compose as one bound group`);
    }
  });

  it("draws the binding rule from the shared shell, not per page", () => {
    assert.ok(rule("public/styles/shell.css", ".section-frame"), "the frame is a shell composition");
    assert.match(
      read("public/styles/shell.css"),
      /\.section-frame > \*\s*\+\s*\*\s*\{[^}]*margin-block-start:\s*var\(--gap-related\)/,
      "everything inside a frame sits in the related band",
    );
  });
});

describe("Settings groups a heading with the rows it names", () => {
  it("puts the group boundary around the heading, not only the form", () => {
    const markup = read("src/views/pages/partials/settings-content.ejs");

    assert.doesNotMatch(markup, /class="surface-panel settings-form"/, "no panel nested inside the group panel");
    assert.match(
      read("public/styles/pages/settings.css"),
      /\.settings-group\s*\{[^}]*border:\s*1px solid var\(--rule\)/,
      "the group itself carries the one boundary",
    );
  });

  it("keeps every group heading inside its own boundary", () => {
    const markup = read("src/views/pages/partials/settings-content.ejs");

    for (const [, group] of markup.matchAll(/<section class="settings-group"[^>]*>([\s\S]*?)<\/section>/g)) {
      const title = group.indexOf("settings-group-title");
      const form = group.indexOf("<form");
      assert.ok(title !== -1, "each group states its title");
      assert.ok(form === -1 || title < form, "the title opens the group it names");
    }
  });

  it("places in-page form actions at the leading edge, not the far trailing edge", () => {
    const actions = rule("public/styles/pages/settings.css", ".settings-row--actions");

    assert.doesNotMatch(actions, /justify-content:\s*flex-end/, "an in-page form action follows the last field");
    assert.match(actions, /justify-content:\s*flex-start/);
  });

  it("keeps today's answer content away from its panel border", () => {
    const answerRow = rule(
      "public/styles/pages/settings.css",
      ".settings-group > .surface-panel > .settings-row",
    );

    assert.ok(answerRow, "the bordered answer panel owns explicit row inset spacing");
    assert.match(answerRow, /padding-inline:\s*var\(--space-4\)/);
  });
});

describe("action placement is decided by context, not by page", () => {
  it("keeps My Prayers' compose action inside the composer, after the field", () => {
    const markup = read("src/views/pages/partials/my-prayers-content.ejs");
    const composer = markup.match(/<form[^>]*data-prayer-form[\s\S]*?<\/form>/);

    assert.ok(composer, "the composer is a form");
    assert.match(composer[0], /ui-button--primary/, "its commit action is the canonical primary");
  });

  it("never puts two filled primaries in one action group", () => {
    for (const relative of [
      "src/views/pages/partials/settings-content.ejs",
      "src/views/pages/partials/my-prayers-content.ejs",
      "src/views/pages/partials/home-content.ejs",
      "src/views/pages/partials/profile-content.ejs",
    ]) {
      const markup = read(relative);
      for (const [group] of markup.matchAll(/<div class="[^"]*(?:actions|ui-button-group)[^"]*"[\s\S]{0,900}?<\/div>/g)) {
        const primaries = (group.match(/ui-button--primary/g) || []).length;
        assert.ok(primaries <= 1, `${relative} has ${primaries} filled primaries in one group`);
      }
    }
  });
});
