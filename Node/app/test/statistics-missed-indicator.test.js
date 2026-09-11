import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import vm from "node:vm";
import ejs from "ejs";

import { resolveStreakView } from "../src/domain/streakViews.js";

const templatePath = fileURLToPath(
  new URL("../src/views/pages/partials/statistics-content.ejs", import.meta.url),
);
const appScriptPath = fileURLToPath(new URL("../public/scripts/app.js", import.meta.url));
const dashboardStylesPath = fileURLToPath(
  new URL("../public/styles/home/dashboard.css", import.meta.url),
);

function board(overrides = {}) {
  return {
    currentUserId: 7,
    overallBest: { id: 7, name: "Ann", value: 4 },
    leaders: [{
      rank: 1,
      id: 7,
      name: "Ann",
      value: 3,
      maxStreak: 4,
      inactiveDays: 0,
      isInactive: false,
      missedDays: { count: 2, nextDateKey: "2026-09-01" },
    }],
    ...overrides,
  };
}

function statisticsSummary() {
  const split = (yes, no) => {
    const total = yes + no;
    const yesSharePercentage = total > 0 ? Math.round((yes / total) * 100) : 0;
    return { yes, no, total, yesSharePercentage, noSharePercentage: total > 0 ? 100 - yesSharePercentage : 0 };
  };
  const weekdayChart = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, index) => ({
    label,
    longLabel: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][index],
    ...split(index === 0 ? 1 : 0, index === 0 ? 1 : 0),
  }));

  return {
    yourAnswers: split(1, 1),
    communityAnswers: split(1, 1),
    weekdayChart,
    weekdaySummary: {
      highest: { hasData: true, label: "Monday", shortLabel: "Mon", percentage: 50, total: 2 },
      lowest: { hasData: true, label: "Monday", shortLabel: "Mon", percentage: 50, total: 2 },
    },
    prayerWorld: {
      totalUsers: 1,
      activeRegion: "Riga",
      regions: [{ label: "Europe", count: 1, percentage: 100, isActive: true, x: 50, y: 40, pointScale: 1 }],
    },
  };
}

async function renderStatistics() {
  return ejs.renderFile(templatePath, {
    leaderboards: { recovery: board(), reading: board(), goals: board() },
    statistics: statisticsSummary(),
    activeStreak: resolveStreakView("strong"),
    siteData: { socialLinks: [] },
    t: () => "",
  });
}

function renderMissedTag(entry, currentUserId) {
  const source = readFileSync(appScriptPath, "utf8");
  const start = source.indexOf("function renderMissedDaysTag(entry)");
  assert.notEqual(start, -1);
  const end = source.indexOf("\nfunction userIcon(", start);
  assert.notEqual(end, -1);
  const escapeStart = source.indexOf("function escapeHtml(value)");
  const escapeEnd = source.indexOf("\nfunction ", escapeStart + 1);

  return vm.runInNewContext(
    `${source.slice(start, end)}\n${source.slice(escapeStart, escapeEnd)}\nrenderMissedDaysTag(entry);`,
    { entry, currentUserId },
  );
}

describe("statistics missed indicators", () => {
  it("still reports the missed count", async () => {
    const html = await renderStatistics();

    assert.match(html, /2 missed/);
    assert.doesNotMatch(html, /<button[^>]*>[^<]*2 missed/);
  });

  it("has no actionable missed-day control in the leaderboards", async () => {
    const html = await renderStatistics();

    assert.doesNotMatch(html, /data-missed-open/);
    assert.doesNotMatch(html, /<button[^>]*leaderboard-missed-tag/);
  });

  it("renders a non-interactive tag for the current user too", () => {
    const markup = renderMissedTag(
      { id: 7, missedDays: { count: 2, nextDateKey: "2026-09-01" } },
      7,
    );

    assert.match(markup, /leaderboard-missed-tag is-static/);
    assert.doesNotMatch(markup, /<button/);
    assert.doesNotMatch(markup, /data-missed-open/);
  });

  it("keeps user names dark and readable on the pale row hover", () => {
    const read = (file) => readFileSync(
      fileURLToPath(new URL(`../public/styles/${file}`, import.meta.url)),
      "utf8",
    );

    const tables = read("components/tables.css");
    const feed = read("components/feed.css");

    const owners = [
      ["components/tables.css", ".data-table a", tables.match(/\.data-table a\s*{([^}]*)}/)?.[1], tables.match(/\.data-table a:hover[^{]*{([^}]*)}/)?.[1]],
      ["components/feed.css", ".prayer-item-author", feed.match(/\.prayer-item-author\s*{([^}]*)}/)?.[1], feed.match(/\.prayer-item-author:hover[^{]*{([^}]*)}/)?.[1]],
    ];

    for (const [file, selector, base, hover] of owners) {
      assert.ok(base, `${file}: ${selector} has a base rule`);
      assert.ok(hover, `${file}: ${selector} has a hover rule`);
      assert.match(base, /color:\s*var\(--brand\)/, `${file}: ${selector} rests on the brand colour`);
      assert.match(hover, /color:\s*var\(--brand-hover\)/, `${file}: ${selector} darkens on hover`);
      assert.doesNotMatch(hover, /color:\s*var\(--white\)/, `${file}: ${selector} must never go white`);
    }

    const dashboard = readFileSync(dashboardStylesPath, "utf8");
    assert.doesNotMatch(
      dashboard.match(/\.user-link\s*{([^}]*)}/s)?.[1] || "",
      /color:/,
      "legacy dashboard.css must not own the username colour any more",
    );
  });
});
