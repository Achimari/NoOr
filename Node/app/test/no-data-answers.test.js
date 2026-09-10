import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  ACTIVITY_ANSWERS,
  ANSWER_NO_DATA,
  isNoDataAnswer,
  isUserAnswer,
  normalizeAnswer,
  withoutNoData,
} from "../src/domain/activityAnswers.js";
import { buildStreaks } from "../src/services/profileService.js";
import { buildStreakBoard, calculateReadingCurrentStreak, calculateReadingMaxStreak } from "../src/services/streakLeaderboardService.js";
import { buildAchievementFacts } from "../src/services/achievementService.js";
import { collectMissedDateKeys } from "../src/services/missedActivityService.js";
import { historicalDailyGoalsSchema, historicalReadingCheckInSchema } from "../src/validators/missedActivityValidators.js";
import { readingCheckInSchema } from "../src/validators/readingCheckInValidators.js";
import {
  DEFAULT_THROUGH_DATE_KEY,
  backfillNoDataAnswers,
  planNoDataDateKeys,
  planUserBackfill,
  resolveThroughDateKey,
  writeUserBackfill,
} from "../src/services/noDataBackfillService.js";
import { parseArgs } from "../scripts/backfill-no-data-answers.js";

function createFakeClient({ users = [], reading = [], goalCheckIns = [], goals = [] } = {}) {
  const writes = [];
  const collect = (table) => ({
    findMany: async () => ({ reading, dailyGoalCheckIn: goalCheckIns, dailyGoal: goals })[table],
    createMany: async (args) => {
      writes.push({ table, data: args.data, skipDuplicates: args.skipDuplicates });
      return { count: args.data.length };
    },
  });

  return {
    writes,
    auth: { findMany: async () => users },
    readingCheckIn: collect("reading"),
    dailyGoalCheckIn: collect("dailyGoalCheckIn"),
    dailyGoal: collect("dailyGoal"),
  };
}

describe("the No data answer state", () => {
  it("sits beside Yes and No as a third stored state", () => {
    assert.deepEqual(ACTIVITY_ANSWERS, ["YES", "NO", "NO_DATA"]);
    assert.equal(ANSWER_NO_DATA, "NO_DATA");
  });

  it("is not a user answer, so it never masquerades as one", () => {
    assert.equal(isUserAnswer("YES"), true);
    assert.equal(isUserAnswer("NO"), true);
    assert.equal(isUserAnswer(ANSWER_NO_DATA), false);
    assert.equal(isNoDataAnswer(ANSWER_NO_DATA), true);
  });

  it("survives normalization instead of collapsing into No", () => {
    assert.equal(normalizeAnswer("YES"), "YES");
    assert.equal(normalizeAnswer("NO"), "NO");
    assert.equal(normalizeAnswer(ANSWER_NO_DATA), ANSWER_NO_DATA);
    assert.equal(normalizeAnswer("nonsense"), "NO");
    assert.equal(normalizeAnswer(undefined), "NO");
  });

  it("drops out of any row list asked for real answers only", () => {
    const rows = [
      { dateKey: "2026-09-01", answer: "YES" },
      { dateKey: "2026-09-02", answer: ANSWER_NO_DATA },
      { dateKey: "2026-09-03", answer: "NO" },
    ];

    assert.deepEqual(withoutNoData(rows).map((row) => row.dateKey), ["2026-09-01", "2026-09-03"]);
    assert.deepEqual(withoutNoData(null), []);
  });

  it("stays out of the answers a user may submit", () => {
    assert.equal(readingCheckInSchema.safeParse({ answer: ANSWER_NO_DATA, passages: [], reflection: "" }).success, false);
    assert.equal(
      historicalReadingCheckInSchema.safeParse({ dateKey: "2026-09-01", answer: ANSWER_NO_DATA, passages: [], reflection: "" }).success,
      false,
    );
    assert.equal(historicalDailyGoalsSchema.safeParse({ dateKey: "2026-09-01", answer: ANSWER_NO_DATA, tasks: [] }).success, false);
  });
});

describe("No data days in profile streaks", () => {
  const source = {
    checkInHistory: [],
    readingCheckIns: [
      { dateKey: "2026-09-01", answer: "YES" },
      { dateKey: "2026-09-02", answer: ANSWER_NO_DATA },
      { dateKey: "2026-09-03", answer: ANSWER_NO_DATA },
    ],
    dailyGoals: [],
    dailyGoalCheckIns: [
      { dateKey: "2026-09-01", answer: "NO" },
      { dateKey: "2026-09-02", answer: ANSWER_NO_DATA },
    ],
  };

  it("shows the day with its own No data label rather than a No", () => {
    const { reading } = buildStreaks(source, "2026-09-04", "2026-09-01");
    const day = reading.days.find((entry) => entry.dateKey === "2026-09-02");

    assert.equal(day.answer, ANSWER_NO_DATA);
    assert.equal(day.success, false);
  });

  it("counts only real answers as recorded days", () => {
    const { reading, goals } = buildStreaks(source, "2026-09-04", "2026-09-01");

    assert.equal(reading.recordedDays, 1);
    assert.equal(reading.qualifyingDays, 1);
    assert.equal(goals.recordedDays, 1);
  });

  it("keeps counting inactivity from the last real answer", () => {
    const { reading } = buildStreaks(source, "2026-09-10", "2026-09-01");

    assert.equal(reading.inactiveDays, 8);
    assert.equal(reading.isInactive, true);
  });

  it("does not extend or break a streak differently from a missing day", () => {
    const withNoData = [
      { dateKey: "2026-09-01", answer: "YES" },
      { dateKey: "2026-09-02", answer: ANSWER_NO_DATA },
      { dateKey: "2026-09-03", answer: "YES" },
    ];
    const withGap = [
      { dateKey: "2026-09-01", answer: "YES" },
      { dateKey: "2026-09-03", answer: "YES" },
    ];

    assert.equal(calculateReadingMaxStreak(withNoData), calculateReadingMaxStreak(withGap));
    assert.equal(calculateReadingCurrentStreak(withNoData, "2026-09-04"), calculateReadingCurrentStreak(withGap, "2026-09-04"));
  });
});

describe("No data days on the streak leaderboard", () => {
  it("leaves the inactive flag standing on a backfilled account", () => {
    const board = buildStreakBoard(
      [
        {
          id: 1,
          name: "Ada",
          timezone: "UTC",
          createdAt: new Date("2026-09-01T12:00:00.000Z"),
          readingCheckIns: [
            { dateKey: "2026-09-01", answer: "YES" },
            { dateKey: "2026-09-02", answer: ANSWER_NO_DATA },
            { dateKey: "2026-09-03", answer: ANSWER_NO_DATA },
          ],
        },
      ],
      {
        getRows: (user) => user.readingCheckIns,
        getCurrentStreak: calculateReadingCurrentStreak,
        getMaxStreak: calculateReadingMaxStreak,
        currentUserId: 1,
        now: new Date("2026-09-04T12:00:00.000Z"),
      },
    );

    assert.equal(board.leaders[0].inactiveDays, 2);
    assert.equal(board.leaders[0].isInactive, true);
  });

  it("still treats the day as recorded, so it leaves the catch-up list", () => {
    const recorded = ["2026-09-01", "2026-09-02"];

    assert.deepEqual(
      collectMissedDateKeys(recorded, {
        createdDateKey: "2026-09-01",
        todayDateKey: "2026-09-04",
      }),
      ["2026-09-03"],
    );
  });
});

describe("No data days in achievements", () => {
  it("never counts a filled day as a fully recorded day", () => {
    const facts = buildAchievementFacts({
      strongRows: [{ dateKey: "2026-09-01", answer: "YES" }],
      readingRows: [{ dateKey: "2026-09-01", answer: ANSWER_NO_DATA, bookCodes: [], hasReflection: false }],
      goalRows: [],
      goalCheckInDateKeys: ["2026-09-01"],
    });

    assert.equal(facts.fullyRecordedDays, 0);
    assert.equal(facts.readingYesDays, 0);
  });
});

describe("planning the backfill", () => {
  it("fills every unanswered day from account creation through the cutoff, inclusive", () => {
    assert.deepEqual(
      planNoDataDateKeys({
        createdDateKey: "2026-09-01",
        throughDateKey: "2026-09-05",
        recordedDateKeys: ["2026-09-02", "2026-09-04"],
      }),
      ["2026-09-01", "2026-09-03", "2026-09-05"],
    );
  });

  it("fills nothing when the account was created after the cutoff", () => {
    assert.deepEqual(
      planNoDataDateKeys({ createdDateKey: "2026-09-10", throughDateKey: "2026-09-09", recordedDateKeys: [] }),
      [],
    );
  });

  it("refuses a malformed date rather than looping", () => {
    assert.deepEqual(planNoDataDateKeys({ createdDateKey: "nope", throughDateKey: "2026-09-09", recordedDateKeys: [] }), []);
    assert.deepEqual(planNoDataDateKeys({ createdDateKey: "2026-09-01", throughDateKey: "2026-13-40", recordedDateKeys: [] }), []);
  });

  it("defaults to the day before the feature shipped", () => {
    assert.equal(DEFAULT_THROUGH_DATE_KEY, "2026-09-09");
  });

  it("never fills today or a future day, whatever cutoff is asked for", () => {
    assert.equal(resolveThroughDateKey({ requestedDateKey: "2026-09-09", todayDateKey: "2026-09-10" }), "2026-09-09");
    assert.equal(resolveThroughDateKey({ requestedDateKey: "2026-12-31", todayDateKey: "2026-09-10" }), "2026-09-09");
    assert.equal(resolveThroughDateKey({ requestedDateKey: "2026-09-10", todayDateKey: "2026-09-10" }), "2026-09-09");
    assert.equal(resolveThroughDateKey({ requestedDateKey: null, todayDateKey: "2026-09-10" }), "2026-09-09");
  });

  it("treats a day that holds tasks but no check-in as already recorded", async () => {
    const client = createFakeClient({ goals: [{ dateKey: "2026-09-02" }] });
    const plan = await planUserBackfill(
      { id: 1, name: "Ada", timezone: "UTC", createdAt: new Date("2026-09-01T12:00:00.000Z") },
      { requestedDateKey: "2026-09-03", now: new Date("2026-09-10T12:00:00.000Z"), client },
    );

    assert.deepEqual(plan.goals, ["2026-09-01", "2026-09-03"]);
    assert.deepEqual(plan.reading, ["2026-09-01", "2026-09-02", "2026-09-03"]);
  });
});

describe("running the backfill", () => {
  const user = { id: 7, name: "Ada", timezone: "UTC", createdAt: new Date("2026-09-08T12:00:00.000Z") };
  const now = new Date("2026-09-10T12:00:00.000Z");

  it("writes No data rows for both activities and skips duplicates", async () => {
    const client = createFakeClient({ users: [user] });
    const summary = await backfillNoDataAnswers({ requestedDateKey: "2026-09-09", now, client });

    assert.deepEqual(summary, { users: 1, reading: 2, goals: 2, dryRun: false });
    for (const write of client.writes) {
      assert.equal(write.skipDuplicates, true);
      assert.deepEqual(write.data.map((row) => row.answer), [ANSWER_NO_DATA, ANSWER_NO_DATA]);
      assert.deepEqual(write.data.map((row) => row.dateKey), ["2026-09-08", "2026-09-09"]);
      assert.deepEqual(write.data.map((row) => row.userId), [7, 7]);
    }
  });

  it("writes nothing at all on a dry run", async () => {
    const client = createFakeClient({ users: [user] });
    const summary = await backfillNoDataAnswers({ requestedDateKey: "2026-09-09", now, client, dryRun: true });

    assert.deepEqual(summary, { users: 1, reading: 2, goals: 2, dryRun: true });
    assert.deepEqual(client.writes, []);
  });

  it("issues no write when every day already holds an answer", async () => {
    const client = createFakeClient({
      users: [user],
      reading: [{ dateKey: "2026-09-08" }, { dateKey: "2026-09-09" }],
      goalCheckIns: [{ dateKey: "2026-09-08" }, { dateKey: "2026-09-09" }],
    });
    const summary = await backfillNoDataAnswers({ requestedDateKey: "2026-09-09", now, client });

    assert.deepEqual(summary, { users: 1, reading: 0, goals: 0, dryRun: false });
    assert.deepEqual(client.writes, []);
  });

  it("reports each account it touched", async () => {
    const seen = [];
    const client = createFakeClient({ users: [user] });
    await backfillNoDataAnswers({ requestedDateKey: "2026-09-09", now, client, onUser: (entry) => seen.push(entry) });

    assert.equal(seen.length, 1);
    assert.equal(seen[0].plan.createdDateKey, "2026-09-08");
    assert.equal(seen[0].plan.throughDateKey, "2026-09-09");
    assert.deepEqual(seen[0].written, { reading: 2, goals: 2 });
  });

  it("writes the plan straight through when asked for one account only", async () => {
    const client = createFakeClient();
    const written = await writeUserBackfill({ userId: 3, reading: ["2026-09-09"], goals: [] }, { client });

    assert.deepEqual(written, { reading: 1, goals: 0 });
    assert.equal(client.writes.length, 1);
  });
});

describe("the backfill console script", () => {
  it("defaults to every account through the shipped cutoff", () => {
    assert.deepEqual(parseArgs([]), {
      requestedDateKey: DEFAULT_THROUGH_DATE_KEY,
      userIds: null,
      dryRun: false,
      help: false,
    });
  });

  it("reads the cutoff, the account filter and the dry-run flag", () => {
    const options = parseArgs(["--through=2026-08-01", "--user=1,2", "--dry-run"]);

    assert.equal(options.requestedDateKey, "2026-08-01");
    assert.deepEqual(options.userIds, [1, 2]);
    assert.equal(options.dryRun, true);
  });

  it("refuses a malformed cutoff, account id or option instead of guessing", () => {
    assert.throws(() => parseArgs(["--through=yesterday"]), /YYYY-MM-DD/);
    assert.throws(() => parseArgs(["--user=abc"]), /account ids/);
    assert.throws(() => parseArgs(["--user=0"]), /account ids/);
    assert.throws(() => parseArgs(["--wipe"]), /Unknown option/);
  });
});

describe("the No data day in the profile history table", () => {
  const markup = readFileSync(new URL("../src/views/pages/partials/profile-content.ejs", import.meta.url), "utf8");

  it("labels the day No data instead of No", () => {
    assert.match(markup, /day\.answer === "NO_DATA" \? "No data"/);
  });

  it("gives the cell its own result hook so it can be styled apart from a No", () => {
    assert.match(markup, /data-result="<%= day\.answer\.toLowerCase\(\)\.replace\("_", "-"\) %>"/);
    const styles = readFileSync(new URL("../public/styles/game/profile.css", import.meta.url), "utf8");
    assert.match(styles, /\.profile-day-result\[data-result="no-data"\]/);
  });
});
