import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFileSync(path.join(appRoot, relative), "utf8");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const markup = () => read("src/views/pages/partials/home-content.ejs");
const styles = () => stripComments(read("public/styles/pages/daily-check-in.css"));

const rule = (selector, css = styles()) =>
  (css.match(new RegExp(`(?:^|\\n|,)\\s*${selector}\\s*\\{([^}]*)\\}`)) || [])[1] || "";

/**
 * Today is the page the product exists for, and its composition is the one the
 * Sacred Press direction is most specific about: a typographic display opening,
 * then three related practice modules stacked in answer order and divided by
 * real rules.
 *
 * Every behaviour underneath is unchanged — the Yes/No pair and its order, the
 * `aria-pressed` state, the two countdown timers, the reading dialog, the
 * daily-goal list and the catch-up flow. The assertions below hold both.
 */
describe("Today opens like a printed page", () => {
  it("uses the same shared display title as the other pages", () => {
    const title = rule("\\.page-head-title", stripComments(read("public/styles/shell.css")));

    assert.match(markup(), /<h1 class="page-head-title today-title">Today<\/h1>/);
    assert.doesNotMatch(styles(), /\.today-title\s*\{/, "Today must not override the shared page title");
    assert.match(title, /font-size:\s*var\(--text-page-title\)/);
    assert.match(title, /font-family:\s*var\(--font-display\)/);
    assert.match(title, /font-weight:\s*var\(--weight-display/);
  });

  it("sets the dateline in the data role, where a date belongs", () => {
    const date = rule("\\.today-date");

    assert.match(date, /font-family:\s*var\(--font-data\)/, "a date is data, not prose");
    assert.match(date, /text-transform:\s*uppercase/);
    assert.match(date, /letter-spacing:\s*var\(--tracking-mark\)/, "capitals need tracking");
  });

  it("keeps the opening typographic, without decorative artwork", () => {
    const html = markup();
    assert.doesNotMatch(html, /<picture|<img|\/images\/plates\/|press-plate/);
    assert.match(rule("\\.today-opening-inner"), /display:\s*block/, "the title uses the full opening width");
  });

  it("keeps the opening on the same grid as the work below it", () => {
    const shell = stripComments(read("public/styles/shell.css"));

    assert.match(rule("\\.page-opening-inner", shell), /max-width:\s*var\(--measure-wide\)/);
    assert.match(rule("\\.page-opening-inner", shell), /padding-inline:\s*var\(--padding\)/);
  });
});

describe("the three practices read as one composition", () => {
  it("stacks the three modules in one column at every width", () => {
    const group = rule("\\.today-practices");
    const css = styles();

    assert.match(group, /display:\s*grid/);
    assert.match(group, /grid-template-columns:\s*minmax\(0,\s*1fr\)/, "the checks follow one vertical reading path");
    assert.match(group, /row-gap:\s*var\(--gap-sibling\)/);
    assert.doesNotMatch(css, /\.today-practices\s*\{[^}]*grid-template-columns:\s*repeat\(3,/, "wide screens must not restore the row");
  });

  it("divides them with rules rather than boxing each one", () => {
    const practice = rule("\\.today-practices > \\.practice");

    assert.doesNotMatch(practice, /background:\s*var\(--paper-raised\)/, "a module is not a filled card");
    assert.doesNotMatch(practice, /border-radius:\s*(?!0)\d/, "and it is not a rounded one");
  });

  it("keeps the column in DOM order without responsive reordering", () => {
    const css = styles();

    assert.doesNotMatch(css, /(?:^|[;{]\s*)order:\s*-?\d/, "Today never reorders in CSS");
    assert.doesNotMatch(css, /flex-direction:\s*\w+-reverse/);
  });

  it("keeps the three practices in the markup in the order they are answered", () => {
    const sections = [...markup().matchAll(/<section class="practice[^"]*"[^>]*aria-labelledby="([^"]+)"/g)].map(
      ([, id]) => id,
    );

    assert.deepEqual(sections, ["practice-strong-title", "practice-bible-title", "daily-goals-title"]);
  });
});

describe("Today keeps every behaviour it had", () => {
  it("keeps Yes before No in both binary practices", () => {
    for (const block of markup().match(/<div class="dashboard-actions[\s\S]*?<\/div>\s*<\/div>/g) || []) {
      const labels = [...block.matchAll(/class="dashboard-action-label">([^<]+)</g)].map(([, text]) => text);
      if (!labels.length) continue;
      assert.deepEqual(labels, ["YES", "NO"], "the order of a daily answer is not a layout decision");
    }
  });

  it("keeps aria-pressed on every answer control", () => {
    const buttons = markup().match(/<button class="dashboard-action[^>]*>/g) || [];

    assert.ok(buttons.length >= 4, "both practices keep their two controls");
    for (const button of buttons) {
      assert.match(button, /aria-pressed="false"/, `${button.slice(0, 60)} must announce its pressed state`);
    }
  });

  it("keeps the answer control a comfortable target that never becomes a billboard", () => {
    const action = rule("\\.today-page \\.dashboard-action");
    const [, min, , max] = action.match(/min-height:\s*clamp\((\d+)px,\s*([\d.]+)vw,\s*(\d+)px\)/);

    assert.ok(Number(min) >= 44, "a decision control is still a tap target");
    assert.ok(Number(max) <= 112, "and never dominates the page");
  });

  it("keeps both countdown timers, their live regions and their progress bars", () => {
    const html = markup();

    for (const hook of ["data-check-in-timer", "data-reading-timer"]) {
      assert.match(html, new RegExp(`${hook}[^>]*hidden[^>]*aria-live="polite"`), `${hook} must stay a polite live region`);
    }
    assert.equal((html.match(/role="progressbar"/g) || []).length, 2, "each timer keeps its progress bar");
    assert.match(html, /data-check-in-message/);
    assert.match(html, /data-reading-timer-message/);
  });

  it("keeps the reading dialog, the goal list and the catch-up flow wired", () => {
    const html = markup();

    assert.match(html, /data-reading-answer="YES"[^>]*aria-haspopup="dialog"/, "Yes still opens the reading dialog");
    assert.match(html, /data-daily-goal-list/);
    assert.match(html, /data-daily-goal-empty/);
    assert.match(html, /include\("\.\/catch-up"/, "the catch-up flow is still composed in");
  });

  it("keeps exactly one filled primary action inside each local group", () => {
    const sections = markup().match(/<section class="practice[\s\S]*?<\/section>/g) || [];
    assert.ok(sections.length >= 3);

    for (const section of sections) {
      const filled = (section.match(/ui-button--primary|ui-button--accent/g) || []).length;
      assert.ok(filled <= 1, `a practice module has ${filled} filled primaries; one group urges one action`);
    }
  });

  it("uses the black action field for the task add button", () => {
    const add = rule("\\.daily-goals-add");

    assert.match(add, /border:\s*1px solid var\(--action\)/);
    assert.match(add, /background:\s*var\(--action\)/);
    assert.match(add, /color:\s*var\(--on-action\)/);
  });

  it("reserves the status row so nothing moves when the answer arrives", () => {
    // Exception E5 in CONSTRAINTS.md: the row is revealed after the client
    // status request resolves, so its slot is held to keep CLS at zero.
    assert.match(rule("\\.practice-availability"), /min-height:/, "the slot must still be reserved");
  });
});

describe("Today groups without nesting", () => {
  it("never puts a bounded region inside another one", () => {
    const html = read("src/views/pages/partials/catch-up.ejs");
    const opens = [...html.matchAll(/<(\w+)[^>]*class="[^"]*\bpress-region\b[^"]*"/g)];

    for (const open of opens) {
      const rest = html.slice(open.index + open[0].length);
      const nextOpen = rest.search(/class="[^"]*\bpress-region\b/);
      const nextClose = rest.search(new RegExp(`</${open[1]}>`));
      if (nextOpen === -1) continue;
      assert.ok(nextClose !== -1 && nextClose < nextOpen, "catch-up nests one region inside another");
    }
  });

  it("separates the catch-up rows with rules, not with a box each", () => {
    const catchUp = stripComments(read("public/styles/pages/daily-check-in.css"));
    const row = (catchUp.match(/\.catch-up-item\s*\{([^}]*)\}/) || [])[1] || "";

    assert.doesNotMatch(row, /border:\s*1px solid/, "a row inside a region is divided, not boxed");
  });
});
