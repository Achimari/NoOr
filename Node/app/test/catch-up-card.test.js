import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import vm from "node:vm";
import ejs from "ejs";

const templatePath = fileURLToPath(
  new URL("../src/views/pages/partials/home-content.ejs", import.meta.url),
);
const appScriptPath = fileURLToPath(new URL("../public/scripts/app.js", import.meta.url));
const dashboardStylesPath = fileURLToPath(
  new URL("../public/styles/pages/daily-check-in.css", import.meta.url),
);

const source = readFileSync(appScriptPath, "utf8");

function sliceSource(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `missing ${endMarker}`);

  return source.slice(start, end);
}

const catchUpHelpers = sliceSource("const CATCH_UP_ACTIVITIES", "\nfunction buildCatchUpRow(");
const catchUpRender = sliceSource("function buildCatchUpRow(", "\nasync function applyCatchUpPayload(");

function runCatchUpHelpers(expression) {
  return JSON.parse(vm.runInNewContext(`${catchUpHelpers}\nJSON.stringify(${expression})`, {}));
}

function fakeElement() {
  return {
    textContent: "",
    hidden: false,
    dataset: {},
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  };
}

function fakeRow() {
  const parts = {
    "[data-catch-up-date]": fakeElement(),
    "[data-catch-up-activity]": fakeElement(),
    "[data-catch-up-note]": fakeElement(),
    "[data-catch-up-open]": fakeElement(),
  };

  return {
    dataset: {},
    hidden: false,
    parts,
    querySelector: (selector) => parts[selector] || null,
  };
}

function renderCatchUpWithPayload(payload) {
  const card = { hidden: false };
  const count = fakeElement();
  const status = fakeElement();
  const more = fakeElement();
  const pageStatus = fakeElement();
  let children = [];
  const list = {
    replaceChildren: (...rows) => {
      children = rows;
    },
    querySelectorAll(selector) {
      return selector === "[data-catch-up-item]" ? children : [];
    },
  };
  const template = {
    content: {
      firstElementChild: { cloneNode: () => fakeRow() },
    },
  };

  const context = {
    catchUpCard: card,
    catchUpList: list,
    catchUpTemplate: template,
    catchUpCount: count,
    catchUpStatus: status,
    catchUpMore: more,
    catchUpPageStatus: pageStatus,
    catchUpItems: [],
  };

  vm.runInNewContext(
    `${catchUpHelpers}\n${catchUpRender}\nrenderCatchUp(payload);`,
    { ...context, payload },
  );

  return { card, count, status, more, pageStatus, rows: children, items: context.catchUpItems };
}

async function renderDashboard() {
  return ejs.renderFile(templatePath, {
    checkIn: {
      id: 7,
      todayDateKey: "2026-09-04",
      weekDays: [{ dateKey: "2026-09-01", label: "M", answer: "YES", successful: true }],
    },
    siteData: { socialLinks: [] },
    t: () => "",
  });
}

describe("catch-up card markup", () => {
  it("renders the catch-up card near the top of the dashboard", async () => {
    const html = await renderDashboard();

    assert.match(html, /data-catch-up\b/);
    assert.match(html, /Catch up/);
    assert.match(html, /You have unfinished days/);
    assert.match(html, /Complete the activities you missed to keep your history accurate\./);
    assert.ok(html.indexOf("data-catch-up") < html.indexOf("data-reading-check"));
    assert.ok(html.indexOf("data-catch-up") < html.indexOf("data-daily-goals"));
  });

  it("starts hidden so nothing shows when nothing is missing", async () => {
    const html = await renderDashboard();
    const card = html.match(/<section[^>]*data-catch-up[^>]*>/)[0];

    assert.match(card, /\bhidden\b/);
  });

  it("names the dialogs and keeps the status change in a polite live region", async () => {
    const html = await renderDashboard();

    assert.match(html, /data-catch-up-status[^>]*role="status"[^>]*aria-live="polite"/);
    assert.match(html, /aria-labelledby="catch-up-title"/);
    assert.match(html, /role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="catch-up-tasks-title"/);
  });

  it("uses semantic buttons for every row action", async () => {
    const html = await renderDashboard();
    const template = html.match(/<template data-catch-up-template>[\s\S]*?<\/template>/)[0];

    assert.match(template, /<button[^>]*type="button"[^>]*data-catch-up-open/);
    assert.doesNotMatch(template, /<a\s/);
  });

  it("provides an accessible View more control for missed activities", async () => {
    const html = await renderDashboard();

    assert.match(html, /<ul[^>]*id="catch-up-list"[^>]*data-catch-up-list/);
    assert.match(html, /<button[^>]*type="button"[^>]*data-catch-up-more[^>]*aria-controls="catch-up-list"[^>]*>View more<\/button>/);
    assert.match(html, /data-catch-up-page-status[^>]*role="status"[^>]*aria-live="polite"/);
  });

  it("leaves the Strong panel as the first Yes/No action on the page", async () => {
    const html = await renderDashboard();

    const strongYes = html.indexOf('class="dashboard-action dashboard-action-yes"');
    const strongNo = html.indexOf('class="dashboard-action dashboard-action-no"');

    assert.notEqual(strongYes, -1);
    assert.notEqual(strongNo, -1);
    assert.equal(html.indexOf("dashboard-action-yes"), strongYes + 'class="dashboard-action '.length);
    assert.equal(html.indexOf("dashboard-action-no"), strongNo + 'class="dashboard-action '.length);

    const answerDialog = html.match(/<div class="missed-answer-actions">[\s\S]*?<\/div>/)[0];
    assert.doesNotMatch(answerDialog, /dashboard-action-yes|dashboard-action-no/);
    assert.match(answerDialog, /catch-up-answer-option-yes/);
    assert.match(answerDialog, /catch-up-answer-option-no/);
  });

  it("lets the user record completed tasks or explicitly record none", async () => {
    const html = await renderDashboard();

    assert.match(html, /data-catch-up-tasks-modal/);
    assert.match(html, /one and five/i);
    assert.match(html, /<button[^>]*type="button"[^>]*data-catch-up-tasks-none[^>]*>I did not complete any tasks<\/button>/);
  });

  it("posts an explicit No answer for an empty missed task day", () => {
    assert.match(
      source,
      /data-catch-up-tasks-none[\s\S]*?submitCatchUpTasksAnswer\(\{ answer: "NO", tasks: \[\] \}\)/,
    );
  });
});

describe("catch-up copy", () => {
  it("gives every activity a name, an explanation and one action", () => {
    const copy = runCatchUpHelpers(
      '["STRONG", "READING", "GOALS"].map((activity) => catchUpActivityCopy(activity))',
    );

    copy.forEach((entry) => {
      assert.ok(entry.name.length > 0);
      assert.ok(entry.note.length > 0);
      assert.equal(entry.action, "Answer");
    });
    assert.deepEqual(copy.map((entry) => entry.name), ["Strong check-in", "Bible reading", "Daily tasks"]);
  });

  it("sorts items oldest first and keeps a stable activity order", () => {
    const sorted = runCatchUpHelpers(`sortCatchUpItems([
      { dateKey: "2026-09-03", activity: "GOALS" },
      { dateKey: "2026-09-01", activity: "GOALS" },
      { dateKey: "2026-09-01", activity: "STRONG" },
      { dateKey: "2026-09-02", activity: "READING" },
    ])`);

    assert.deepEqual(sorted, [
      { dateKey: "2026-09-01", activity: "STRONG" },
      { dateKey: "2026-09-01", activity: "GOALS" },
      { dateKey: "2026-09-02", activity: "READING" },
      { dateKey: "2026-09-03", activity: "GOALS" },
    ]);
  });

  it("drops unknown activities rather than rendering an empty row", () => {
    const normalized = runCatchUpHelpers(
      'normalizeCatchUpPayload({ total: 2, items: [{ dateKey: "2026-09-01", activity: "NOPE" }, { dateKey: "2026-09-01", activity: "STRONG" }] })',
    );

    assert.deepEqual(normalized, { total: 1, items: [{ dateKey: "2026-09-01", activity: "STRONG" }] });
  });

  it("calculates five-item pages and a smaller final page", () => {
    const pages = runCatchUpHelpers(`[
      getCatchUpPageState(12, 5),
      getCatchUpPageState(12, 10),
      getCatchUpPageState(12, 15)
    ]`);

    assert.deepEqual(pages, [
      { visibleCount: 5, remainingCount: 7, nextBatchCount: 5 },
      { visibleCount: 10, remainingCount: 2, nextBatchCount: 2 },
      { visibleCount: 12, remainingCount: 0, nextBatchCount: 0 },
    ]);
  });

  it("fills the visible batch after one activity is answered", () => {
    const reconciled = runCatchUpHelpers(`reconcileCatchUpItemsAfterSave(
      [
        { dateKey: "2026-09-01", activity: "STRONG" },
        { dateKey: "2026-09-01", activity: "READING" },
        { dateKey: "2026-09-01", activity: "GOALS" },
        { dateKey: "2026-09-02", activity: "STRONG" },
        { dateKey: "2026-09-02", activity: "READING" }
      ],
      {
        total: 7,
        items: [
          { dateKey: "2026-09-01", activity: "READING" },
          { dateKey: "2026-09-01", activity: "GOALS" },
          { dateKey: "2026-09-02", activity: "STRONG" },
          { dateKey: "2026-09-02", activity: "READING" },
          { dateKey: "2026-09-02", activity: "GOALS" }
        ]
      },
      { dateKey: "2026-09-01", activity: "STRONG" }
    )`);

    assert.equal(reconciled.total, 7);
    assert.equal(reconciled.desiredLoadedCount, 5);
    assert.equal(reconciled.items.length, 5);
    assert.deepEqual(reconciled.items.at(-1), { dateKey: "2026-09-02", activity: "GOALS" });
  });
});

describe("catch-up rendering", () => {
  it("hides the whole card when nothing is missing", () => {
    const rendered = renderCatchUpWithPayload({ total: 0, items: [] });

    assert.equal(rendered.card.hidden, true);
    assert.equal(rendered.rows.length, 0);
    assert.match(rendered.status.textContent, /caught up/i);
  });

  it("shows one row per missed activity, oldest first", () => {
    const rendered = renderCatchUpWithPayload({
      total: 3,
      items: [
        { dateKey: "2026-09-03", activity: "GOALS" },
        { dateKey: "2026-09-01", activity: "STRONG" },
        { dateKey: "2026-09-02", activity: "READING" },
      ],
    });

    assert.equal(rendered.card.hidden, false);
    assert.equal(rendered.rows.length, 3);
    assert.deepEqual(
      rendered.rows.map((row) => row.dataset.catchUpDate),
      ["2026-09-01", "2026-09-02", "2026-09-03"],
    );
  });

  it("labels each row with its date, activity, explanation and action", () => {
    const [strong, reading, goals] = renderCatchUpWithPayload({
      total: 3,
      items: [
        { dateKey: "2026-09-01", activity: "STRONG" },
        { dateKey: "2026-09-01", activity: "READING" },
        { dateKey: "2026-09-01", activity: "GOALS" },
      ],
    }).rows;

    assert.equal(strong.parts["[data-catch-up-activity]"].textContent, "Strong check-in");
    assert.equal(reading.parts["[data-catch-up-activity]"].textContent, "Bible reading");
    assert.equal(goals.parts["[data-catch-up-activity]"].textContent, "Daily tasks");

    assert.equal(goals.parts["[data-catch-up-open]"].textContent, "Answer");
    assert.equal(strong.parts["[data-catch-up-open]"].textContent, "Answer");
    assert.ok(strong.parts["[data-catch-up-date]"].textContent.length > 0);
    assert.ok(strong.parts["[data-catch-up-note]"].textContent.length > 0);
    assert.ok(strong.parts["[data-catch-up-open]"].attributes["aria-label"].includes("Strong check-in"));

    assert.equal(goals.parts["[data-catch-up-open]"].dataset.catchUpActivity, "GOALS");
    assert.equal(goals.parts["[data-catch-up-open]"].dataset.catchUpDate, "2026-09-01");
  });

  it("removes a completed item and keeps showing the next one", () => {
    const before = renderCatchUpWithPayload({
      total: 2,
      items: [
        { dateKey: "2026-09-01", activity: "STRONG" },
        { dateKey: "2026-09-02", activity: "GOALS" },
      ],
    });
    assert.equal(before.rows.length, 2);

    const after = renderCatchUpWithPayload({
      total: 1,
      items: [{ dateKey: "2026-09-02", activity: "GOALS" }],
    });

    assert.equal(after.card.hidden, false);
    assert.equal(after.rows.length, 1);
    assert.equal(after.rows[0].dataset.catchUpActivity, "GOALS");
  });

  it("hides the card once the last item is completed", () => {
    const after = renderCatchUpWithPayload({ total: 0, items: [] });

    assert.equal(after.card.hidden, true);
  });

  it("shows only the first five missed activities and offers the next five", () => {
    const items = Array.from({ length: 12 }, (unused, index) => ({
      dateKey: `2026-09-${String(index + 1).padStart(2, "0")}`,
      activity: "STRONG",
    }));

    const rendered = renderCatchUpWithPayload({ total: 12, items });

    assert.equal(rendered.rows.filter((row) => !row.hidden).length, 5);
    assert.equal(rendered.more.hidden, false);
    assert.equal(rendered.more.textContent, "View more");
    assert.equal(
      rendered.more.attributes["aria-label"],
      "View 5 more missed activities; 7 activities remaining",
    );
  });

  it("keeps View more available when the API has additional pages", () => {
    const items = Array.from({ length: 5 }, (unused, index) => ({
      dateKey: `2026-09-${String(index + 1).padStart(2, "0")}`,
      activity: "STRONG",
    }));

    const rendered = renderCatchUpWithPayload({ total: 12, items });

    assert.equal(rendered.rows.filter((row) => !row.hidden).length, 5);
    assert.equal(rendered.more.hidden, false);
    assert.equal(
      rendered.more.attributes["aria-label"],
      "View 5 more missed activities; 7 activities remaining",
    );
  });
});

describe("catch-up styling", () => {
  it("uses the monochrome dashboard surface rather than an error alert", () => {
    const styles = readFileSync(dashboardStylesPath, "utf8");

    assert.match(styles, /\.catch-up-card\s*{/);
    assert.doesNotMatch(styles, /\.catch-up-card\s*{[^}]*gradient/s);
    assert.doesNotMatch(styles, /\.catch-up-card\s*{[^}]*var\(--danger\)/s);
  });
});
