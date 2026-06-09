import { findAllCheckInHistory } from "../repositories/checkInRepository.js";
import { findAuthUserTimezones } from "../repositories/authRepository.js";

const WEEK_DAYS = [
  { label: "Mon", longLabel: "Monday" },
  { label: "Tue", longLabel: "Tuesday" },
  { label: "Wed", longLabel: "Wednesday" },
  { label: "Thu", longLabel: "Thursday" },
  { label: "Fri", longLabel: "Friday" },
  { label: "Sat", longLabel: "Saturday" },
  { label: "Sun", longLabel: "Sunday" },
];

const TIME_OF_DAY_GROUPS = [
  { id: "day", label: "Day", tone: "day" },
  { id: "night", label: "Night", tone: "night" },
];

const TIMEZONE_AREAS = [
  { prefix: "Europe", x: 52, y: 31, spreadX: 16, spreadY: 12 },
  { prefix: "Asia", x: 70, y: 39, spreadX: 18, spreadY: 16 },
  { prefix: "America", x: 25, y: 45, spreadX: 18, spreadY: 18 },
  { prefix: "Africa", x: 51, y: 55, spreadX: 14, spreadY: 15 },
  { prefix: "Australia", x: 78, y: 67, spreadX: 10, spreadY: 9 },
  { prefix: "Pacific", x: 82, y: 64, spreadX: 12, spreadY: 11 },
];

function getWeekdayIndex(dateKey) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return (date.getUTCDay() + 6) % 7;
}

function getTopDay(days, field) {
  return days.reduce((topDay, day) => {
    if (!topDay || day[field] > topDay[field]) return day;
    return topDay;
  }, null);
}

function buildChartRows(days, field, maxValue) {
  return days.map((day) => ({
    ...day,
    value: day[field],
    percentage: maxValue > 0 ? Math.max(6, Math.round((day[field] / maxValue) * 100)) : 0,
  }));
}

function buildDistributionRows(rows, maxValue) {
  const totalValue = rows.reduce((total, row) => total + row.value, 0);

  return rows.map((row) => ({
    ...row,
    percentage: maxValue > 0 ? Math.max(6, Math.round((row.value / maxValue) * 100)) : 0,
    sharePercentage: totalValue > 0 ? Math.round((row.value / totalValue) * 100) : 0,
  }));
}

function getHourInTimezone(date, timezone) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hour12: false,
      timeZone: timezone || "UTC",
    }).formatToParts(date);
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    return Number.isFinite(hour) ? hour : null;
  } catch {
    return date.getUTCHours();
  }
}

function buildTimeOfDayChart(historyRows) {
  const counts = TIME_OF_DAY_GROUPS.map((group) => ({ ...group, value: 0 }));

  for (const row of historyRows) {
    const answeredAt = new Date(row.createdAt);
    if (Number.isNaN(answeredAt.getTime())) continue;

    const hour = getHourInTimezone(answeredAt, row.user?.timezone);
    if (hour === null) continue;

    if (hour >= 6 && hour < 18) {
      counts[0].value += 1;
    } else {
      counts[1].value += 1;
    }
  }

  return buildDistributionRows(counts, Math.max(0, ...counts.map((row) => row.value)));
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

export async function getStatisticsSummary() {
  const [historyRows, timezoneRows] = await Promise.all([
    findAllCheckInHistory(),
    findAuthUserTimezones(),
  ]);
  const days = WEEK_DAYS.map((day) => ({
    ...day,
    yes: 0,
    no: 0,
  }));

  for (const row of historyRows) {
    const weekdayIndex = getWeekdayIndex(row.dateKey);
    if (weekdayIndex === null) continue;

    if (row.answer === "YES") {
      days[weekdayIndex].yes += 1;
    }

    if (row.answer === "NO") {
      days[weekdayIndex].no += 1;
    }
  }

  const maxNo = Math.max(0, ...days.map((day) => day.no));
  const maxYes = Math.max(0, ...days.map((day) => day.yes));
  const hardestDay = getTopDay(days, "no");
  const easiestDay = getTopDay(days, "yes");
  const totalYes = days.reduce((total, day) => total + day.yes, 0);
  const totalNo = days.reduce((total, day) => total + day.no, 0);
  const answerDistribution = [
    { id: "yes", label: "Yes", tone: "yes", value: totalYes },
    { id: "no", label: "No", tone: "no", value: totalNo },
  ];
  const maxAnswerDistribution = Math.max(0, ...answerDistribution.map((row) => row.value));

  return {
    hardestDay: {
      label: maxNo > 0 ? hardestDay.longLabel : "Not enough data",
      value: maxNo,
      caption: maxNo > 0 ? `${maxNo} No answer${maxNo === 1 ? "" : "s"}` : "Answer more days to reveal it",
    },
    easiestDay: {
      label: maxYes > 0 ? easiestDay.longLabel : "Not enough data",
      value: maxYes,
      caption: maxYes > 0 ? `${maxYes} Yes answer${maxYes === 1 ? "" : "s"}` : "Answer more days to reveal it",
    },
    noChart: buildChartRows(days, "no", maxNo),
    yesChart: buildChartRows(days, "yes", maxYes),
    timeOfDayChart: buildTimeOfDayChart(historyRows),
    answerDistributionChart: buildDistributionRows(answerDistribution, maxAnswerDistribution),
    totals: {
      yes: totalYes,
      no: totalNo,
      answers: totalYes + totalNo,
    },
    prayerWorld: buildPrayerWorld(timezoneRows),
  };
}
