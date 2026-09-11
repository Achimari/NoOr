import { findAuthUserTimezones } from "../repositories/authRepository.js";
import * as statisticsRepository from "../repositories/statisticsRepository.js";
import { buildGoalHistoryRows } from "./streakLeaderboardService.js";

const WEEK_DAYS = [
  { label: "Mon", longLabel: "Monday" },
  { label: "Tue", longLabel: "Tuesday" },
  { label: "Wed", longLabel: "Wednesday" },
  { label: "Thu", longLabel: "Thursday" },
  { label: "Fri", longLabel: "Friday" },
  { label: "Sat", longLabel: "Saturday" },
  { label: "Sun", longLabel: "Sunday" },
];

const TIMEZONE_AREAS = [
  { prefix: "Europe", x: 52, y: 31, spreadX: 16, spreadY: 12 },
  { prefix: "Asia", x: 70, y: 39, spreadX: 18, spreadY: 16 },
  { prefix: "America", x: 25, y: 45, spreadX: 18, spreadY: 18 },
  { prefix: "Africa", x: 51, y: 55, spreadX: 14, spreadY: 15 },
  { prefix: "Australia", x: 78, y: 67, spreadX: 10, spreadY: 9 },
  { prefix: "Pacific", x: 82, y: 64, spreadX: 12, spreadY: 11 },
];

const NO_WEEKDAY_DATA = "Not enough data yet";

function getWeekdayIndex(dateKey) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return (date.getUTCDay() + 6) % 7;
}

/**
 * The one composition measure the page paints and prints. Rounding the No share
 * separately can draw 99% or 101% of a track, so the second share is always the
 * remainder of the first.
 */
export function toAnswerSplit(yes, no) {
  const total = yes + no;
  const yesSharePercentage = total > 0 ? Math.round((yes / total) * 100) : 0;

  return {
    yes,
    no,
    total,
    yesSharePercentage,
    noSharePercentage: total > 0 ? 100 - yesSharePercentage : 0,
  };
}

export function buildWeekdayChart(historyRows) {
  const counts = WEEK_DAYS.map(() => ({ yes: 0, no: 0 }));

  for (const row of historyRows) {
    const weekdayIndex = getWeekdayIndex(row.dateKey);
    if (weekdayIndex === null) continue;

    if (row.answer === "YES") counts[weekdayIndex].yes += 1;
    if (row.answer === "NO") counts[weekdayIndex].no += 1;
  }

  return WEEK_DAYS.map((day, index) => ({
    label: day.label,
    longLabel: day.longLabel,
    ...toAnswerSplit(counts[index].yes, counts[index].no),
  }));
}

function toWeekdaySummaryEntry(day) {
  return {
    hasData: true,
    label: day.longLabel,
    shortLabel: day.label,
    percentage: day.yesSharePercentage,
    total: day.total,
  };
}

export function buildWeekdaySummary(weekdayChart) {
  const recorded = weekdayChart.filter((day) => day.total > 0);

  if (!recorded.length) {
    const empty = { hasData: false, label: NO_WEEKDAY_DATA, shortLabel: NO_WEEKDAY_DATA, percentage: 0, total: 0 };
    return { highest: empty, lowest: empty };
  }

  // `reduce` without a seed starts on the first recorded weekday, and only a
  // strictly better share displaces the day already held — so a tie always
  // keeps the earlier weekday whatever order the rows arrived in.
  const highest = recorded.reduce((best, day) => (
    day.yesSharePercentage > best.yesSharePercentage ? day : best
  ));
  const lowest = recorded.reduce((least, day) => (
    day.yesSharePercentage < least.yesSharePercentage ? day : least
  ));

  return { highest: toWeekdaySummaryEntry(highest), lowest: toWeekdaySummaryEntry(lowest) };
}

function countAnswers(rows) {
  let yes = 0;
  let no = 0;

  for (const row of rows) {
    if (row.answer === "YES") yes += 1;
    if (row.answer === "NO") no += 1;
  }

  return { yes, no };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hashString(value) {
  return [...value].reduce((hash, character) => (
    (hash * 31 + character.charCodeAt(0)) % 997
  ), 7);
}

function getTimezoneArea(timezone) {
  return TIMEZONE_AREAS.find((area) => timezone?.startsWith(`${area.prefix}/`)) || {
    x: 44,
    y: 66,
    spreadX: 12,
    spreadY: 12,
  };
}

function getTimezoneCityLabel(timezone) {
  const [, ...parts] = String(timezone || "").split("/");
  return (parts.at(-1) || timezone || "Unknown").replace(/_/g, " ");
}

function getTimezonePoint(timezone) {
  const area = getTimezoneArea(timezone);
  const hash = hashString(timezone || "");
  const xOffset = ((hash % 17) / 16 - 0.5) * area.spreadX;
  const yOffset = ((Math.floor(hash / 17) % 17) / 16 - 0.5) * area.spreadY;

  return {
    x: clamp(Math.round((area.x + xOffset) * 10) / 10, 12, 88),
    y: clamp(Math.round((area.y + yOffset) * 10) / 10, 16, 82),
  };
}

function buildPrayerWorld(rows) {
  const timezones = new Map();

  for (const row of rows) {
    const timezone = row.timezone || "Unknown";
    const current = timezones.get(timezone) || {
      id: timezone.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      label: getTimezoneCityLabel(timezone),
      timezone,
      count: 0,
      ...getTimezonePoint(timezone),
    };
    current.count += 1;
    timezones.set(timezone, current);
  }

  const regions = [...timezones.values()].sort((first, second) => (
    second.count - first.count || first.label.localeCompare(second.label)
  ));
  const totalUsers = regions.reduce((total, region) => total + region.count, 0);
  const maxCount = Math.max(0, ...regions.map((region) => region.count));
  const activeRegion = regions.reduce((topRegion, region) => {
    if (!topRegion || region.count > topRegion.count) return region;
    return topRegion;
  }, null);

  return {
    activeRegion: maxCount > 0 ? activeRegion.label : "Not enough data",
    totalUsers,
    regions: regions.map((region) => ({
      ...region,
      percentage: totalUsers > 0 ? Math.round((region.count / totalUsers) * 100) : 0,
      pointScale: maxCount > 0 ? 0.72 + (region.count / maxCount) * 0.72 : 0.72,
      isActive: maxCount > 0 && region.id === activeRegion.id,
    })),
  };
}

function toGoalAnswerRows(source) {
  return buildGoalHistoryRows(source?.dailyGoals, source?.dailyGoalCheckIns);
}

export async function loadStatisticsAnswerRows(source, userId, repository = statisticsRepository) {
  if (source === "reading") {
    const [historyRows, currentUserHistoryRows] = await Promise.all([
      repository.findAllReadingAnswerRows(),
      repository.findReadingAnswerRowsByUserId(userId),
    ]);
    return { historyRows, currentUserHistoryRows };
  }

  if (source === "goals") {
    const [allSources, currentUserSource] = await Promise.all([
      repository.findAllGoalAnswerSources(),
      repository.findGoalAnswerSourceByUserId(userId),
    ]);
    return {
      historyRows: allSources.flatMap(toGoalAnswerRows),
      currentUserHistoryRows: toGoalAnswerRows(currentUserSource),
    };
  }

  const [historyRows, currentUserHistoryRows] = await Promise.all([
    repository.findAllRecoveryAnswerRows(),
    repository.findRecoveryAnswerRowsByUserId(userId),
  ]);
  return { historyRows, currentUserHistoryRows };
}

export async function getStatisticsSummary(userId, source = "recovery") {
  const [{ historyRows, currentUserHistoryRows }, timezoneRows] = await Promise.all([
    loadStatisticsAnswerRows(source, userId),
    findAuthUserTimezones(),
  ]);

  const communityCounts = countAnswers(historyRows);
  const yourCounts = countAnswers(currentUserHistoryRows);
  const weekdayChart = buildWeekdayChart(historyRows);

  return {
    yourAnswers: toAnswerSplit(yourCounts.yes, yourCounts.no),
    communityAnswers: toAnswerSplit(communityCounts.yes, communityCounts.no),
    weekdayChart,
    weekdaySummary: buildWeekdaySummary(weekdayChart),
    prayerWorld: buildPrayerWorld(timezoneRows),
  };
}
