import { env } from "../config/env.js";

const regionCountryCodes = {
  Africa: "AF",
  America: "US",
  Antarctica: "AQ",
  Arctic: "AQ",
  Asia: "AS",
  Atlantic: "AT",
  Australia: "AU",
  Europe: "EU",
  Indian: "IN",
  Pacific: "PC",
};

const timezoneCountryCodes = {
  "America/New_York": "US",
  "America/Chicago": "US",
  "America/Denver": "US",
  "America/Los_Angeles": "US",
  "Asia/Tokyo": "JP",
  "Asia/Dubai": "AE",
  "Asia/Jerusalem": "IL",
  "Australia/Sydney": "AU",
  "Europe/Amsterdam": "NL",
  "Europe/Berlin": "DE",
  "Europe/Helsinki": "FI",
  "Europe/Istanbul": "TR",
  "Europe/London": "GB",
  "Europe/Madrid": "ES",
  "Europe/Moscow": "RU",
  "Europe/Oslo": "NO",
  "Europe/Paris": "FR",
  "Europe/Riga": "LV",
  "Europe/Rome": "IT",
  "Europe/Stockholm": "SE",
  "Europe/Tallinn": "EE",
  "Europe/Vilnius": "LT",
  "Europe/Warsaw": "PL",
};

function loadSupportedTimezones() {
  if (typeof Intl.supportedValuesOf === "function") {
    return Intl.supportedValuesOf("timeZone");
  }

  return [
    "Europe/Riga",
    "Europe/London",
    "Europe/Berlin",
    "Europe/Paris",
    "Europe/Vilnius",
    "Europe/Tallinn",
    "America/New_York",
    "America/Chicago",
    "America/Los_Angeles",
    "Asia/Tokyo",
    "Australia/Sydney",
  ];
}

const supportedTimezones = loadSupportedTimezones();
const supportedTimezoneSet = new Set(supportedTimezones);

export function isSupportedTimezone(timezone) {
  if (!timezone || typeof timezone !== "string") return false;

  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(new Date());
    return supportedTimezoneSet.has(timezone);
  } catch {
    return false;
  }
}

export function getSafeTimezone(timezone) {
  return isSupportedTimezone(timezone) ? timezone : env.APP_TIMEZONE;
}

function formatTimezoneLabel(timezone) {
  const [region, ...parts] = timezone.split("/");
  const city = (parts.at(-1) || timezone).replace(/_/g, " ");
  const countryCode = timezoneCountryCodes[timezone] || regionCountryCodes[region] || region;

  return `${countryCode}/${city}`;
}

export function getTimezoneLabel(timezone) {
  return formatTimezoneLabel(getSafeTimezone(timezone));
}

const timezoneOptions = supportedTimezones
  .map((value) => ({
    value,
    label: formatTimezoneLabel(value),
  }))
  .sort((first, second) => first.label.localeCompare(second.label));

export function getTimezoneOptions() {
  return timezoneOptions;
}
