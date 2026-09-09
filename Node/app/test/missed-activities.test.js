import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MISSED_ACTIVITY_ORDER,
  assertHistoricalDateKey,
  buildMissedActivityItems,
  collectMissedDateKeys,
  isCalendarDateKey,
} from "../src/services/missedActivityService.js";
import { missedActivitiesPageSchema } from "../src/validators/missedActivityValidators.js";

function statusOf(run) {
  try {
    run();
  } catch (error) {
    return { statusCode: error.statusCode, message: error.message };
  }

  return null;
}

describe("missed activity date keys", () => {
  it("collects only completed days that have no record", () => {
    const missed = collectMissedDateKeys(["2026-09-01", "2026-09-03"], {
      createdDateKey: "2026-09-01",
      todayDateKey: "2026-09-05",
    });

    assert.deepEqual(missed, ["2026-09-02", "2026-09-04"]);
  });

  it("never marks today as missed", () => {
    const missed = collectMissedDateKeys([], {
      createdDateKey: "2026-09-03",
      todayDateKey: "2026-09-05",
    });

    assert.deepEqual(missed, ["2026-09-03", "2026-09-04"]);
    assert.equal(missed.includes("2026-09-05"), false);
  });

  it("excludes days before the account was created", () => {
    const missed = collectMissedDateKeys([], {
      createdDateKey: "2026-09-04",
      todayDateKey: "2026-09-06",
    });

    assert.deepEqual(missed, ["2026-09-04", "2026-09-05"]);
  });

  it("returns nothing for an account created today", () => {
    assert.deepEqual(
      collectMissedDateKeys([], { createdDateKey: "2026-09-05", todayDateKey: "2026-09-05" }),
      [],
    );
  });
});

describe("missed activity items", () => {
  it("calculates the three activities independently", () => {
    const result = buildMissedActivityItems({
      todayDateKey: "2026-09-05",
      createdDateKey: "2026-09-01",
      recovery: [{ dateKey: "2026-09-01" }],
      reading: [{ dateKey: "2026-09-02" }],
      goals: [{ dateKey: "2026-09-03" }],
    });

    assert.equal(result.total, 9);
    assert.deepEqual(result.items, [
      { dateKey: "2026-09-01", activity: "READING" },
      { dateKey: "2026-09-01", activity: "GOALS" },
      { dateKey: "2026-09-02", activity: "STRONG" },
      { dateKey: "2026-09-02", activity: "GOALS" },
      { dateKey: "2026-09-03", activity: "STRONG" },
      { dateKey: "2026-09-03", activity: "READING" },
      { dateKey: "2026-09-04", activity: "STRONG" },
      { dateKey: "2026-09-04", activity: "READING" },
      { dateKey: "2026-09-04", activity: "GOALS" },
    ]);
  });

  it("orders missed dates oldest first", () => {
    const { items } = buildMissedActivityItems({
      todayDateKey: "2026-09-05",
      createdDateKey: "2026-09-01",
      recovery: [],
      reading: [{ dateKey: "2026-09-01" }, { dateKey: "2026-09-02" }, { dateKey: "2026-09-03" }, { dateKey: "2026-09-04" }],
      goals: [{ dateKey: "2026-09-01" }, { dateKey: "2026-09-02" }, { dateKey: "2026-09-03" }, { dateKey: "2026-09-04" }],
    });

    assert.deepEqual(items.map((item) => item.dateKey), [
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
    ]);
  });

  it("treats a recorded No answer as history, not a missing entry", () => {
    const result = buildMissedActivityItems({
      todayDateKey: "2026-09-03",
      createdDateKey: "2026-09-01",
      recovery: [{ dateKey: "2026-09-01", answer: "NO" }, { dateKey: "2026-09-02", answer: "NO" }],
      reading: [{ dateKey: "2026-09-01", answer: "NO" }, { dateKey: "2026-09-02", answer: "NO" }],
      goals: [{ dateKey: "2026-09-01" }, { dateKey: "2026-09-02" }],
    });

    assert.deepEqual(result, { total: 0, items: [] });
  });

  it("treats an incomplete goal day as recorded", () => {
    const result = buildMissedActivityItems({
      todayDateKey: "2026-09-03",
      createdDateKey: "2026-09-02",
      recovery: [{ dateKey: "2026-09-02" }],
      reading: [{ dateKey: "2026-09-02" }],
      goals: [{ dateKey: "2026-09-02", completedAt: null }],
    });

    assert.deepEqual(result, { total: 0, items: [] });
  });

  it("keeps a stable activity order inside one date", () => {
    const { items } = buildMissedActivityItems({
      todayDateKey: "2026-09-02",
      createdDateKey: "2026-09-01",
      recovery: [],
      reading: [],
      goals: [],
    });

    assert.deepEqual(items.map((item) => item.activity), MISSED_ACTIVITY_ORDER);
  });

  it("reports nothing missing when every day is recorded", () => {
    assert.deepEqual(
      buildMissedActivityItems({
        todayDateKey: "2026-09-02",
        createdDateKey: "2026-09-02",
        recovery: [],
        reading: [],
        goals: [],
      }),
      { total: 0, items: [] },
    );
  });

  it("returns a stable requested page without changing the total", () => {
    const result = buildMissedActivityItems(
      {
        todayDateKey: "2026-09-06",
        createdDateKey: "2026-09-01",
        recovery: [],
        reading: [],
        goals: [],
      },
      { offset: 5, limit: 5 },
    );

    assert.equal(result.total, 15);
    assert.deepEqual(result.items, [
      { dateKey: "2026-09-02", activity: "GOALS" },
      { dateKey: "2026-09-03", activity: "STRONG" },
      { dateKey: "2026-09-03", activity: "READING" },
      { dateKey: "2026-09-03", activity: "GOALS" },
      { dateKey: "2026-09-04", activity: "STRONG" },
    ]);
  });
});

describe("missed activity pagination input", () => {
  it("coerces safe query strings and keeps backward-compatible defaults", () => {
    assert.deepEqual(missedActivitiesPageSchema.parse({}), { offset: 0, limit: 30 });
    assert.deepEqual(missedActivitiesPageSchema.parse({ offset: "5", limit: "5" }), { offset: 5, limit: 5 });
  });

  it("rejects negative offsets and oversized pages", () => {
    assert.equal(missedActivitiesPageSchema.safeParse({ offset: "-1", limit: "5" }).success, false);
    assert.equal(missedActivitiesPageSchema.safeParse({ offset: "0", limit: "31" }).success, false);
  });
});

describe("historical date guard", () => {
  const day = { todayDateKey: "2026-09-05", createdDateKey: "2026-09-01" };

  it("accepts a completed day inside the account's lifetime", () => {
    assert.equal(assertHistoricalDateKey("2026-09-04", day), "2026-09-04");
    assert.equal(assertHistoricalDateKey("2026-09-01", day), "2026-09-01");
  });

  it("rejects today", () => {
    assert.equal(statusOf(() => assertHistoricalDateKey("2026-09-05", day))?.statusCode, 400);
  });

  it("rejects a future date", () => {
    assert.equal(statusOf(() => assertHistoricalDateKey("2026-09-09", day))?.statusCode, 400);
  });

  it("rejects a date before the account was created", () => {
    assert.equal(statusOf(() => assertHistoricalDateKey("2026-08-31", day))?.statusCode, 400);
  });

  it("rejects a malformed or impossible date", () => {
    assert.equal(statusOf(() => assertHistoricalDateKey("2026-9-4", day))?.statusCode, 400);
    assert.equal(statusOf(() => assertHistoricalDateKey("2026-02-30", day))?.statusCode, 400);
    assert.equal(statusOf(() => assertHistoricalDateKey("", day))?.statusCode, 400);
    assert.equal(statusOf(() => assertHistoricalDateKey(null, day))?.statusCode, 400);
  });

  it("recognises real calendar date keys", () => {
    assert.equal(isCalendarDateKey("2026-02-28"), true);
    assert.equal(isCalendarDateKey("2026-02-30"), false);
    assert.equal(isCalendarDateKey("not-a-date"), false);
  });
});
