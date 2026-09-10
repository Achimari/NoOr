import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { loadStatisticsAnswerRows } from "../src/services/statisticsService.js";

function createRepository() {
  const calls = [];
  const repository = {
    async findAllRecoveryAnswerRows() {
      calls.push("all-recovery");
      return [{ dateKey: "2026-09-01", answer: "YES" }];
    },
    async findRecoveryAnswerRowsByUserId(userId) {
      calls.push(`user-recovery-${userId}`);
      return [{ dateKey: "2026-09-01", answer: "NO" }];
    },
    async findAllReadingAnswerRows() {
      calls.push("all-reading");
      return [{ dateKey: "2026-09-02", answer: "NO" }];
    },
    async findReadingAnswerRowsByUserId(userId) {
      calls.push(`user-reading-${userId}`);
      return [{ dateKey: "2026-09-02", answer: "YES" }];
    },
    async findAllGoalAnswerSources() {
      calls.push("all-goals");
      return [
        {
          dailyGoals: [
            { dateKey: "2026-09-03", completedAt: new Date("2026-09-03T09:00:00Z") },
            { dateKey: "2026-09-03", completedAt: new Date("2026-09-03T10:00:00Z") },
          ],
          dailyGoalCheckIns: [],
        },
        {
          dailyGoals: [{ dateKey: "2026-09-04", completedAt: null }],
          dailyGoalCheckIns: [],
        },
      ];
    },
    async findGoalAnswerSourceByUserId(userId) {
      calls.push(`user-goals-${userId}`);
      return {
        dailyGoals: [],
        dailyGoalCheckIns: [{ dateKey: "2026-09-05", answer: "NO" }],
      };
    },
  };

  return { calls, repository };
}

describe("statistics answer source", () => {
  it("passes the selected table source from the page controller into the statistics service", () => {
    const controller = readFileSync(
      new URL("../src/controllers/pageController.js", import.meta.url),
      "utf8",
    );

    assert.match(
      controller,
      /const activeStreak = resolveStreakView\(req\.query\.streak\);[\s\S]*?getStatisticsSummary\(req\.user\.id, activeStreak\.key\)/,
    );
  });

  it("loads Bible answers when the Bible table is selected", async () => {
    const { calls, repository } = createRepository();

    const rows = await loadStatisticsAnswerRows("reading", 7, repository);

    assert.deepEqual(rows, {
      historyRows: [{ dateKey: "2026-09-02", answer: "NO" }],
      currentUserHistoryRows: [{ dateKey: "2026-09-02", answer: "YES" }],
    });
    assert.deepEqual(calls, ["all-reading", "user-reading-7"]);
  });

  it("turns task completion days into one Yes or No answer per member and date", async () => {
    const { calls, repository } = createRepository();

    const rows = await loadStatisticsAnswerRows("goals", 7, repository);

    assert.deepEqual(rows, {
      historyRows: [
        { dateKey: "2026-09-03", answer: "YES" },
        { dateKey: "2026-09-04", answer: "NO" },
      ],
      currentUserHistoryRows: [{ dateKey: "2026-09-05", answer: "NO" }],
    });
    assert.deepEqual(calls, ["all-goals", "user-goals-7"]);
  });

  it("keeps Strong as the safe default for an unknown source", async () => {
    const { calls, repository } = createRepository();

    await loadStatisticsAnswerRows("unknown", 7, repository);

    assert.deepEqual(calls, ["all-recovery", "user-recovery-7"]);
  });
});
