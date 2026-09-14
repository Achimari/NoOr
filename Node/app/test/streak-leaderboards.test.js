import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildStreakBoard,
  getMissedActivityDays,
  getStreakLeaderboards,
} from "../src/services/streakLeaderboardService.js";
import { prisma } from "../src/prisma/client.js";

function selectFields(row, select) {
  return Object.fromEntries(Object.entries(select).map(([key, selection]) => [
    key,
    selection === true ? row[key] : row[key].map((entry) => selectFields(entry, selection.select)),
  ]));
}

function stubLeaderboardUser(t, { dailyGoals = [], dailyGoalCheckIns = [] }) {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-05T12:00:00Z") });
  const user = {
    id: 8,
    name: "Reader",
    timezone: "UTC",
    createdAt: new Date("2026-09-01T10:00:00Z"),
    readingCheckIns: [],
    dailyGoals,
    dailyGoalCheckIns,
  };
  const originalFindMany = prisma.auth.findMany;
  prisma.auth.findMany = async ({ select }) => [selectFields(user, select)];
  t.after(() => { prisma.auth.findMany = originalFindMany; });
}

describe("Tasks leaderboard daily answers", () => {
  it("does not count No data days as missed or award them a task streak", async (t) => {
    stubLeaderboardUser(t, {
      dailyGoalCheckIns: [1, 2, 3, 4].map((day) => ({
        dateKey: `2026-09-0${day}`,
        answer: "NO_DATA",
      })),
    });

    const { goals } = await getStreakLeaderboards(8);

    assert.deepEqual(goals.leaders[0].missedDays, { count: 0, nextDateKey: null });
    assert.equal(goals.leaders[0].value, 0);
    assert.equal(goals.leaders[0].maxStreak, 0);
    assert.equal(goals.leaders[0].isInactive, true);
  });

  it("counts only unanswered past days alongside No data, explicit No, and task rows", async (t) => {
    stubLeaderboardUser(t, {
      dailyGoalCheckIns: [
        { dateKey: "2026-09-01", answer: "NO_DATA" },
        { dateKey: "2026-09-02", answer: "NO" },
        { dateKey: "2026-09-04", answer: "YES" },
      ],
      dailyGoals: [
        { dateKey: "2026-09-04", completedAt: new Date("2026-09-04T10:00:00Z") },
        { dateKey: "2026-09-04", completedAt: new Date("2026-09-04T11:00:00Z") },
      ],
    });

    const { goals } = await getStreakLeaderboards(8);

    assert.deepEqual(goals.leaders[0].missedDays, { count: 1, nextDateKey: "2026-09-03" });
    assert.equal(goals.leaders[0].value, 1);
    assert.equal(goals.leaders[0].maxStreak, 1);
    assert.equal(goals.leaders[0].isInactive, false);
  });
});

describe("missed activity days", () => {
  it("counts completed days without a Bible reading row and leaves today open", () => {
    const missed = getMissedActivityDays(
      [
        { dateKey: "2026-08-01", answer: "YES" },
        { dateKey: "2026-08-03", answer: "NO" },
      ],
      "2026-08-05",
      "2026-08-01",
    );

    assert.deepEqual(missed, {
      count: 2,
      nextDateKey: "2026-08-02",
    });
  });

  it("treats incomplete goal days as recorded and ignores duplicate goal rows", () => {
    const missed = getMissedActivityDays(
      [
        { dateKey: "2026-08-01", completedAt: new Date("2026-08-01T10:00:00Z") },
        { dateKey: "2026-08-03", completedAt: null },
        { dateKey: "2026-08-03", completedAt: null },
      ],
      "2026-08-05",
      "2026-08-01",
    );

    assert.deepEqual(missed, {
      count: 2,
      nextDateKey: "2026-08-02",
    });
  });

  it("returns no missed days for a user created today", () => {
    assert.deepEqual(getMissedActivityDays([], "2026-08-05", "2026-08-05"), {
      count: 0,
      nextDateKey: null,
    });
  });
});

describe("streak leaderboard missed state", () => {
  it("adds missed and inactive state to a leaderboard entry", () => {
    const board = buildStreakBoard(
      [{
        id: 8,
        name: "Reader",
        timezone: "UTC",
        createdAt: new Date("2026-08-01T10:00:00Z"),
        readingCheckIns: [
          { dateKey: "2026-08-01", answer: "YES" },
          { dateKey: "2026-08-03", answer: "NO" },
        ],
      }],
      {
        getRows: (user) => user.readingCheckIns,
        getCurrentStreak: () => 4,
        getMaxStreak: () => 7,
        currentUserId: 8,
        now: new Date("2026-08-05T10:00:00Z"),
      },
    );

    assert.deepEqual(board.leaders[0], {
      rank: 1,
      id: 8,
      name: "Reader",
      value: 0,
      maxStreak: 7,
      inactiveDays: 1,
      isInactive: true,
      missedDays: {
        count: 2,
        nextDateKey: "2026-08-02",
      },
    });
  });
});
