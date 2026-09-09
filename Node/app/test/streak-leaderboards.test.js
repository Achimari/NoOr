import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildStreakBoard,
  getMissedActivityDays,
} from "../src/services/streakLeaderboardService.js";

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
