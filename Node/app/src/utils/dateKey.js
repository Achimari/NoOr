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

export function isCalendarDateKey(dateKey) {
  const value = String(dateKey ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T12:00:00.000Z`);

  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function shiftDateKey(dateKey, days) {
  if (!isCalendarDateKey(dateKey)) return null;

  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

export function getTodayDateKey(
  now = new Date(),
  timezone = env.APP_TIMEZONE,
  resetHour = env.CHECK_IN_RESET_HOUR,
) {
  const timeZone = getSafeTimezone(timezone);
  const parts = getZonedParts(now, timeZone);
  const localHour = Number(parts.hour);
  const effectiveDate =
    localHour < resetHour ? new Date(now.getTime() - 24 * 60 * 60 * 1000) : now;
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

export function getMonthRangeForDateKey(dateKey) {
  const [year, month] = String(dateKey).split("-").map(Number);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Invalid date key: ${dateKey}`);
  }

  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const pad = (value) => String(value).padStart(2, "0");

  return {
    monthKey: `${year}-${pad(month)}`,
    startDateKey: `${year}-${pad(month)}-01`,
    endDateKeyExclusive: `${nextYear}-${pad(nextMonth)}-01`,
  };
}

export function getEffectiveMonthRange(
  now = new Date(),
  timezone = env.APP_TIMEZONE,
  resetHour = env.CHECK_IN_RESET_HOUR,
) {
  return getMonthRangeForDateKey(getTodayDateKey(now, timezone, resetHour));
}
