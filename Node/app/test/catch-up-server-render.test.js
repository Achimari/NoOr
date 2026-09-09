import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import ejs from "ejs";

function renderedRows(html) {
  const list = html.slice(html.indexOf("data-catch-up-list"), html.indexOf("</ul>"));
  return list.match(/<li class="catch-up-item"[^>]*data-catch-up-item/g) || [];
}

const catchUpPath = fileURLToPath(
  new URL("../src/views/pages/partials/catch-up.ejs", import.meta.url),
);
const appScript = readFileSync(new URL("../public/scripts/app.js", import.meta.url), "utf8");

function items(count, activity = "STRONG") {
  return Array.from({ length: count }, (unused, index) => ({
    dateKey: `2026-09-${String(index + 1).padStart(2, "0")}`,
    activity,
  }));
}

async function render(missedActivities) {
  return ejs.renderFile(catchUpPath, { missedActivities, dateLocale: "en" });
}

describe("catch-up is complete on first paint", () => {
  it("stays hidden and renders no rows when nothing is missing", async () => {
    const html = await render({ total: 0, items: [] });

    assert.match(html, /<section[^>]*data-catch-up[^>]*hidden/);
    assert.equal(renderedRows(html).length, 0);
  });

  it("renders the first five missed activities server-side", async () => {
    const html = await render({ total: 18, items: items(18) });
    const rows = renderedRows(html);

    assert.equal(rows.length, 5, "five rows are rendered before any script runs");
    assert.doesNotMatch(html.slice(0, html.indexOf("</section>")), /data-catch-up[^->]*hidden/);
    assert.match(html, /18 left/);
  });

  it("renders fewer rows when fewer are missing, and hides View more", async () => {
    const html = await render({ total: 3, items: items(3) });
    const rows = renderedRows(html);

    assert.equal(rows.length, 3);
    assert.match(html, /data-catch-up-more[^>]*hidden/);
  });

  it("shows View more when more than five are missing", async () => {
    const html = await render({ total: 12, items: items(12) });
    const more = html.match(/<button[^>]*data-catch-up-more[^>]*>/)[0];

    assert.doesNotMatch(more, /hidden/);
  });

  it("names each activity with the same copy the client renderer uses", async () => {
    const html = await render({
      total: 3,
      items: [
        { dateKey: "2026-09-01", activity: "STRONG" },
        { dateKey: "2026-09-02", activity: "READING" },
        { dateKey: "2026-09-03", activity: "GOALS" },
      ],
    });

    for (const name of ["Strong check-in", "Bible reading", "Daily tasks"]) {
      assert.match(html, new RegExp(name), `server markup is missing "${name}"`);
      assert.match(appScript, new RegExp(`name: "${name}"`), `client copy is missing "${name}"`);
    }
  });

  it("shows a full localized date, not a raw date key", async () => {
    const html = await render({ total: 1, items: [{ dateKey: "2026-09-01", activity: "STRONG" }] });

    assert.match(html, /Sep 1, 2026|1 Sep 2026/);
    assert.doesNotMatch(html, />\s*2026-09-01\s*</);
  });

  it("drops an activity it has no copy for rather than rendering an empty row", async () => {
    const html = await render({ total: 1, items: [{ dateKey: "2026-09-01", activity: "MYSTERY" }] });
    const rows = renderedRows(html);

    assert.equal(rows.length, 0);
  });
});
