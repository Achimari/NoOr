import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildWeekdayChart,
  buildWeekdaySummary,
  toAnswerSplit,
} from "../src/services/statisticsService.js";

// 2026-09-07 is a Monday, so an offset from it names a weekday directly.
const MONDAY = Date.UTC(2026, 8, 7);

function dateKey(dayOffset) {
  return new Date(MONDAY + dayOffset * 86_400_000).toISOString().slice(0, 10);
}

function answers(dayOffset, { yes = 0, no = 0 } = {}) {
  return [
    ...Array.from({ length: yes }, () => ({ dateKey: dateKey(dayOffset), answer: "YES" })),
    ...Array.from({ length: no }, () => ({ dateKey: dateKey(dayOffset), answer: "NO" })),
  ];
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

describe("answer split", () => {
  it("derives the No share from the Yes share so the pair always sums to 100", () => {
    // 3/8 rounds to 38 and 5/8 rounds to 63; rounding each independently paints 101%.
    const split = toAnswerSplit(3, 5);

    assert.equal(split.yesSharePercentage, 38);
    assert.equal(split.noSharePercentage, 62);
    assert.equal(split.yesSharePercentage + split.noSharePercentage, 100);
  });

  it("keeps both shares at zero when nothing is recorded", () => {
    assert.deepEqual(toAnswerSplit(0, 0), {
      yes: 0,
      no: 0,
      total: 0,
      yesSharePercentage: 0,
      noSharePercentage: 0,
    });
  });

  it("reports a whole-number share for a one-sided split", () => {
    assert.deepEqual(toAnswerSplit(4, 0), {
      yes: 4,
      no: 0,
      total: 4,
      yesSharePercentage: 100,
      noSharePercentage: 0,
    });
    assert.deepEqual(toAnswerSplit(0, 3), {
      yes: 0,
      no: 3,
      total: 3,
      yesSharePercentage: 0,
      noSharePercentage: 100,
    });
  });
});

describe("community weekday chart", () => {
  it("counts every weekday in natural Monday to Sunday order", () => {
    const chart = buildWeekdayChart(WEEKDAYS.flatMap((_, index) => answers(index, { yes: index + 1 })));

    assert.deepEqual(chart.map((day) => day.label), WEEKDAYS);
    assert.deepEqual(
      chart.map((day) => day.longLabel),
      ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    );
    assert.deepEqual(chart.map((day) => day.yes), [1, 2, 3, 4, 5, 6, 7]);
  });

  it("paints one composition scale: unequal counts still sum to 100", () => {
    const [monday] = buildWeekdayChart(answers(0, { yes: 6, no: 2 }));

    assert.equal(monday.yes, 6);
    assert.equal(monday.no, 2);
    assert.equal(monday.total, 8);
    assert.equal(monday.yesSharePercentage, 75);
    assert.equal(monday.noSharePercentage, 25);
    assert.equal(monday.yesSharePercentage + monday.noSharePercentage, 100);
  });

  it("leaves a weekday with no answers neutral rather than full", () => {
    const chart = buildWeekdayChart(answers(0, { yes: 2 }));
    const tuesday = chart[1];

    assert.equal(tuesday.total, 0);
    assert.equal(tuesday.yesSharePercentage, 0);
    assert.equal(tuesday.noSharePercentage, 0);
  });

  it("ignores an unparseable date instead of miscounting it", () => {
    const chart = buildWeekdayChart([
      { dateKey: "not-a-date", answer: "YES" },
      { dateKey: dateKey(0), answer: "YES" },
    ]);

    assert.equal(chart.reduce((total, day) => total + day.total, 0), 1);
  });
});

describe("community weekday summary", () => {
  it("names the highest recorded Yes share, not the highest Yes count", () => {
    // Saturday records the most Yes answers; Monday records the highest share.
    const chart = buildWeekdayChart([
      ...answers(0, { yes: 5, no: 0 }),
      ...answers(5, { yes: 9, no: 3 }),
      ...answers(4, { yes: 1, no: 3 }),
    ]);
    const summary = buildWeekdaySummary(chart);

    assert.equal(summary.highest.label, "Monday");
    assert.equal(summary.highest.percentage, 100);
    assert.equal(summary.highest.total, 5);
    assert.equal(summary.lowest.label, "Friday");
    assert.equal(summary.lowest.percentage, 25);
    assert.equal(summary.lowest.total, 4);
  });

  it("breaks a tie by natural weekday order, whichever way the data arrives", () => {
    const rows = [
      ...answers(2, { yes: 3, no: 1 }),
      ...answers(0, { yes: 6, no: 2 }),
      ...answers(6, { yes: 1, no: 3 }),
      ...answers(3, { yes: 1, no: 3 }),
    ];
    const forwards = buildWeekdaySummary(buildWeekdayChart(rows));
    const backwards = buildWeekdaySummary(buildWeekdayChart([...rows].reverse()));

    assert.equal(forwards.highest.label, "Monday", "Monday and Wednesday both record 75%");
    assert.equal(forwards.lowest.label, "Thursday", "Thursday and Sunday both record 25%");
    assert.deepEqual(backwards, forwards, "row order must not move the summary");
  });

  it("skips empty weekdays when choosing the lowest share", () => {
    const summary = buildWeekdaySummary(buildWeekdayChart([
      ...answers(0, { yes: 4, no: 0 }),
      ...answers(3, { yes: 1, no: 1 }),
    ]));

    assert.equal(summary.lowest.label, "Thursday");
    assert.equal(summary.lowest.percentage, 50);
    assert.equal(summary.lowest.total, 2);
  });

  it("says what is missing when no weekday has an answer", () => {
    const summary = buildWeekdaySummary(buildWeekdayChart([]));

    assert.equal(summary.highest.hasData, false);
    assert.equal(summary.lowest.hasData, false);
    assert.equal(summary.highest.label, "Not enough data yet");
    assert.equal(summary.lowest.label, "Not enough data yet");
  });

  it("carries the sample size beside every share it states", () => {
    const summary = buildWeekdaySummary(buildWeekdayChart(answers(5, { yes: 6, no: 2 })));

    assert.equal(summary.highest.hasData, true);
    assert.equal(summary.highest.percentage, 75);
    assert.equal(summary.highest.total, 8, "a share is meaningless without its sample");
    assert.deepEqual(summary.lowest, summary.highest, "one recorded weekday is both ends");
  });
});
