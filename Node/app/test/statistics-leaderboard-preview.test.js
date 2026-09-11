import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, it } from "node:test";
import { pageBundles, sharedStyles } from "../src/config/assetSources.js";
import { getPageAssets } from "../src/middleware/viewLocals.js";

const publicDir = path.join(fileURLToPath(new URL("..", import.meta.url)), "public");
const STATISTICS_STYLES = [...sharedStyles, ...pageBundles.statistics.styles];

/* The rendered ancestry of a hidden leaderboard row on GET /statistics. The
   `hidden` attribute only hides a row while no author rule outranks the user
   agent's `[hidden] { display: none }`, so this resolves the real cascade for
   `display` instead of trusting that the attribute was set. */
const HIDDEN_ROW_PATH = [
  { tag: "html", classes: [], attrs: [] },
  { tag: "body", classes: [], attrs: ["data-page"] },
  { tag: "main", classes: ["dashboard-page", "statistics-page", "progress-page"], attrs: ["data-recovery-leaderboard"] },
  { tag: "div", classes: ["page-shell"], attrs: [] },
  { tag: "section", classes: ["page-section", "section-frame", "section-frame--ruled"], attrs: [] },
  { tag: "article", classes: ["progress-board"], attrs: ["data-streak-board"] },
  { tag: "div", classes: ["data-table-wrap"], attrs: [] },
  { tag: "table", classes: ["data-table", "data-table--stack"], attrs: [] },
  { tag: "tbody", classes: [], attrs: ["data-streak-board-body", "data-leaderboard-body"] },
  { tag: "tr", classes: [], attrs: ["hidden"] },
];

const USER_AGENT_HIDDEN = { display: "none", specificity: [0, 0, 0], order: -1, origin: "user agent" };

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function widthApplies(query, width) {
  const conditions = query.split(/\s+and\s+/i).map((part) => part.trim()).filter(Boolean);
  return conditions.every((condition) => {
    const max = condition.match(/\(\s*max-width:\s*(\d+)px\s*\)/);
    if (max) return width <= Number(max[1]);
    const min = condition.match(/\(\s*min-width:\s*(\d+)px\s*\)/);
    if (min) return width >= Number(min[1]);
    if (/^(?:@media\s*)?(?:screen|all)$/i.test(condition)) return true;
    // Anything else (print, prefers-*, forced-colors) is not the default state.
    return false;
  });
}

function matchesCompound(compound, node) {
  for (const [token] of compound.matchAll(/(\[[^\]]+\]|[.#][\w-]+|^[a-zA-Z][\w-]*|\*)/g)) {
    if (token === "*") continue;
    if (token.startsWith(".")) {
      if (!node.classes.includes(token.slice(1))) return false;
    } else if (token.startsWith("[")) {
      const name = token.slice(1, -1).split(/[~^|$*]?=/)[0].trim();
      if (!node.attrs.includes(name)) return false;
    } else if (token.startsWith("#")) {
      return false;
    } else if (token !== node.tag) {
      return false;
    }
  }
  return true;
}

function matchesPath(selector, nodePath) {
  const parts = selector.trim().split(/\s*(>)\s*|\s+/).filter(Boolean);
  let index = nodePath.length - 1;
  let requireParent = false;

  for (let part = parts.length - 1; part >= 0; part -= 1) {
    const piece = parts[part];
    if (piece === ">") {
      requireParent = true;
      continue;
    }
    if (part === parts.length - 1) {
      if (!matchesCompound(piece, nodePath[index])) return false;
      index -= 1;
      requireParent = false;
      continue;
    }
    if (requireParent) {
      if (index < 0 || !matchesCompound(piece, nodePath[index])) return false;
      index -= 1;
      requireParent = false;
      continue;
    }
    let found = false;
    while (index >= 0) {
      if (matchesCompound(piece, nodePath[index])) {
        index -= 1;
        found = true;
        break;
      }
      index -= 1;
    }
    if (!found) return false;
  }

  return true;
}

function specificity(selector) {
  const ids = (selector.match(/#[\w-]+/g) || []).length;
  const classes = (selector.match(/\.[\w-]+|\[[^\]]+\]|:[a-z-]+(?!:)/g) || []).length;
  const tags = (selector.match(/(^|[\s>+~])[a-zA-Z][\w-]*/g) || []).length;
  return [ids, classes, tags];
}

function isHigher(first, second) {
  for (let index = 0; index < 3; index += 1) {
    if (first.specificity[index] !== second.specificity[index]) {
      return first.specificity[index] > second.specificity[index];
    }
  }
  return first.order > second.order;
}

/* Resolves `display` for the hidden row the way a browser would: every rule
   whose media query applies at `width` and whose selector matches the row,
   ordered by specificity and then by source order. */
function resolveHiddenRowDisplay(files, width) {
  let winner = USER_AGENT_HIDDEN;
  let order = 0;
  const unsupported = [];

  for (const file of files) {
    const css = stripComments(readFileSync(path.join(publicDir, file), "utf8"));
    for (const [, query, body] of css.matchAll(/@media([^{]+)\{((?:[^{}]|\{[^{}]*\})*)\}/g)) {
      if (!widthApplies(query, width)) continue;
      for (const rule of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        order += 1;
        collect(rule, `${file} @media${query.trim()}`, order);
      }
    }
    const topLevel = css.replace(/@media[^{]+\{(?:[^{}]|\{[^{}]*\})*\}/g, "");
    for (const rule of topLevel.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      order += 1;
      collect(rule, file, order);
    }
  }

  function collect([, selectors, declarations], origin, ruleOrder) {
    const display = declarations.match(/(?:^|;)\s*display\s*:\s*([^;!]+)/);
    if (!display) return;
    for (const selector of selectors.split(",")) {
      const trimmed = selector.trim();
      if (!trimmed) continue;
      if (!/\btr\b|\[hidden\]/.test(trimmed)) continue;
      if (/::|:not\(|:nth|:has\(/.test(trimmed)) {
        unsupported.push(`${origin}: ${trimmed}`);
        continue;
      }
      if (!matchesPath(trimmed, HIDDEN_ROW_PATH)) continue;
      const candidate = {
        display: display[1].trim(),
        specificity: specificity(trimmed),
        order: ruleOrder,
        origin: `${origin} :: ${trimmed}`,
      };
      if (isHigher(candidate, winner)) winner = candidate;
    }
  }

  return { winner, unsupported };
}

function createPreviewFixture(rowCount) {
  const focused = [];
  const rows = Array.from({ length: rowCount }, (_, index) => ({
    hidden: false,
    querySelector() {
      return { focus() { focused.push(index); } };
    },
  }));
  const listeners = new Map();
  const attributes = new Map();
  const button = {
    hidden: false,
    textContent: "View more",
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    setAttribute(name, value) {
      attributes.set(name, value);
    },
    click() {
      listeners.get("click")?.();
    },
  };
  const status = {
    textContent: "",
  };
  const body = {
    querySelector(selector) {
      return selector === ".leaderboard-empty" ? null : undefined;
    },
    querySelectorAll(selector) {
      return selector === "tr" ? rows : [];
    },
  };
  const board = {
    dataset: { streakBoardLabel: "Recovery Streak" },
    querySelector(selector) {
      if (selector === "[data-streak-board-body]") return body;
      if (selector === "[data-streak-board-toggle]") return button;
      if (selector === "[data-streak-board-status]") return status;
      return null;
    },
  };
  const document = {
    querySelectorAll(selector) {
      return selector === "[data-streak-board]" ? [board] : [];
    },
  };

  document.activeElement = button;

  return { attributes, board, button, document, focused, rows, status };
}

function runStatisticsScript(fixture) {
  const source = readFileSync(new URL("../public/scripts/pages/statistics.js", import.meta.url), "utf8");
  vm.runInNewContext(source, {
    document: fixture.document,
    globalThis: {},
  });
}

describe("statistics leaderboard preview", () => {
  it("loads the Statistics interaction script in development", () => {
    assert.equal(getPageAssets("statistics").script, "/scripts/pages/statistics.js");
  });

  it("shows users in batches of five until every row is visible", () => {
    const fixture = createPreviewFixture(12);

    runStatisticsScript(fixture);

    assert.deepEqual(fixture.rows.map((row) => row.hidden), [
      false, false, false, false, false,
      true, true, true, true, true, true, true,
    ]);
    assert.equal(fixture.button.hidden, false);
    assert.equal(fixture.button.textContent, "View more");
    assert.equal(fixture.attributes.get("aria-label"), "View 5 more users in Recovery Streak; 7 remaining");

    fixture.button.click();

    assert.deepEqual(fixture.rows.map((row) => row.hidden), [
      false, false, false, false, false,
      false, false, false, false, false,
      true, true,
    ]);
    assert.equal(fixture.button.hidden, false);
    assert.equal(fixture.button.textContent, "View more");
    assert.equal(fixture.attributes.get("aria-label"), "View 2 more users in Recovery Streak; 2 remaining");
    assert.equal(fixture.status.textContent, "Showing 10 of 12 users in Recovery Streak.");

    fixture.button.click();

    assert.deepEqual(fixture.rows.map((row) => row.hidden), Array(12).fill(false));
    assert.equal(fixture.button.hidden, true);
    assert.equal(fixture.status.textContent, "Showing all 12 users in Recovery Streak.");
  });

  it("hides the toggle when a board has five rows or fewer", () => {
    const fixture = createPreviewFixture(5);

    runStatisticsScript(fixture);

    assert.deepEqual(fixture.rows.map((row) => row.hidden), [false, false, false, false, false]);
    assert.equal(fixture.button.hidden, true);
  });

  for (const width of [1440, 1024, 768, 560, 390, 320]) {
    it(`leaves a hidden leaderboard row with no layout box at ${width}px`, () => {
      const { winner, unsupported } = resolveHiddenRowDisplay(STATISTICS_STYLES, width);

      assert.deepEqual(unsupported, [], "a row rule this resolver cannot judge would hide a regression");
      assert.equal(
        winner.display,
        "none",
        `a hidden row still gets a box at ${width}px: ${winner.origin} wins the cascade`,
      );
    });
  }

  it("catches the regression it was written for", () => {
    // Without the page bundle, components/tables.css hands every stacked row a
    // `display: grid` that outranks the `hidden` attribute. This is the defect
    // the browser showed at 390px, so the resolver must still see it.
    const shared = resolveHiddenRowDisplay(sharedStyles, 390);

    assert.equal(shared.winner.display, "grid", "the shared table sheet alone must still lose to nothing");
    assert.match(shared.winner.origin, /components\/tables\.css/);
  });

  it("wins that cascade with a scoped selector rather than !important", () => {
    const page = stripComments(readFileSync(path.join(publicDir, "styles/pages/statistics.css"), "utf8"));
    const rule = page.match(/([^{}]*tr\[hidden\][^{}]*)\{([^}]*)\}/);

    assert.ok(rule, "the page bundle owns the fix");
    assert.match(rule[1], /\.progress-board/, "the fix is scoped to this page's board");
    assert.doesNotMatch(rule[2], /!important/, "specificity is enough; !important would leak intent");
  });

  it("keeps the shared stacked table unchanged for every other page", () => {
    const tables = stripComments(readFileSync(path.join(publicDir, "styles/components/tables.css"), "utf8"));

    assert.match(tables, /\.data-table--stack tbody tr \{[^}]*display:\s*grid/s, "the stacked layout stays shared");
    assert.doesNotMatch(tables, /tr\[hidden\]/, "the shared component must not learn about this page");
  });

  it("reveals only the remaining rows when the final page is smaller than five", () => {
    const fixture = createPreviewFixture(8);

    runStatisticsScript(fixture);
    fixture.button.click();

    assert.deepEqual(fixture.rows.map((row) => row.hidden), Array(8).fill(false));
    assert.equal(fixture.button.hidden, true);
    assert.equal(fixture.status.textContent, "Showing all 8 users in Recovery Streak.");
  });

  it("keeps keyboard focus in the board when the last activation hides the control", () => {
    const fixture = createPreviewFixture(8);

    runStatisticsScript(fixture);
    assert.deepEqual(fixture.focused, [], "initialisation must never move focus");

    fixture.button.click();

    assert.equal(fixture.button.hidden, true);
    assert.deepEqual(fixture.focused, [5], "focus lands on the first row the reader just revealed");
  });

  it("does not move focus while the control survives the activation", () => {
    const fixture = createPreviewFixture(20);

    runStatisticsScript(fixture);
    fixture.button.click();

    assert.equal(fixture.button.hidden, false);
    assert.deepEqual(fixture.focused, [], "focus stays on the control the reader is pressing");
  });
});
