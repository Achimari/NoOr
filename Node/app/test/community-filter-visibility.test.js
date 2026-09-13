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
  it("renders the filter controls visible on first render, with no separate toggle", () => {
    const panelTag = markup.match(/<div class="prayer-filter-panel[^"]*"[^>]*>/)?.[0] || "";

    assert.ok(panelTag, "Community renders the prayer filter panel");
    assert.doesNotMatch(panelTag, /\shidden(?:\s|>)/, "the filter panel is visible on first render");
    assert.match(
      markup,
      /<details[^>]*data-prayer-filter-disclosure[^>]*\sopen>/,
      "and the phone fold around it is open, so no script is needed to see a filter",
    );
    assert.doesNotMatch(markup, /data-prayer-filter-toggle/, "there is no redundant filter disclosure");
    assert.match(markup, /data-prayer-user-filter/);
    assert.match(markup, /data-prayer-time-toggle/);
    assert.match(markup, /data-prayer-filter-clear/);
  });

  /*
   * The owner brief for the mobile redesign asks for the filter area to become
   * "an explicit compact disclosure with the applied state visible" on phones.
   * The contract above is unchanged — the controls are still visible on first
   * render and there is still no second toggle — and these are the new
   * guarantees the fold has to meet.
   */
  it("folds only on a phone, and says what is applied while it is folded", () => {
    assert.match(markup, /data-prayer-filter-disclosure data-phone-fold/);
    assert.match(markup, /<summary class="fold-summary" aria-controls="prayer-filter-panel"/);
    assert.match(markup, /data-prayer-filter-state/, "the expander carries the applied state");
    assert.match(read("public/styles/shell.css"), /@media \(min-width: 761px\)[\s\S]{0,200}\.fold-summary \{\s*display: none/);
  });

  it("names the member being filtered on, not only the ordering", () => {
    const updater = script.slice(script.indexOf("function updatePrayerFilterState"));

    assert.match(updater, /Oldest first/);
    assert.match(updater, /Newest first/);
    assert.match(updater, /user \? `\$\{user\} · \$\{order\}` : order/);
    assert.match(updater, /prayerFilterApplied/, "an applied filter is marked, not only spelled out");
    assert.match(script, /function applyPrayerFilters\(\) \{\s*updatePrayerFilterState\(\);/, "every filter change updates it");
  });

  it("keeps Clear inside the row it clears", () => {
    const panel = markup.slice(markup.indexOf('id="prayer-filter-panel"'), markup.indexOf("</details>", markup.indexOf('id="prayer-filter-panel"')));

    assert.match(panel, /data-prayer-filter-clear/);
  });

  it("keeps only the user and time menus collapsible", () => {
    assert.doesNotMatch(script, /prayerFilterToggle|setPrayerFilterPanelOpen/);
    assert.doesNotMatch(`${styles}\n${sharedDashboardStyles}`, /\.prayer-filter-button|\.prayer-filter-glyph/);
    assert.doesNotMatch(styles, /\.prayer-filter-panel\[hidden\]/);
  });
});
