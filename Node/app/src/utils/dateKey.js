import { env } from "../config/env.js";

export function getZonedParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: env.APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  return Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
}

function getOffsetMs(date, timeZone) {
  const parts = getZonedParts(date);
  const utcDate = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
  );

  return utcDate - date.getTime();
}

function zonedDateTimeToUtc({ year, month, day, hour }) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, 0, 0, 0));
  const offsetMs = getOffsetMs(utcGuess, env.APP_TIMEZONE);
  const firstPass = new Date(utcGuess.getTime() - offsetMs);
  const secondOffsetMs = getOffsetMs(firstPass, env.APP_TIMEZONE);

  return new Date(utcGuess.getTime() - secondOffsetMs);
}

export function getTodayDateKey(now = new Date()) {
  const parts = getZonedParts(now);
  const localHour = Number(parts.hour);
  const effectiveDate =
    localHour < env.CHECK_IN_RESET_HOUR ? new Date(now.getTime() - 24 * 60 * 60 * 1000) : now;
  const effectiveParts = getZonedParts(effectiveDate);

  return `${effectiveParts.year}-${effectiveParts.month}-${effectiveParts.day}`;
}

export function getNextResetAt(now = new Date()) {
  const parts = getZonedParts(now);
  const resetToday = zonedDateTimeToUtc({
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: env.CHECK_IN_RESET_HOUR,
  });

  if (resetToday.getTime() > now.getTime()) {
    return resetToday;
  }

  const nextLocalDay = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + 1));
  const nextParts = getZonedParts(nextLocalDay);

  return zonedDateTimeToUtc({
    year: Number(nextParts.year),
    month: Number(nextParts.month),
    day: Number(nextParts.day),
    hour: env.CHECK_IN_RESET_HOUR,
  });
}
