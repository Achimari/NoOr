import { findCheckInHistoryByUserId } from "../repositories/checkInRepository.js";

const WEEK_DAYS = [
  { label: "Mon", longLabel: "Monday" },
  { label: "Tue", longLabel: "Tuesday" },
  { label: "Wed", longLabel: "Wednesday" },
  { label: "Thu", longLabel: "Thursday" },
  { label: "Fri", longLabel: "Friday" },
  { label: "Sat", longLabel: "Saturday" },
  { label: "Sun", longLabel: "Sunday" },
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

export async function getStatisticsSummary(userId) {
  const historyRows = await findCheckInHistoryByUserId(userId);
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
    totals: {
      yes: totalYes,
      no: totalNo,
      answers: totalYes + totalNo,
    },
  };
}
