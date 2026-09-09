import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFileSync(path.join(appRoot, relative), "utf8");
const markup = read("src/views/pages/partials/community-content.ejs");
const script = read("public/scripts/app.js");
const styles = read("public/styles/pages/community.css");
const sharedDashboardStyles = read("public/styles/home/dashboard.css");

describe("Community prayer filters", () => {
  it("renders the filter controls visible without a disclosure button", () => {
    const panelTag = markup.match(/<div class="prayer-filter-panel"[^>]*>/)?.[0] || "";

    assert.ok(panelTag, "Community renders the prayer filter panel");
    assert.doesNotMatch(panelTag, /\shidden(?:\s|>)/, "the filter panel is visible on first render");
    assert.doesNotMatch(markup, /data-prayer-filter-toggle/, "there is no redundant filter disclosure");
    assert.match(markup, /data-prayer-user-filter/);
    assert.match(markup, /data-prayer-time-toggle/);
    assert.match(markup, /data-prayer-filter-clear/);
  });

  it("keeps only the user and time menus collapsible", () => {
    assert.doesNotMatch(script, /prayerFilterToggle|setPrayerFilterPanelOpen/);
    assert.doesNotMatch(`${styles}\n${sharedDashboardStyles}`, /\.prayer-filter-button|\.prayer-filter-glyph/);
    assert.doesNotMatch(styles, /\.prayer-filter-panel\[hidden\]/);
  });
});
