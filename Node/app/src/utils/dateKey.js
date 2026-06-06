import { env } from "../config/env.js";
import { getSafeTimezone } from "./timezones.js";

export function getZonedParts(date = new Date(), timezone = env.APP_TIMEZONE) {
  const timeZone = getSafeTimezone(timezone);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
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
  const parts = getZonedParts(date, timeZone);
  const utcDate = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
  );

  return utcDate - date.getTime();
}

function zonedDateTimeToUtc({ year, month, day, hour }, timezone = env.APP_TIMEZONE) {
  const timeZone = getSafeTimezone(timezone);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, 0, 0, 0));
  const offsetMs = getOffsetMs(utcGuess, timeZone);
  const firstPass = new Date(utcGuess.getTime() - offsetMs);
  const secondOffsetMs = getOffsetMs(firstPass, timeZone);

  return new Date(utcGuess.getTime() - secondOffsetMs);
}

export function getTodayDateKey(now = new Date(), timezone = env.APP_TIMEZONE) {
  const timeZone = getSafeTimezone(timezone);
  const parts = getZonedParts(now, timeZone);
  const localHour = Number(parts.hour);
  const effectiveDate =
    localHour < env.CHECK_IN_RESET_HOUR ? new Date(now.getTime() - 24 * 60 * 60 * 1000) : now;
  const effectiveParts = getZonedParts(effectiveDate, timeZone);

  return `${effectiveParts.year}-${effectiveParts.month}-${effectiveParts.day}`;
}

export function getNextResetAt(now = new Date(), timezone = env.APP_TIMEZONE) {
  const timeZone = getSafeTimezone(timezone);
  const parts = getZonedParts(now, timeZone);
  const resetToday = zonedDateTimeToUtc({
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: env.CHECK_IN_RESET_HOUR,
  }, timeZone);

  if (resetToday.getTime() > now.getTime()) {
    return resetToday;
  }

  const nextLocalDay = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + 1));
  const nextParts = getZonedParts(nextLocalDay, timeZone);

  return zonedDateTimeToUtc({
    year: Number(nextParts.year),
    month: Number(nextParts.month),
    day: Number(nextParts.day),
    hour: env.CHECK_IN_RESET_HOUR,
  }, timeZone);
}
