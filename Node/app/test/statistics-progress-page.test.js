import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import ejs from "ejs";

import { STREAK_VIEWS, resolveStreakView } from "../src/domain/streakViews.js";

const templatePath = fileURLToPath(
  new URL("../src/views/pages/partials/statistics-content.ejs", import.meta.url),
);

const pageStyles = readFileSync(
  new URL("../public/styles/pages/statistics.css", import.meta.url),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

const tableStyles = readFileSync(
  new URL("../public/styles/components/tables.css", import.meta.url),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

function rule(selector) {
  const match = pageStyles.match(
    new RegExp(`(?:^|[,{}])\\s*${selector.replace(/[.[\]()+*]/g, "\\$&")}\\s*(?:,[^{]*)?\\{([^}]*)\\}`, "m"),
  );
  return match?.[1] || "";
}

function mediaBlock(query) {
  const match = pageStyles.match(
    new RegExp(`@media\\s*\\(${query}\\)\\s*\\{((?:[^{}]|\\{[^{}]*\\})*)\\}`),
  );
  return match?.[1] || "";
}

function tableMediaBlock(query) {
  const match = tableStyles.match(
    new RegExp(`@media\\s*\\(${query}\\)\\s*\\{((?:[^{}]|\\{[^{}]*\\})*)\\}`),
  );
  return match?.[1] || "";
}

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

function weekday(label, longLabel, yes, no) {
  const total = yes + no;
  const yesSharePercentage = total > 0 ? Math.round((yes / total) * 100) : 0;
  return {
    label,
    longLabel,
    yes,
    no,
    total,
    yesSharePercentage,
    noSharePercentage: total > 0 ? 100 - yesSharePercentage : 0,
  };
}

function statisticsFixture() {
  return {
    yourAnswers: { yes: 4, no: 1, total: 5, yesSharePercentage: 80, noSharePercentage: 20 },
    communityAnswers: { yes: 34, no: 8, total: 42, yesSharePercentage: 81, noSharePercentage: 19 },
    weekdayChart: [
      weekday("Mon", "Monday", 5, 0),
      weekday("Tue", "Tuesday", 5, 1),
      weekday("Wed", "Wednesday", 5, 0),
      weekday("Thu", "Thursday", 4, 1),
      weekday("Fri", "Friday", 1, 3),
      weekday("Sat", "Saturday", 6, 2),
      weekday("Sun", "Sunday", 0, 0),
    ],
    weekdaySummary: {
      highest: { hasData: true, label: "Monday", shortLabel: "Mon", percentage: 100, total: 5 },
      lowest: { hasData: true, label: "Friday", shortLabel: "Fri", percentage: 25, total: 4 },
    },
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

function emptyStatisticsFixture() {
  return {
    yourAnswers: { yes: 0, no: 0, total: 0, yesSharePercentage: 0, noSharePercentage: 0 },
    communityAnswers: { yes: 0, no: 0, total: 0, yesSharePercentage: 0, noSharePercentage: 0 },
    weekdayChart: [
      weekday("Mon", "Monday", 0, 0),
      weekday("Tue", "Tuesday", 0, 0),
      weekday("Wed", "Wednesday", 0, 0),
      weekday("Thu", "Thursday", 0, 0),
      weekday("Fri", "Friday", 0, 0),
      weekday("Sat", "Saturday", 0, 0),
      weekday("Sun", "Sunday", 0, 0),
    ],
    weekdaySummary: {
      highest: { hasData: false, label: "Not enough data yet", shortLabel: "Not enough data yet", percentage: 0, total: 0 },
      lowest: { hasData: false, label: "Not enough data yet", shortLabel: "Not enough data yet", percentage: 0, total: 0 },
    },
    prayerWorld: { totalUsers: 0, activeRegion: "Not enough data", regions: [] },
  };
}

function block(html, hook) {
  const start = html.indexOf(hook);
  if (start === -1) return "";
  const open = html.lastIndexOf("<", start);
  let depth = 0;
  for (let index = open; index < html.length; index += 1) {
    if (html.startsWith("<div", index)) depth += 1;
    if (html.startsWith("</div>", index)) {
      depth -= 1;
      if (depth === 0) return html.slice(open, index + 6);
    }
  }
  return html.slice(open);
}

function figure(html, hook) {
  const start = html.indexOf(hook);
  if (start === -1) return "";
  const open = html.lastIndexOf("<figure", start);
  const end = html.indexOf("</figure>", start);
  return html.slice(open === -1 ? start : open, end === -1 ? undefined : end + 9);
}

function renderWith(mutate, { streak, fixture = statisticsFixture } = {}) {
  return ejs.renderFile(templatePath, {
    statistics: mutate(fixture()),
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

function render({ streak } = {}) {
  return renderWith((fixture) => fixture, { streak });
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

  it("keeps the approved page order from streaks to footer", async () => {
    const html = await render();
    const order = [
      html.indexOf("<h1"),
      html.indexOf('id="streak-summary-title"'),
      html.indexOf('id="leaderboard-title"'),
      html.indexOf('id="answers-title"'),
      html.indexOf('class="section footer-info"'),
    ];

    assert.ok(order.every((index) => index > -1), `every landmark must render: ${order}`);
    assert.deepEqual(order, [...order].sort((first, second) => first - second), "page order changed");
  });

  it("descends heading levels without skipping one", async () => {
    const html = await render();
    const levels = [...html.matchAll(/<h([1-6])[^>]*>/g)].map((match) => Number(match[1]));

    assert.deepEqual(levels.slice(0, 4), [1, 2, 2, 2], "the page owns h1 and its sections own h2");
    for (let index = 1; index < levels.length; index += 1) {
      assert.ok(levels[index] - levels[index - 1] <= 1, `heading jumped from h${levels[index - 1]} to h${levels[index]}`);
    }
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

  it("labels the answer statistics with the selected table and its real scope", async () => {
    const html = await render({ streak: "bible" });

    assert.match(html, /data-statistics-source="reading"/);
    assert.match(
      html,
      /id="answers-title">Answer patterns<\/h2>[\s\S]*?class="section-head-note">Bible · all recorded answers<\/span>/,
      "the section names the practice and says the data is all-time",
    );
  });

  it("never implies the answer data is one week, month or year", async () => {
    const html = await render();

    assert.match(html, /all recorded answers/, "the scope is stated in words");
    assert.doesNotMatch(html, /this week|this month|this year|last 7 days|past week/i);
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
    assert.ok(personal < html.indexOf("data-weekday-chart"), "personal data precedes the weekday chart");
    assert.ok(personal < html.indexOf("data-prayer-world"), "personal data precedes the time zones");
  });

  it("uses no ranking, blaming or predictive language about a weekday", async () => {
    const html = await render();

    assert.doesNotMatch(html, /\b(easiest|hardest|easy|hard|best day|worst)\b/i);
    assert.doesNotMatch(html, /Yes rate|failure|slip|relapse risk|you should|you will|likely to/i);
  });

  describe("distribution comparison", () => {
    it("wraps the comparison in one labelled figure with a stated scope", async () => {
      const html = await render();
      const chart = figure(html, "data-answer-comparison");

      assert.match(chart, /<figcaption/, "the figure is captioned");
      assert.match(chart, /Your answers and the community/, "the figure has a plain visible title");
      assert.match(chart, /aria-labelledby="answer-comparison-title"/, "the figure is named by its title");
      assert.match(chart, /Strong · all recorded answers/, "the subtitle names the practice and the scope");
    });

    it("puts Your answers first and the community second", async () => {
      const chart = figure(await render(), "data-answer-comparison");
      const yours = chart.indexOf("data-personal-patterns");
      const community = chart.indexOf("data-community-patterns");

      assert.ok(yours > -1 && community > -1, "both panels are inside the one figure");
      assert.ok(yours < community);
      assert.ok(chart.indexOf("Your answers<") < chart.indexOf("Community<"));
    });

    it("gives both panels the same chart grammar", async () => {
      const chart = figure(await render(), "data-answer-comparison");
      const yours = block(chart, "data-personal-patterns");
      const community = block(chart, "data-community-patterns");

      for (const [name, panel] of [["your", yours], ["community", community]]) {
        assert.match(panel, /class="answer-panel-percent"/, `${name} shows one direct Yes percentage`);
        assert.match(panel, /class="ledger-track"/, `${name} uses the shared 100% track`);
        assert.match(panel, /ledger-track-segment--yes/, `${name} paints Yes`);
        assert.match(panel, /ledger-track-segment--no/, `${name} paints No`);
        assert.match(panel, /class="answer-panel-values"/, `${name} prints its exact counts`);
      }
    });

    it("prints the reader's own percentage, counts and total as text", async () => {
      const yours = block(figure(await render(), "data-answer-comparison"), "data-personal-patterns");

      assert.match(yours, />80%</, "the Yes share is written as text");
      assert.match(yours, /4 Yes · 1 No · 5 total/, "every exact value is readable without the bar");
    });

    it("prints the community percentage, counts and total as text", async () => {
      const community = block(figure(await render(), "data-answer-comparison"), "data-community-patterns");

      assert.match(community, />81%</);
      assert.match(community, /34 Yes · 8 No · 42 total/);
    });

    it("paints each track from the server's shares, which always sum to 100", async () => {
      const chart = figure(await render(), "data-answer-comparison");
      const scales = [...chart.matchAll(/--bar-scale:\s*([\d.]+)/g)].map((match) => Number(match[1]));

      assert.deepEqual(scales, [0.8, 0.2, 0.81, 0.19], "each panel paints Yes then No on one 100% scale");
    });

    it("marks the boundary between the two segments with a paper separator", async () => {
      const chart = figure(await render(), "data-answer-comparison");
      const edges = [...chart.matchAll(/class="ledger-track-edge"[^>]*--edge-at:\s*(\d+)%/g)].map((m) => m[1]);

      assert.deepEqual(edges, ["80", "81"], "the separator sits exactly where the Yes share ends");
    });

    it("hides only the decorative track from assistive technology", async () => {
      const chart = figure(await render(), "data-answer-comparison");

      for (const [track] of chart.matchAll(/<span class="ledger-track"[^>]*>/g)) {
        assert.match(track, /aria-hidden="true"/, "the painted track duplicates visible text");
      }
      assert.doesNotMatch(chart, /<p[^>]*aria-hidden/, "no value may be hidden from assistive technology");
    });

    it("stays neutral and useful with no personal data instead of drawing a full bar", async () => {
      const html = await renderWith((fixture) => {
        fixture.yourAnswers = { yes: 0, no: 0, total: 0, yesSharePercentage: 0, noSharePercentage: 0 };
        return fixture;
      });
      const yours = block(figure(html, "data-answer-comparison"), "data-personal-patterns");

      assert.match(yours, /data-empty="true"/, "an empty track declares itself empty");
      assert.deepEqual(
        [...yours.matchAll(/--bar-scale: ([\d.]+)/g)].map((match) => Number(match[1])),
        [0, 0],
        "no segment may be painted",
      );
      assert.doesNotMatch(yours, /class="answer-panel-percent"/, "0% of nothing is not a percentage");
      assert.match(yours, /No answers recorded yet/, "the empty state says what is missing");
      assert.match(yours, /Strong/, "and what will make the panel appear");
    });

    it("keeps the community panel honest when nobody has answered", async () => {
      const html = await renderWith((fixture) => fixture, { fixture: emptyStatisticsFixture });
      const community = block(figure(html, "data-answer-comparison"), "data-community-patterns");

      assert.match(community, /data-empty="true"/);
      assert.doesNotMatch(community, /100%/, "an empty community must never read as 100%");
    });
  });

  describe("weekday chart", () => {
    it("wraps the weekday rows in one labelled figure that states its scope", async () => {
      const chart = figure(await render(), "data-weekday-chart");

      assert.match(chart, /Community rhythm by weekday/);
      assert.match(chart, /aria-labelledby="weekday-chart-title"/);
      assert.match(chart, /Strong · all recorded answers/);
    });

    it("states the highest and lowest recorded Yes share with both samples", async () => {
      const chart = figure(await render(), "data-weekday-chart");

      assert.match(chart, /Highest recorded Yes share: Monday, 100% of 5 answers/);
      assert.match(chart, /Lowest recorded Yes share: Friday, 25% of 4 answers/);
    });

    it("renders all seven weekdays in Monday to Sunday order", async () => {
      const chart = figure(await render(), "data-weekday-chart");
      const rows = chart.match(/class="weekday-row"/g) || [];

      assert.equal(rows.length, 7, "all seven weekdays are present");
      const longLabels = [...chart.matchAll(/class="weekday-label-long">([^<]+)</g)].map((match) => match[1]);
      assert.deepEqual(longLabels, ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
    });

    it("carries a deliberate three-letter abbreviation beside the full weekday", async () => {
      const chart = figure(await render(), "data-weekday-chart");
      const shortLabels = [...chart.matchAll(/class="weekday-label-short"[^>]*>([^<]+)</g)].map((match) => match[1]);

      assert.deepEqual(shortLabels, ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
      for (const [tag] of chart.matchAll(/<span class="weekday-label-short"[^>]*>/g)) {
        assert.match(tag, /aria-hidden="true"/, "the abbreviation repeats the full label");
      }
    });

    it("prints Yes, No, total and the Yes share for every non-empty weekday", async () => {
      const chart = figure(await render(), "data-weekday-chart");

      assert.match(chart, />5 Yes · 0 No · 5 total</);
      assert.match(chart, />6 Yes · 2 No · 8 total</);
      assert.match(chart, /class="weekday-share">75%/, "Saturday's share is printed, not only painted");
    });

    it("puts every weekday on one shared 0 to 100 composition scale", async () => {
      const chart = figure(await render(), "data-weekday-chart");
      const rows = chart.split('class="weekday-row"').slice(1);

      assert.equal(rows.length, 7);
      for (const [index, row] of rows.entries()) {
        const scales = [...row.matchAll(/--bar-scale:\s*([\d.]+)/g)].map((match) => Number(match[1]));
        assert.equal(scales.length, 2, `row ${index} paints exactly Yes and No`);
        const painted = Math.round((scales[0] + scales[1]) * 100);
        assert.ok(painted === 100 || painted === 0, `row ${index} paints ${painted}% of its track`);
      }
    });

    it("shows a neutral track and plain words for a weekday with no answers", async () => {
      const chart = figure(await render(), "data-weekday-chart");
      const sunday = chart.split('class="weekday-row"').at(-1);

      assert.match(sunday, /data-empty="true"/);
      assert.match(sunday, />No answers</);
      assert.deepEqual(
        [...sunday.matchAll(/--bar-scale: ([\d.]+)/g)].map((match) => Number(match[1])),
        [0, 0],
        "an empty weekday paints nothing",
      );
      assert.doesNotMatch(sunday, /0%/, "a weekday with no answers has no Yes share");
    });

    it("says what is missing when no weekday has any answer", async () => {
      const html = await renderWith((fixture) => fixture, { fixture: emptyStatisticsFixture });
      const chart = figure(html, "data-weekday-chart");

      assert.match(chart, /No answers recorded yet/);
      assert.doesNotMatch(chart, /Highest recorded Yes share/, "there is no share to name");
      assert.doesNotMatch(chart, /100%/);
    });

    it("scales bars by transform rather than animating width", async () => {
      const html = await render();

      assert.match(html, /--bar-scale:/, "bars carry a normalised scale, not a width percentage");
      assert.doesNotMatch(
        html.match(/class="ledger-track-segment[^"]*"[^>]*/g)?.join("\n") || "",
        /style="width:/,
        "track segments must not be sized by width",
      );
    });
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

    it("states every place, count and share as text beside it", async () => {
      const html = await render();

      for (const [label, count, share] of [["Riga", 15, 83], ["Accra", 1, 6]]) {
        assert.ok(html.includes(label), `${label} must be readable as text`);
        assert.match(html, new RegExp(`class="prayer-world-region-count">${count}<`), `${label}'s count is text`);
        assert.match(html, new RegExp(`class="prayer-world-region-share">${share}%<`), `${label}'s share is text`);
      }
    });

    it("puts the time-zone list before the globe in reading order", async () => {
      const html = await render();

      assert.ok(
        html.indexOf("prayer-world-regions") < html.indexOf("prayer-world-visual"),
        "the accessible source comes before the decoration",
      );
    });

    it("calls the data time zones, never precise location", async () => {
      const html = await render();

      assert.match(html, /time zone/i, "the source of the data is stated");
      assert.match(html, /does not track anyone's location/);
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

    it("keeps a truthful empty state when no time zone is recorded", async () => {
      const html = await renderWith((fixture) => fixture, { fixture: emptyStatisticsFixture });

      assert.match(html, /No time zones recorded yet/);
      assert.equal((html.match(/class="prayer-globe-point[^"]*"/g) || []).length, 0);
    });
  });
});

describe("Progress page visual system", () => {
  it("paints each stacked leaderboard row as one continuous mobile surface", () => {
    const narrow = tableMediaBlock("max-width: 560px");

    assert.match(
      narrow,
      /\.data-table--stack tbody tr \+ tr th,\s*\.data-table--stack tbody tr \+ tr td\s*\{[^}]*border:\s*0/,
      "cell separators must not break the row rule into three short lines",
    );
    assert.match(
      narrow,
      /\.data-table--stack tbody tr\[data-current-user\]\s*\{[^}]*background:\s*var\(--surface-subtle\)/,
      "the current-user tint must cover the row padding and grid gaps",
    );
  });

  it("encodes Yes as solid ink and No as the same colour under a hatch", () => {
    assert.match(rule(".ledger-track-segment--yes"), /background:\s*var\(--success\)/);
    assert.match(rule(".ledger-track-segment--no"), /background:\s*var\(--danger\)/);
    assert.match(rule(".ledger-track-hatch"), /background-image:\s*var\(--ledger-hatch\)/);
    assert.match(pageStyles, /--ledger-hatch:\s*repeating-linear-gradient\(\s*135deg/, "the texture is a diagonal hatch");
  });

  it("repeats the solid and hatch distinction in the legend swatches", () => {
    const yes = rule(".ledger-legend-item--yes::before");
    const no = rule(".ledger-legend-item--no::before");

    assert.match(yes, /background:\s*var\(--success\)/);
    assert.doesNotMatch(yes, /background-image/, "the Yes swatch stays solid");
    assert.match(no, /background-color:\s*var\(--danger\)/);
    assert.match(no, /background-image:\s*var\(--ledger-hatch\)/);
  });

  it("paints the hatch at one pitch whatever share the segment carries", () => {
    assert.match(
      rule(".ledger-track-hatch"),
      /transform:\s*scaleX\(calc\(1 \/ max\(var\(--bar-scale/,
      "the hatch carries the inverse of the segment scale",
    );
  });

  it("marks the Yes/No boundary with a 1 to 2px paper separator", () => {
    const edge = rule(".ledger-track-edge");
    const width = Number(edge.match(/width:\s*(\d+)px/)?.[1]);

    assert.ok(width >= 1 && width <= 2, `the separator is ${width}px`);
    assert.match(edge, /background:\s*var\(--paper\)/, "the boundary is a sliver of paper");
    assert.match(edge, /inset-inline-start:\s*var\(--edge-at/, "it sits where the server says Yes ends");
  });

  it("gives every track the same 14 to 18px ledger height", () => {
    const height = Number(pageStyles.match(/--ledger-track-height:\s*(\d+)px/)?.[1]);
    const timezone = Number(rule(".prayer-world-region-track").match(/height:\s*(\d+)px/)?.[1]);

    for (const [name, value] of [["ledger", height], ["time zone", timezone]]) {
      assert.ok(value >= 14 && value <= 18, `the ${name} track is ${value}px`);
    }
  });

  it("compares the two panels side by side, then stacks them in the same order", () => {
    assert.match(rule(".answer-compare"), /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(rule(".answer-compare"), /align-items:\s*start/, "an empty panel is not stretched to match");
    assert.match(mediaBlock("max-width: 620px"), /\.answer-compare \{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
    assert.doesNotMatch(pageStyles, /\.answer-panel[^{]*\{[^}]*order:/, "CSS order must not resequence the comparison");
  });

  it("abbreviates the weekday deliberately and keeps the full name for assistive tech", () => {
    assert.match(rule(".weekday-label-short"), /display:\s*none/, "the abbreviation is the narrow-width form");
    const narrow = mediaBlock("max-width: 760px");

    assert.match(narrow, /\.weekday-label-long \{[^}]*position:\s*absolute/, "the full name is hidden, never clipped");
    assert.match(narrow, /\.weekday-label-long \{[^}]*clip:\s*rect\(0, 0, 0, 0\)/);
    assert.match(narrow, /\.weekday-label-short \{[^}]*display:\s*inline/);
    assert.doesNotMatch(pageStyles, /\.weekday-label[^{]*\{[^}]*overflow:\s*hidden;[^}]*max-width:\s*2\.6em/, "no mid-word clipping");
  });

  it("keeps the time-zone list before the globe with no CSS reordering", () => {
    assert.doesNotMatch(pageStyles, /\.prayer-world-visual[^{]*\{[^}]*order:/, "the globe must never be pulled above its data");
    assert.match(mediaBlock("max-width: 880px"), /\.prayer-world-layout \{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  });

  it("keeps the globe secondary at both the desktop and mobile sizes", () => {
    const desktop = Number(rule(".prayer-globe").match(/width:\s*min\((\d+)px/)?.[1]);
    const mobile = Number(mediaBlock("max-width: 880px").match(/\.prayer-globe \{[^}]*width:\s*min\((\d+)px/)?.[1]);

    assert.ok(desktop >= 220 && desktop <= 240, `the desktop globe is ${desktop}px`);
    assert.ok(mobile >= 168 && mobile <= 192, `the mobile globe is ${mobile}px`);
  });

  it("strengthens marks under prefers-contrast rather than only recolouring text", () => {
    const contrast = mediaBlock("prefers-contrast: more");

    assert.match(contrast, /\.ledger-track,[\s\S]*?box-shadow:\s*inset 0 0 0 1px var\(--ink\)/, "the plot region gains a real edge");
    assert.match(contrast, /--ledger-hatch:\s*repeating-linear-gradient/, "the hatch itself gets denser");
    assert.doesNotMatch(contrast, /\.weekday-bar-yes/, "the old rule recoloured a mark painted with background");
  });

  it("keeps the two series apart under forced colours", () => {
    const forced = mediaBlock("forced-colors: active");

    assert.match(forced, /forced-color-adjust:\s*none/, "the marks opt out of the forced mapping");
    assert.match(forced, /\.ledger-track-segment--yes,[\s\S]*?background:\s*CanvasText/, "Yes stays solid");
    assert.match(forced, /\.ledger-track-segment--no \{[^}]*background:\s*Canvas/, "No becomes the hatched outline");
    assert.match(forced, /\.ledger-track-hatch \{[^}]*repeating-linear-gradient\(135deg, CanvasText/);
  });

  it("uses no chart shape the data cannot support", () => {
    assert.doesNotMatch(pageStyles, /\b(?:donut|pie|radial-gauge|conic-gradient)\b/, "no angle-based encoding");
    assert.doesNotMatch(pageStyles, /perspective|rotate3d|translateZ/, "no 3D chart");
  });
});
