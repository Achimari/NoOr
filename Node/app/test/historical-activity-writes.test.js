import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHistoricalDailyGoals } from "../src/repositories/dailyGoalRepository.js";
import { createReadingCheckIn } from "../src/repositories/readingCheckInRepository.js";
import { findMissedActivitySources } from "../src/repositories/missedActivityRepository.js";
import {
  historicalDailyGoalsSchema,
  historicalReadingCheckInSchema,
} from "../src/validators/missedActivityValidators.js";

function createFakeClient({ goals = [], goalCheckIn = null, reading = null, sources = {} } = {}) {
  const calls = [];
  const record = (name) => (args) => {
    calls.push({ name, args });
    return args;
  };

  const tx = {
    dailyGoal: {
      findMany: async (args) => {
        calls.push({ name: "dailyGoal.findMany", args });
        return sources.goals ?? goals;
      },
      createMany: async (args) => {
        calls.push({ name: "dailyGoal.createMany", args });
        return { count: args.data.length };
      },
    },
    dailyGoalCheckIn: {
      findUnique: async (args) => {
        calls.push({ name: "dailyGoalCheckIn.findUnique", args });
        return goalCheckIn;
      },
      findMany: async (args) => {
        calls.push({ name: "dailyGoalCheckIn.findMany", args });
        return sources.goalCheckIns ?? [];
      },
      create: async (args) => {
        calls.push({ name: "dailyGoalCheckIn.create", args });
        return args.data;
      },
    },
    readingCheckIn: {
      findUnique: async (args) => {
        calls.push({ name: "readingCheckIn.findUnique", args });
        return reading;
      },
      findMany: async (args) => {
        calls.push({ name: "readingCheckIn.findMany", args });
        return sources.reading ?? [];
      },
      create: async (args) => {
        calls.push({ name: "readingCheckIn.create", args });
        return { dateKey: args.data.dateKey, answer: args.data.answer, reflection: args.data.reflection, passages: [] };
      },
    },
    checkInHistory: {
      findMany: async (args) => {
        calls.push({ name: "checkInHistory.findMany", args });
        return sources.recovery ?? [];
      },
    },
    auth: {
      findUnique: async (args) => {
        calls.push({ name: "auth.findUnique", args });
        return sources.auth ?? { createdAt: new Date("2026-09-01T10:00:00Z") };
      },
    },
  };

  return {
    calls,
    record,
    client: {
      ...tx,
      $transaction: (run) => run(tx),
    },
  };
}

describe("historical daily goals repository", () => {
  it("writes one to five completed tasks against the historical date", async () => {
    const { calls, client } = createFakeClient();

    const created = await createHistoricalDailyGoals(
      {
        userId: 7,
        dateKey: "2026-09-02",
        tasks: ["Read a chapter", "Call a friend", "Walk"],
        completedAt: new Date("2026-09-05T08:00:00Z"),
      },
      client,
    );

    assert.equal(created, 3);

    const write = calls.find((call) => call.name === "dailyGoal.createMany");
    assert.deepEqual(write.args.data, [
      { userId: 7, dateKey: "2026-09-02", text: "Read a chapter", position: 1, completedAt: new Date("2026-09-05T08:00:00Z") },
      { userId: 7, dateKey: "2026-09-02", text: "Call a friend", position: 2, completedAt: new Date("2026-09-05T08:00:00Z") },
      { userId: 7, dateKey: "2026-09-02", text: "Walk", position: 3, completedAt: new Date("2026-09-05T08:00:00Z") },
    ]);
  });

  it("scopes the duplicate check to the owner and the date", async () => {
    const { calls, client } = createFakeClient();

    await createHistoricalDailyGoals(
      { userId: 42, dateKey: "2026-09-02", tasks: ["One"], completedAt: new Date() },
      client,
    );

    const guard = calls.find((call) => call.name === "dailyGoal.findMany");
    assert.deepEqual(guard.args.where, { userId: 42, dateKey: "2026-09-02" });
  });

  it("never overwrites a day that already has task rows", async () => {
    const { calls, client } = createFakeClient({ goals: [{ id: 1 }] });

    const created = await createHistoricalDailyGoals(
      { userId: 7, dateKey: "2026-09-02", tasks: ["One"], completedAt: new Date() },
      client,
    );

    assert.equal(created, null);
    assert.equal(calls.some((call) => call.name === "dailyGoal.createMany"), false);
  });

  it("refuses to insert placeholder rows for an empty task list", async () => {
    const { calls, client } = createFakeClient();

    const created = await createHistoricalDailyGoals(
      { userId: 7, dateKey: "2026-09-02", tasks: [], completedAt: new Date() },
      client,
    );

    assert.equal(created, null);
    assert.equal(calls.some((call) => call.name === "dailyGoal.createMany"), false);
  });

  it("stores an explicit No without inventing a task row", async () => {
    const { calls, client } = createFakeClient();

    const created = await createHistoricalDailyGoals(
      { userId: 7, dateKey: "2026-09-02", answer: "NO", tasks: [], completedAt: new Date() },
      client,
    );

    assert.equal(created, 0);
    assert.deepEqual(calls.find((call) => call.name === "dailyGoalCheckIn.create").args.data, {
      userId: 7,
      dateKey: "2026-09-02",
      answer: "NO",
    });
    assert.equal(calls.some((call) => call.name === "dailyGoal.createMany"), false);
  });

  it("does not overwrite an existing explicit task-day answer", async () => {
    const { calls, client } = createFakeClient({ goalCheckIn: { id: 4, answer: "NO" } });

    const created = await createHistoricalDailyGoals(
      { userId: 7, dateKey: "2026-09-02", answer: "YES", tasks: ["One"], completedAt: new Date() },
      client,
    );

    assert.equal(created, null);
    assert.equal(calls.some((call) => call.name === "dailyGoalCheckIn.create"), false);
    assert.equal(calls.some((call) => call.name === "dailyGoal.createMany"), false);
  });

  it("keeps the five-task position limit", async () => {
    const { client } = createFakeClient();

    await assert.rejects(
      () => createHistoricalDailyGoals(
        {
          userId: 7,
          dateKey: "2026-09-02",
          tasks: ["a", "b", "c", "d", "e", "f"],
          completedAt: new Date(),
        },
        client,
      ),
      /five/i,
    );
  });
});

describe("historical Bible reading repository", () => {
  it("stores a Yes against the selected historical date", async () => {
    const { calls, client } = createFakeClient();

    await createReadingCheckIn(
      {
        userId: 9,
        dateKey: "2026-09-02",
        answer: "YES",
        reflection: "Grateful",
        passages: [{ bookCode: "JHN", chapter: 3, startVerse: 16, endVerse: 17, position: 0 }],
      },
      client,
    );

    const write = calls.find((call) => call.name === "readingCheckIn.create");
    assert.equal(write.args.data.userId, 9);
    assert.equal(write.args.data.dateKey, "2026-09-02");
    assert.equal(write.args.data.answer, "YES");
  });

  it("stores a No against the selected historical date with no passages", async () => {
    const { calls, client } = createFakeClient();

    await createReadingCheckIn(
      { userId: 9, dateKey: "2026-09-02", answer: "NO", reflection: null, passages: [] },
      client,
    );

    const write = calls.find((call) => call.name === "readingCheckIn.create");
    assert.equal(write.args.data.answer, "NO");
    assert.deepEqual(write.args.data.passages.create, []);
  });

  it("does not overwrite an existing reading record", async () => {
    const { calls, client } = createFakeClient({ reading: { id: 3 } });

    const created = await createReadingCheckIn(
      { userId: 9, dateKey: "2026-09-02", answer: "YES", reflection: null, passages: [] },
      client,
    );

    assert.equal(created, null);
    assert.equal(calls.some((call) => call.name === "readingCheckIn.create"), false);
  });
});

describe("missed activity sources", () => {
  it("reads every activity for one owner only", async () => {
    const { calls, client } = createFakeClient({
      sources: {
        auth: { createdAt: new Date("2026-09-01T10:00:00Z") },
        recovery: [{ dateKey: "2026-09-01" }],
        reading: [{ dateKey: "2026-09-02" }],
        goals: [{ dateKey: "2026-09-03" }],
        goalCheckIns: [{ dateKey: "2026-09-04" }],
      },
    });

    const sources = await findMissedActivitySources(11, client);

    assert.deepEqual(sources.recovery, [{ dateKey: "2026-09-01" }]);
    assert.deepEqual(sources.reading, [{ dateKey: "2026-09-02" }]);
    assert.deepEqual(sources.goals, [{ dateKey: "2026-09-03" }, { dateKey: "2026-09-04" }]);

    const scoped = calls.filter((call) => call.name.endsWith(".findMany"));
    assert.equal(scoped.length, 4);
    scoped.forEach((call) => assert.equal(call.args.where.userId, 11));
    assert.deepEqual(calls.find((call) => call.name === "auth.findUnique").args.where, { id: 11 });
  });
});

describe("historical write validation", () => {
  it("requires a well formed date key for tasks", () => {
    assert.equal(historicalDailyGoalsSchema.safeParse({ dateKey: "2026-9-2", tasks: ["One"] }).success, false);
    assert.equal(historicalDailyGoalsSchema.safeParse({ dateKey: "2026-02-30", tasks: ["One"] }).success, false);
  });

  it("accepts between one and five tasks", () => {
    assert.equal(historicalDailyGoalsSchema.safeParse({ dateKey: "2026-09-02", tasks: ["One"] }).success, true);
    assert.equal(
      historicalDailyGoalsSchema.safeParse({ dateKey: "2026-09-02", tasks: ["a", "b", "c", "d", "e"] }).success,
      true,
    );
    assert.equal(historicalDailyGoalsSchema.safeParse({ dateKey: "2026-09-02", tasks: [] }).success, false);
    assert.equal(
      historicalDailyGoalsSchema.safeParse({ dateKey: "2026-09-02", tasks: ["a", "b", "c", "d", "e", "f"] }).success,
      false,
    );
  });

  it("accepts an explicit No with zero tasks", () => {
    const parsed = historicalDailyGoalsSchema.safeParse({
      dateKey: "2026-09-02",
      answer: "NO",
      tasks: [],
    });

    assert.equal(parsed.success, true);
    assert.deepEqual(parsed.data, { dateKey: "2026-09-02", answer: "NO", tasks: [] });
  });

  it("requires completed task text for Yes and forbids it for No", () => {
    assert.equal(
      historicalDailyGoalsSchema.safeParse({ dateKey: "2026-09-02", answer: "YES", tasks: [] }).success,
      false,
    );
    assert.equal(
      historicalDailyGoalsSchema.safeParse({ dateKey: "2026-09-02", answer: "NO", tasks: ["One"] }).success,
      false,
    );
  });

  it("rejects blank task text and never invents a placeholder", () => {
    assert.equal(historicalDailyGoalsSchema.safeParse({ dateKey: "2026-09-02", tasks: ["   "] }).success, false);
  });

  it("reuses the Bible validation and passage normalization for a historical Yes", () => {
    const parsed = historicalReadingCheckInSchema.safeParse({
      dateKey: "2026-09-02",
      answer: "YES",
      passages: [{ book: "John", chapter: "3", startVerse: "16", endVerse: "17" }],
      reflection: "  Grateful  ",
    });

    assert.equal(parsed.success, true);
    assert.deepEqual(parsed.data, {
      dateKey: "2026-09-02",
      answer: "YES",
      reflection: "Grateful",
      passages: [{ bookCode: "JHN", chapter: 3, startVerse: 16, endVerse: 17, position: 0 }],
    });
  });

  it("clears passages and reflection for a historical No", () => {
    const parsed = historicalReadingCheckInSchema.safeParse({
      dateKey: "2026-09-02",
      answer: "NO",
      passages: [{ book: "John", chapter: 3, startVerse: 16, endVerse: 17 }],
      reflection: "ignored",
    });

    assert.equal(parsed.success, true);
    assert.deepEqual(parsed.data, {
      dateKey: "2026-09-02",
      answer: "NO",
      passages: [],
      reflection: null,
    });
  });

  it("rejects an invalid Bible passage in a historical write", () => {
    const parsed = historicalReadingCheckInSchema.safeParse({
      dateKey: "2026-09-02",
      answer: "YES",
      passages: [{ book: "Nowhere", chapter: 1, startVerse: 1, endVerse: 1 }],
      reflection: "",
    });

    assert.equal(parsed.success, false);
  });
});
