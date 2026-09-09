import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, it } from "node:test";
import { getPageAssets } from "../src/middleware/viewLocals.js";

function createPreviewFixture(rowCount) {
  const rows = Array.from({ length: rowCount }, () => ({ hidden: false }));
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

  return { attributes, board, button, document, rows, status };
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

  it("reveals only the remaining rows when the final page is smaller than five", () => {
    const fixture = createPreviewFixture(8);

    runStatisticsScript(fixture);
    fixture.button.click();

    assert.deepEqual(fixture.rows.map((row) => row.hidden), Array(8).fill(false));
    assert.equal(fixture.button.hidden, true);
    assert.equal(fixture.status.textContent, "Showing all 8 users in Recovery Streak.");
  });
});
