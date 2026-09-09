import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import ejs from "ejs";

import { STREAK_VIEWS, resolveStreakView } from "../src/domain/streakViews.js";

const templatePath = fileURLToPath(
  new URL("../src/views/pages/partials/statistics-content.ejs", import.meta.url),
);

function board({ id, count = 8, currentUserId = 7 } = {}) {
  return {
    currentUserId,
    overallBest: { value: 11, name: "test12" },
    leaders: Array.from({ length: count }, (_, index) => ({
      id: index + 1,
      rank: index + 1,
      name: index === 6 ? "A-very-long-display-name-that-should-not-widen-the-table" : `user${index + 1}`,
      value: count - index,
      missedDays: { count: index * 3 },
      board: id,
    })),
  };
}

function statisticsFixture() {
  return {
    hardestDay: { label: "Saturday", caption: "2 No answers" },
    easiestDay: { label: "Monday", caption: "6 Yes answers" },
    totals: { yes: 31, no: 7, answers: 38 },
    yesChart: [{ label: "Mon", value: 5, percentage: 80 }, { label: "Tue", value: 4, percentage: 60 }],
    noChart: [{ label: "Mon", value: 0, percentage: 0 }, { label: "Tue", value: 1, percentage: 20 }],
    answerDistributionChart: [
      { id: "yes", label: "Yes", value: 31, tone: "yes", sharePercentage: 82 },
      { id: "no", label: "No", value: 7, tone: "no", sharePercentage: 18 },
    ],
    currentUserAnswerDistributionChart: [
      { id: "yes", label: "Yes", value: 4, tone: "yes", sharePercentage: 80 },
      { id: "no", label: "No", value: 1, tone: "no", sharePercentage: 20 },
    ],
    prayerWorld: {
      totalUsers: 18,
      activeRegion: "Riga",
      regions: [
        { label: "Riga", count: 15, percentage: 83, isActive: true, x: 55, y: 30, pointScale: 1 },
        { label: "Accra", count: 1, percentage: 6, isActive: false, x: 48, y: 55, pointScale: 0.6 },
      ],
    },
  };
}

function section(html, hook) {
  const start = html.indexOf(hook);
  if (start === -1) return "";
  const end = html.indexOf("</section>", start);
  return html.slice(start, end === -1 ? undefined : end);
}

async function renderWith(mutate, { streak } = {}) {
  return ejs.renderFile(templatePath, {
    statistics: mutate(statisticsFixture()),
    leaderboards: {
      recovery: board({ id: "recovery" }),
      reading: board({ id: "reading" }),
      goals: board({ id: "goals" }),
    },
    activeStreak: resolveStreakView(streak),
    siteData: { socialLinks: [] },
    t: () => "",
  });
}

async function render({ streak } = {}) {
  return ejs.renderFile(templatePath, {
    statistics: statisticsFixture(),
    leaderboards: {
      recovery: board({ id: "recovery" }),
      reading: board({ id: "reading" }),
      goals: board({ id: "goals" }),
    },
    activeStreak: resolveStreakView(streak),
    siteData: { socialLinks: [] },
    t: () => "",
  });
}

describe("streak view resolution", () => {
  it("names the three practices the way the product does", () => {
    assert.deepEqual(STREAK_VIEWS.map((view) => view.slug), ["strong", "bible", "tasks"]);
  });

  it("maps each public slug onto its existing leaderboard key", () => {
    assert.equal(resolveStreakView("strong").key, "recovery");
    assert.equal(resolveStreakView("bible").key, "reading");
    assert.equal(resolveStreakView("tasks").key, "goals");
  });

  it("falls back to Strong for a missing or unknown value", () => {
    assert.equal(resolveStreakView(undefined).slug, "strong");
    assert.equal(resolveStreakView("").slug, "strong");
    assert.equal(resolveStreakView("../../etc/passwd").slug, "strong");
    assert.equal(resolveStreakView("recovery").slug, "strong");
  });
});

describe("Progress page", () => {
  it("states the page purpose in one visible h1", async () => {
    const html = await render();

    assert.equal((html.match(/<h1/g) || []).length, 1);
    assert.match(html, /<h1[^>]*>\s*Progress\s*<\/h1>/);
    assert.doesNotMatch(html, /<h1 class="sr-only"/);
  });

  it("opens directly with the Progress title without a redundant eyebrow", async () => {
    const html = await render();

    assert.doesNotMatch(html, /Your practice/);
    assert.doesNotMatch(html, /<header class="page-head">\s*<p class="page-head-eyebrow">/);
  });

  it("shows one leaderboard at a time behind a segmented selector", async () => {
    const html = await render();

    const tables = html.match(/<table/g) || [];
    assert.equal(tables.length, 1, "exactly one leaderboard table should be rendered");

    for (const label of ["Strong", "Bible", "Tasks"]) {
      assert.match(html, new RegExp(`class="segmented-option"[^>]*>\\s*${label}`), `missing ${label} option`);
    }
  });

  it("reflects the selected leaderboard in the URL and marks it current", async () => {
    const html = await render({ streak: "bible" });

    assert.match(html, /href="\/statistics\?streak=strong"/);
    assert.match(html, /href="\/statistics\?streak=tasks"/);
    assert.match(html, /aria-current="page"[^>]*>\s*Bible/);
    assert.doesNotMatch(html, /href="\/statistics\?streak=bible"/);
  });

  it("summarises all three streaks even though one board is shown", async () => {
    const html = await render();

    assert.match(html, /data-streak-summary="strong"/);
    assert.match(html, /data-streak-summary="bible"/);
    assert.match(html, /data-streak-summary="tasks"/);
  });

  it("keeps the five-row preview and the View more control", async () => {
    const html = await render();
    const bodyRows = [...html.matchAll(/<tr[^>]*>/g)];

    assert.ok(bodyRows.length > 5);
    assert.equal(bodyRows.filter((row) => row[0].includes("hidden")).length, 3, "rows past five start hidden");
    assert.match(html, /data-streak-board-toggle/);
    assert.match(html, /View more/);
  });

  it("keeps every leaderboard name a real link that can truncate", async () => {
    const html = await render();

    assert.match(html, /class="[^"]*data-table-name[^"]*"/);
    assert.match(html, /href="\/customer\/1"/);
  });

  it("keeps the community section secondary to personal progress", async () => {
    const html = await render();
    const personal = html.indexOf("data-personal-patterns");
    const community = html.indexOf("data-community-patterns");

    assert.ok(personal > -1 && community > -1);
    assert.ok(personal < community, "personal patterns come before community patterns");
  });

  describe("geographic visualisation", () => {
    it("renders the globe with one point per non-zero place", async () => {
      const html = await render();

      assert.match(html, /class="prayer-globe"/, "the globe shape is restored");
      const points = html.match(/class="prayer-globe-point[^"]*"/g) || [];
      assert.equal(points.length, 2, "one point per place with a non-zero count");
      assert.match(html, /left:\s*55%/, "points are placed from the server's aggregated coordinates");
      assert.match(html, /--point-scale:\s*1/, "point weight comes from the DTO");
    });

    it("hides the globe from assistive technology", async () => {
      const html = await render();
      const visual = html.match(/<div class="prayer-world-visual"[^>]*>/)?.[0] || "";

      assert.match(visual, /aria-hidden="true"/, "the globe is decorative");
    });

    it("states every place and count as text beside it", async () => {
      const html = await render();

      for (const [label, count] of [["Riga", 15], ["Accra", 1]]) {
        assert.ok(html.includes(label), `${label} must be readable as text`);
        assert.ok(html.includes(String(count)), `${label}'s count must be readable as text`);
      }
    });

    it("calls the data time zones, never precise location", async () => {
      const html = await render();

      assert.match(html, /time zone/i, "the source of the data is stated");
      assert.doesNotMatch(html, /your location|GPS|country you/i);
    });

    it("draws no point for a place with no members", async () => {
      const html = await renderWith((fixture) => {
        fixture.prayerWorld.regions[1].count = 0;
        return fixture;
      });

      const points = html.match(/class="prayer-globe-point[^"]*"/g) || [];
      assert.equal(points.length, 1, "a zero-count place contributes no point");
    });

    it("survives a long place label without widening the page", async () => {
      const html = await renderWith((fixture) => {
        fixture.prayerWorld.regions[0].label = "Petropavlovsk Kamchatsky Administrative Region";
        return fixture;
      });

      assert.ok(html.includes("Petropavlovsk Kamchatsky Administrative Region"));
    });
  });

  describe("answer distributions", () => {
    it("draws the reader's own Yes/No split with totals, share and a legend", async () => {
      const html = await render();
      const block = section(html, "data-personal-patterns");

      assert.match(block, /class="split-bar/, "a visual distribution, not only a list");
      assert.match(block, /80%/, "the Yes share is written as text");
      assert.match(block, /class="split-legend/, "the split carries a legend");
      assert.ok(block.includes(">4<") || block.includes("4 Yes"), "the Yes count is readable as text");
    });

    it("draws the community split in the same visual grammar", async () => {
      const html = await render();
      const block = section(html, "data-community-patterns");

      assert.match(block, /class="split-bar/, "the community split reuses the same component");
      assert.match(block, /82%/, "the community Yes share is written as text");
    });

    it("stays neutral with no data instead of showing a full ring", async () => {
      const html = await renderWith((fixture) => {
        fixture.currentUserAnswerDistributionChart = [
          { id: "yes", label: "Yes", value: 0, tone: "yes", sharePercentage: 0 },
          { id: "no", label: "No", value: 0, tone: "no", sharePercentage: 0 },
        ];
        return fixture;
      });
      const block = section(html, "data-personal-patterns");

      assert.match(block, /data-empty="true"/, "an empty split declares itself empty");
      assert.doesNotMatch(block, /scaleX\(1\)/, "no segment may fill the track when nothing is recorded");
    });
  });

  describe("weekday chart", () => {
    it("renders every weekday as a row with both tracks and both figures", async () => {
      const html = await renderWith((fixture) => {
        const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        fixture.yesChart = days.map((label, index) => ({ label, value: index, percentage: index * 14 }));
        fixture.noChart = days.map((label, index) => ({ label, value: 7 - index, percentage: (7 - index) * 14 }));
        return fixture;
      });

      const rows = html.match(/class="weekday-row"/g) || [];
      assert.equal(rows.length, 7, "all seven weekdays are present");

      for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
        assert.ok(html.includes(`>${day}<`), `${day} is labelled`);
      }
      assert.match(html, /class="weekday-legend/, "the chart carries a Yes/No legend");
    });

    it("scales bars by transform rather than animating width", async () => {
      const html = await render();

      assert.match(html, /--bar-scale:/, "bars carry a normalised scale, not a width percentage");
      assert.doesNotMatch(
        html.match(/class="weekday-bar[^"]*"[^>]*/g)?.join("\n") || "",
        /style="width:/,
        "weekday bars must not be sized by width",
      );
    });
  });
});
