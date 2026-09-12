import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import vm from "node:vm";
import ejs from "ejs";

import { sharedViewLocals } from "./helpers/viewLocals.js";

const templatePath = fileURLToPath(
  new URL("../src/views/pages/partials/home-content.ejs", import.meta.url),
);
const appScriptPath = fileURLToPath(new URL("../public/scripts/app.js", import.meta.url));
const dashboardStylesPath = fileURLToPath(
  new URL("../public/styles/pages/daily-check-in.css", import.meta.url),
);
const materialStylesPath = fileURLToPath(
  new URL("../public/styles/components/material.css", import.meta.url),
);

function renderReadingSummaryForStatus(status) {
  const source = readFileSync(appScriptPath, "utf8");
  const start = source.indexOf("function renderReadingSummary(status)");
  const end = source.indexOf("\nfunction setReadingAnswerState(status)", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const readingSummary = { hidden: false };
  vm.runInNewContext(`${source.slice(start, end)}\nrenderReadingSummary(status);`, {
    document: {},
    readingSummary,
    readingSummaryBadge: {},
    readingSummaryNote: {},
    readingSummaryRefs: {},
    status,
  });

  return readingSummary;
}

async function renderDashboard() {
  return ejs.renderFile(templatePath, {
    ...sharedViewLocals,
    checkIn: {
      id: 7,
      todayDateKey: "2026-09-04",
      weekDays: [{ dateKey: "2026-09-01", label: "M", answer: "YES", successful: true }],
    },
    siteData: { socialLinks: [] },
    t: () => "",
  });
}

describe("daily check-in layout", () => {
  it("opens Today on the page itself, with no backdrop behind the heading", () => {
    // The shared sky is retired (CONSTRAINTS.md, 2026-09-11), so the opening
    // band has nothing to be transparent over: it is paper, like the rest of
    // the sheet, and nothing may paint a second ground beneath the heading.
    const materialStyles = readFileSync(materialStylesPath, "utf8");
    const pageStyles = readFileSync(dashboardStylesPath, "utf8");

    assert.doesNotMatch(materialStyles, /\.horizon\b/, "the sky-era horizon component is gone");
    assert.doesNotMatch(pageStyles, /--horizon-fade|app-sky|ambient-video/, "Today mounts no backdrop");

    const opening = pageStyles.match(/\.today-opening\s*{([^}]*)}/s);
    if (opening) {
      assert.doesNotMatch(opening[1], /background-image|gradient/, "the opening is paper, not a wash");
    }
  });

  it("ends the Today header with space instead of a decorative line", () => {
    const materialStyles = readFileSync(materialStylesPath, "utf8");
    const todayStyles = readFileSync(dashboardStylesPath, "utf8");
    const todayOpening = todayStyles.match(/\.today-page \.today-opening\s*{([^}]*)}/s);

    assert.doesNotMatch(materialStyles, /\.page-opening::before\s*{/);
    assert.ok(todayOpening, "Today defines its opening spacing");
    assert.match(todayOpening[1], /justify-content:\s*flex-start/);
    assert.match(todayOpening[1], /padding-block-start:\s*var\(--section-gap\)/);
    assert.match(todayOpening[1], /padding-block-end:\s*var\(--space-5\)/);
    assert.doesNotMatch(todayOpening[1], /border-block-end|background-image/);
  });

  it("does not render or style a duplicate practice summary", async () => {
    const html = await renderDashboard();
    const todayStyles = readFileSync(dashboardStylesPath, "utf8");

    assert.doesNotMatch(html, /practice-ledger|data-practice-status|Today's progress/);
    assert.doesNotMatch(todayStyles, /\.practice-ledger/);
  });

  it("removes the summary's client-side update path", () => {
    const appScript = readFileSync(appScriptPath, "utf8");

    assert.doesNotMatch(appScript, /practiceLedgerNodes|setPracticeStatus|answerWords|data-practice-status/);
  });

  it("removes the weekly answer strip", async () => {
    const html = await renderDashboard();

    assert.doesNotMatch(html, /This week/i);
    assert.doesNotMatch(html, /dashboard-current-week/);
    assert.doesNotMatch(html, /data-week-day/);
  });

  it("uses the Strong-question action surface for Bible reading", async () => {
    const html = await renderDashboard();

    // Both questions share one action surface. Asserted as "the reading group
    // carries the same surface classes as the Strong group" rather than as a
    // literal string, so the shared surface can gain a sticker without this
    // test claiming the two have diverged.
    const surfaceOf = (label) => {
      const group = html.match(new RegExp(`class="([^"]*dashboard-actions[^"]*)"[^>]*aria-label="${label}"`));
      assert.ok(group, `no action group for ${label}`);
      return group[1].split(/\s+/).filter((c) => c !== "reading-check-actions").sort();
    };
    assert.deepEqual(
      surfaceOf("Did you read the Bible today\\?"),
      surfaceOf("Daily action"),
      "the Bible question must reuse the Strong question's action surface",
    );
    assert.match(html, /class="[^"]*\breading-check-actions\b[^"]*"/);
    assert.match(html, /aria-label="Did you read the Bible today\?"/);
    assert.match(html, /class="dashboard-action dashboard-action-yes reading-action reading-action-yes"/);
    assert.match(html, /class="dashboard-action dashboard-action-no reading-action reading-action-no"/);
    assert.match(html, /class="dashboard-action-label">YES</);
    assert.match(html, /class="dashboard-action-label">NO</);
  });

  it("does not repeat the Bible question in a separate dashboard card", async () => {
    const html = await renderDashboard();

    assert.doesNotMatch(html, /reading-check-head/);
    assert.doesNotMatch(html, /<h2[^>]*>Did you read the Bible today\?<\/h2>/);
  });

  it("does not show a reading summary when the answer is NO", () => {
    const summary = renderReadingSummaryForStatus({ answeredToday: true, answer: "NO" });

    assert.equal(summary.hidden, true);
  });

  it("fills the selected Yes and No panels with their semantic colors", () => {
    const styles = readFileSync(dashboardStylesPath, "utf8");

    assert.match(styles, /\.dashboard-action-yes\s*{[^}]*--state-fill:\s*var\(--success\)/s);
    assert.match(styles, /\.dashboard-action-no\s*{[^}]*--state-fill:\s*var\(--danger\)/s);
    assert.match(
      styles,
      /\.dashboard-action-yes\[aria-pressed="true"\],\s*\.dashboard-action-no\[aria-pressed="true"\]\s*{[^}]*background:\s*var\(--state-fill\)[^}]*color:\s*var\(--white\)/s,
    );
  });

  it("keeps one source for the selected answer", () => {
    const styles = readFileSync(dashboardStylesPath, "utf8");
    const appScript = readFileSync(
      fileURLToPath(new URL("../public/scripts/app.js", import.meta.url)),
      "utf8",
    );

    assert.doesNotMatch(styles, /\.dashboard-action[\w-]*\.selected/, "no parallel class-based fill");
    assert.doesNotMatch(
      appScript,
      /(yesButton|noButton|readingYesButton|readingNoButton)\.classList\.toggle\("selected"/,
      "JS must not maintain a second selected marker",
    );
  });

  it("shows selected answers without decorative icons or an inset outline", async () => {
    const html = await renderDashboard();
    const styles = readFileSync(dashboardStylesPath, "utf8");
    const selectedRule = styles.match(
      /\.dashboard-action-yes\[aria-pressed="true"\],\s*\.dashboard-action-no\[aria-pressed="true"\]\s*{([^}]*)}/s,
    );

    assert.doesNotMatch(html, /dashboard-action-selected-icon/);
    assert.doesNotMatch(styles, /\.dashboard-action-selected-icon/);
    assert.ok(selectedRule, "selected answer styles exist");
    assert.doesNotMatch(selectedRule[1], /box-shadow/, "a selected answer casts no shadow");

    const borderValues = [...selectedRule[1].matchAll(/border(?:-[a-z]+)?\s*:\s*([^;]+)/g)]
      .map((match) => match[1].trim());

    assert.deepEqual(borderValues, ["0"], "a selected answer has no visible border");
  });
});
