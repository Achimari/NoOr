import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const partialsDir = path.join(appRoot, "src", "views", "pages", "partials");
const partial = (name) => readFileSync(path.join(partialsDir, name), "utf8");

const PAGES = [
  ["home-content.ejs", "Today"],
  ["statistics-content.ejs", "Progress"],
  ["my-prayers-content.ejs", "My prayers"],
  ["community-content.ejs", "Community"],
  ["settings-content.ejs", "Settings"],
  ["achievements-content.ejs", "Achievements"],
  ["help-content.ejs", "Help"],
  ["battle-content.ejs", "Battle"],
];

describe("page header contract", () => {
  for (const [view, heading] of PAGES) {
    it(`${view} renders "${heading}" as a visible h1`, () => {
      const markup = partial(view);
      const h1s = markup.match(/<h1[^>]*>/g) || [];

      assert.equal(h1s.length, 1, `${view} should have exactly one h1`);
      assert.doesNotMatch(h1s[0], /class="[^"]*\bsr-only\b/, `${view}'s h1 is screen-reader only`);
      assert.ok(
        markup.includes(`>${heading}<`) || new RegExp(`<h1[^>]*>\\s*${heading}\\s*<`).test(markup),
        `${view} should title itself "${heading}"`,
      );
    });
  }

  it("does not wrap a page header in a card surface", () => {
    for (const [view] of PAGES) {
      const markup = partial(view);
      const headBlock = markup.slice(0, markup.indexOf("</h1>"));
      assert.doesNotMatch(
        headBlock.split("\n").slice(-8).join("\n"),
        /class="[^"]*dashboard-card/,
        `${view} renders its page title inside a card`,
      );
    }
  });

  it("places Community encouragement before the prayer list", () => {
    const markup = partial("community-content.ejs");
    const encouragement = markup.indexOf('id="community-encouragement-title"');
    const prayers = markup.indexOf('id="community-prayers-title"');

    assert.ok(encouragement > -1, "Community renders its encouragement section");
    assert.ok(prayers > -1, "Community renders its prayer section");
    assert.ok(encouragement < prayers, "encouragement should be read before prayer requests");
  });
});
