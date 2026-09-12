import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import ejs from "ejs";

import { sharedViewLocals } from "./helpers/viewLocals.js";

const partialPath = fileURLToPath(
  new URL("../src/views/pages/partials/prayers-table.ejs", import.meta.url),
);
const appScript = readFileSync(new URL("../public/scripts/app.js", import.meta.url), "utf8");

function prayer(overrides = {}) {
  return {
    id: 3,
    userId: 12,
    userName: "Ann",
    prayer: "Please pray for my family this week.",
    canMarkAnswered: true,
    reactions: [{ emoji: "🙏", count: 2 }],
    currentReaction: "🙏",
    ...overrides,
  };
}

async function render(locals) {
  return ejs.renderFile(partialPath, {
    ...sharedViewLocals, prayers: [prayer()], ...locals });
}

describe("prayer feed", () => {
  it("reads as a list, not as a data table", async () => {
    const html = await render({ showActions: true, listType: "active" });

    assert.doesNotMatch(html, /<table/, "a prayer request is prose, not a row of comparable figures");
    assert.doesNotMatch(html, /<tr[\s>]/);
    assert.match(html, /<ul[^>]*data-prayers-body/);
    assert.match(html, /<li[^>]*data-prayer-row/);
  });

  it("keeps every hook the client renderer reads back", async () => {
    const html = await render({ showActions: true, listType: "active" });

    for (const attribute of [
      "data-prayer-id",
      "data-prayer-user-id",
      "data-prayer-user-name",
      "data-prayer-text",
      "data-prayer-can-mark-answered",
      "data-prayer-reaction-counts",
      "data-prayer-current-reaction",
      "data-prayer-list",
      "data-prayer-actions",
      "data-prayer-reactions",
    ]) {
      assert.match(html, new RegExp(attribute), `missing hook ${attribute}`);
    }
  });

  it("keeps the author a readable link and the request readable prose", async () => {
    const html = await render({ showActions: false, showReactions: true, listType: "community" });

    assert.match(html, /href="\/customer\/12"/);
    assert.match(html, /Please pray for my family this week\./);
  });

  it("states what is empty and what happens next", async () => {
    const html = await ejs.renderFile(partialPath, {
    ...sharedViewLocals, prayers: [], listType: "active", showActions: true });

    assert.match(html, /No active prayer requests/);
    assert.match(html, /Requests you share appear here until they are answered\./);
    assert.doesNotMatch(html, /colspan/);
  });

  it("has the client renderer emit the same list shape", () => {
    const renderer = appScript.slice(
      appScript.indexOf("function renderPrayers("),
      appScript.indexOf("function applyPrayerFilters("),
    );

    assert.ok(renderer.length > 0);
    assert.doesNotMatch(renderer, /<tr[\s>]/, "the client renderer still emits table rows");
    assert.doesNotMatch(renderer, /colspan/);
    assert.match(renderer, /<li/);
    assert.match(renderer, /data-prayer-row/, "client-rendered items must carry the row hook too");
  });
});
