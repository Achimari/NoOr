import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFileSync(path.join(appRoot, relative), "utf8");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const feedCss = () => stripComments(read("public/styles/components/feed.css"));
const communityCss = () => stripComments(read("public/styles/pages/community.css"));
const myPrayers = () => read("src/views/pages/partials/my-prayers-content.ejs");
const community = () => read("src/views/pages/partials/community-content.ejs");
const table = () => read("src/views/pages/partials/prayers-table.ejs");

const rule = (selector, css) =>
  (css.match(new RegExp(`(?:^|\\n|,)\\s*${selector}\\s*\\{([^}]*)\\}`)) || [])[1] || "";

/**
 * My Prayers and Community stay separate routes, as the information
 * architecture has always had them. Sacred Press changes how the feed reads —
 * requests are entries on a page, divided by rules — without changing what the
 * feed does: privacy, validation, reactions, the row menu, the Telegram link
 * and every empty state behave exactly as they did.
 */
describe("the prayer feed is a page, not a stack of cards", () => {
  it("gives the feed one boundary and divides the entries inside it", () => {
    const wrap = rule("\\.prayer-feed-wrap", feedCss());
    const item = rule("\\.prayer-item", feedCss());
    const divider = rule("\\.prayer-item \\+ \\.prayer-item", feedCss());

    assert.match(wrap, /border:\s*1px solid/, "the feed carries the one boundary");
    assert.doesNotMatch(item, /border:\s*1px solid/, "an entry inside it is divided, not boxed");
    assert.match(divider, /border-block-start:\s*1px solid/, "and the division is a rule");
  });

  it("never makes an entry a bounded region of its own", () => {
    assert.doesNotMatch(
      table(),
      /class="prayer-item[^"]*press-region/,
      "a region inside the feed's own boundary is the nested-card habit",
    );
  });

  it("invents no date for an entry, because the record has none", () => {
    // The composition reference shows a dated margin column beside every
    // request. The prayer DTO carries no timestamp (`sanitizePrayer` in
    // src/services/prayerService.js), and inventing one would be fabricated
    // data in a feed of real requests. The column stays out until the server
    // offers the field.
    assert.doesNotMatch(table(), /createdAt|<time\b/, "no date is rendered that the record does not carry");
    assert.doesNotMatch(read("src/services/prayerService.js"), /createdAt:/, "and none was added to the DTO for looks");
  });

  it("sets what metadata the entry does carry in the data role", () => {
    const author = rule("\\.prayer-item-author", feedCss());

    assert.ok(author, "an entry names who wrote it");
    assert.match(author, /font-family:\s*var\(--font-data\)/, "a name in a feed reads as a record's byline");
  });

  it("keeps the row menu an icon-only control with its own name", () => {
    assert.match(table(), /aria-label="Open prayer actions"/);
    assert.match(table(), /aria-haspopup="menu"/);
    assert.match(table(), /name: "more-horizontal"/, "and it draws from the one icon family");
  });

  it("keeps every reaction rendered from the server's own value", () => {
    // Reactions are real data. The emoji comes from the record, never from a
    // decorative icon the design picked.
    assert.match(table(), /reaction\.emoji/);
    assert.match(table(), /reaction\.count/);
    assert.match(table(), /class="visually-hidden">[\s\S]{0,120}?Your reaction/, "and each one is named for a reader");
  });
});

describe("the composer stays the task", () => {
  it("keeps the request field, its limit and its privacy statement", () => {
    const html = myPrayers();

    assert.match(html, /<textarea[^>]*name="prayer"/);
    assert.match(html, /maxlength="500"/);
    assert.match(html, /<label class="field-label" for="prayer-composer-input"/);
    assert.match(html, /Visible to everyone in the community/, "privacy is stated before the request leaves");
    assert.match(html, /name: "globe"/, "and the statement carries the visibility mark");
  });

  it("puts the compose action inside the composer, after the field", () => {
    const html = myPrayers();
    const field = html.indexOf("prayer-composer-input");
    const action = html.indexOf('type="submit"');

    assert.ok(field !== -1 && action > field, "the action follows the field it submits");
    assert.match(html, /class="prayer-form-status"[^>]*role="status"[^>]*aria-live="polite"/);
  });

  it("keeps exactly one filled primary in the composer", () => {
    const composer = myPrayers().match(/<form class="prayer-composer"[\s\S]*?<\/form>/)[0];
    const filled = (composer.match(/ui-button--primary|ui-button--accent/g) || []).length;

    assert.equal(filled, 1, "one group urges one action");
  });
});

describe("Community keeps its own shape", () => {
  it("stays a separate route from My Prayers", () => {
    assert.match(community(), /class="[^"]*community-page/);
    assert.match(myPrayers(), /class="[^"]*prayer-page/);
    assert.doesNotMatch(community(), /include\([^)]*my-prayers-content/, "the two routes are not merged");
  });

  it("keeps the filters, their labels and the clear control", () => {
    const html = community();

    assert.match(html, /data-prayer-user-filter[^>]*aria-expanded="false"/);
    assert.match(html, /data-prayer-time-toggle[^>]*aria-expanded="false"/);
    assert.match(html, /data-prayer-filter-clear/);
    assert.match(html, /aria-labelledby="prayer-time-label prayer-time-value"/, "the select keeps its name");
  });

  it("draws the select's affordance from the one icon family", () => {
    assert.match(community(), /class="prayer-select-chevron"[^>]*>\s*<%- include\([^)]*name: "chevron"/);

    const chevron = rule("\\.prayer-select-chevron", communityCss());
    assert.doesNotMatch(chevron, /border-right:|border-bottom:/, "no hand-drawn chevron beside a real icon set");
    assert.match(
      communityCss(),
      /\.prayer-select-trigger\[aria-expanded="true"\] \.prayer-select-chevron \{[^}]*transform:\s*rotate\(180deg\)/,
      "and it turns a half-turn when the menu opens",
    );
  });

  it("keeps the Telegram link external and safe", () => {
    const html = community();

    assert.match(html, /data-telegram-state/);
    for (const [, attrs] of html.matchAll(/<a\b([^>]*target="_blank"[^>]*)>/g)) {
      assert.match(attrs, /rel="[^"]*noreferrer/, "an external link must not leak the referrer");
    }
  });

  it("groups the Telegram block with one boundary, not a box inside a box", () => {
    const outer = rule("\\.community-telegram", communityCss());
    const inner = rule("\\.community-telegram \\.info-resource-head", communityCss());

    if (outer.includes("border:") && inner.includes("border:")) {
      assert.fail("the Telegram block draws two boundaries for one group");
    }
  });
});

describe("both routes open on the same printed grammar", () => {
  for (const [name, view] of [
    ["my-prayers", () => myPrayers()],
    ["community", () => community()],
  ]) {
    it(`${name} opens with a text-only display title`, () => {
      const html = view();

      assert.match(html, /class="page-head prayers-opening\b/, `${name} uses the shared opening`);
      assert.match(html, /class="page-head-copy"/);
      assert.doesNotMatch(html, /<picture|<img|\/images\/plates\/|press-plate/, `${name} has no decorative image`);
    });
  }

  it("keeps decorative plate assets out of both route templates", () => {
    for (const [name, view] of [["my-prayers", myPrayers], ["community", community]]) {
      assert.doesNotMatch(view(), /\/images\/plates\//, `${name} must not request decorative plate assets`);
    }
  });
});
