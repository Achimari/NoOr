import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const view = readFileSync(
  path.join(appRoot, "src", "views", "pages", "partials", "community-content.ejs"),
  "utf8",
);
const styles = readFileSync(path.join(appRoot, "public", "styles", "pages", "community.css"), "utf8");

describe("Community editorial layout", () => {
  it("combines encouragement and practical support in one responsive grid", () => {
    const grid = view.match(/<div class="community-editorial-grid">([\s\S]*?)<\/div>\s*<\/section>/)?.[1] || "";

    assert.match(grid, /class="community-encouragement"/, "the grid contains the encouragement");
    assert.match(grid, /class="community-resource"/, "the grid contains the practical resource");
    assert.match(styles, /\.community-editorial-grid\s*{[^}]*display:\s*grid/s);
    assert.match(styles, /\.community-editorial-grid\s*{[^}]*grid-template-columns:\s*minmax\(0,[^)]*\)\s+minmax\(0,[^)]*\)/s);
  });

  it("stacks the combined content at compact widths", () => {
    assert.match(
      styles,
      /@media\s*\(max-width:\s*800px\)[\s\S]*?\.community-editorial-grid\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s,
    );
  });
});
