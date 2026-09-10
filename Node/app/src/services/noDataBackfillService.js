import { ANSWER_NO_DATA } from "../domain/activityAnswers.js";
import { prisma } from "../prisma/client.js";
import { getTodayDateKey, isCalendarDateKey, shiftDateKey } from "../utils/dateKey.js";

export const DEFAULT_THROUGH_DATE_KEY = "2026-09-09";

export function resolveThroughDateKey({ requestedDateKey, todayDateKey }) {
  const lastCompletedDateKey = shiftDateKey(todayDateKey, -1);
  if (!lastCompletedDateKey) return null;
  if (!isCalendarDateKey(requestedDateKey)) return lastCompletedDateKey;

  return requestedDateKey < lastCompletedDateKey ? requestedDateKey : lastCompletedDateKey;
}

export function planNoDataDateKeys({ createdDateKey, throughDateKey, recordedDateKeys }) {
  if (!isCalendarDateKey(createdDateKey) || !isCalendarDateKey(throughDateKey)) return [];

  const recorded = new Set(recordedDateKeys || []);
  const missing = [];
  let cursor = createdDateKey;

  while (cursor && cursor <= throughDateKey) {
    if (!recorded.has(cursor)) missing.push(cursor);
    cursor = shiftDateKey(cursor, 1);
  }

  return missing;
}

function toDateKeys(rows) {
  return (rows || []).flatMap((row) => (row?.dateKey ? [row.dateKey] : []));
}

export async function planUserBackfill(user, { requestedDateKey, now = new Date(), client = prisma } = {}) {
  const todayDateKey = getTodayDateKey(now, user.timezone);
  const createdDateKey = getTodayDateKey(user.createdAt, user.timezone);
  const throughDateKey = resolveThroughDateKey({ requestedDateKey, todayDateKey });

  const [reading, goalCheckIns, goals] = await Promise.all([
    client.readingCheckIn.findMany({ where: { userId: user.id }, select: { dateKey: true } }),
    client.dailyGoalCheckIn.findMany({ where: { userId: user.id }, select: { dateKey: true } }),
    client.dailyGoal.findMany({ where: { userId: user.id }, select: { dateKey: true } }),
  ]);

  return {
    userId: user.id,
    name: user.name,
    createdDateKey,
    throughDateKey,
    reading: planNoDataDateKeys({
      createdDateKey,
      throughDateKey,
      recordedDateKeys: toDateKeys(reading),
    }),
    goals: planNoDataDateKeys({
      createdDateKey,
      throughDateKey,
      recordedDateKeys: [...toDateKeys(goalCheckIns), ...toDateKeys(goals)],
    }),
  };
}

export async function writeUserBackfill(plan, { client = prisma } = {}) {
  const [reading, goals] = await Promise.all([
    plan.reading.length
      ? client.readingCheckIn.createMany({
          data: plan.reading.map((dateKey) => ({ userId: plan.userId, dateKey, answer: ANSWER_NO_DATA })),
          skipDuplicates: true,
        })
      : { count: 0 },
    plan.goals.length
      ? client.dailyGoalCheckIn.createMany({
          data: plan.goals.map((dateKey) => ({ userId: plan.userId, dateKey, answer: ANSWER_NO_DATA })),
          skipDuplicates: true,
        })
      : { count: 0 },
  ]);

  return { reading: reading.count, goals: goals.count };
}

export async function backfillNoDataAnswers({
  requestedDateKey = DEFAULT_THROUGH_DATE_KEY,
  userIds = null,
  dryRun = false,
  now = new Date(),
  client = prisma,
  onUser = null,
} = {}) {
  const users = await client.auth.findMany({
    where: userIds?.length ? { id: { in: userIds } } : undefined,
    select: { id: true, name: true, timezone: true, createdAt: true },
    orderBy: { id: "asc" },
  });

  const summary = { users: users.length, reading: 0, goals: 0, dryRun };

  for (const user of users) {
    const plan = await planUserBackfill(user, { requestedDateKey, now, client });
    const written = dryRun
      ? { reading: plan.reading.length, goals: plan.goals.length }
      : await writeUserBackfill(plan, { client });

    summary.reading += written.reading;
    summary.goals += written.goals;
    onUser?.({ plan, written });
  }

  return summary;
}
