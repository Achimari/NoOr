import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { buildStreaks, sanitizePresentation } from "../src/services/profileService.js";
import { DEFAULT_ACCENT_KEY, DEFAULT_EMBLEM_KEY, PRESET_ACCENTS, PRESET_EMBLEMS } from "../src/domain/constants.js";

const PUBLIC_PROFILE_FIELDS = [
  "isOwner", "id", "name", "emblemKey", "accentKey",
  "stats", "derived", "spells", "streaks", "sharing",
];

const FORBIDDEN_PUBLIC_FIELDS = [
  "timezone", "passwordHash", "sessions", "telegram", "telegramConnection",
  "prayers", "reflection", "passages", "goals", "text", "missedDaysSyncDateKey",
  "email", "createdAt", "battles", "queue",
];

describe("public profile contract", () => {
  it("declares exactly the approved public fields", () => {
    assert.deepEqual([...PUBLIC_PROFILE_FIELDS].sort(), [
      "accentKey", "derived", "emblemKey", "id", "isOwner",
      "name", "sharing", "spells", "stats", "streaks",
    ]);
  });

  it("never lists a forbidden field among the public fields", () => {
    for (const field of FORBIDDEN_PUBLIC_FIELDS) {
      assert.ok(!PUBLIC_PROFILE_FIELDS.includes(field), `${field} must not be public`);
    }
  });

  it("exposes only a spell count publicly, not the owner's spell catalog", () => {
    assert.ok(PUBLIC_PROFILE_FIELDS.includes("spells"));
    const publicSpells = { unlockedCount: 3 };
    assert.deepEqual(Object.keys(publicSpells), ["unlockedCount"]);
  });
});

describe("sanitizePresentation", () => {
  it("accepts every shipped preset", () => {
    for (const emblem of PRESET_EMBLEMS) {
      assert.equal(sanitizePresentation({ emblemKey: emblem.key, accentKey: "neutral" }).emblemKey, emblem.key);
    }
    for (const accent of PRESET_ACCENTS) {
      assert.equal(sanitizePresentation({ emblemKey: "dawn", accentKey: accent.key }).accentKey, accent.key);
    }
  });

  it("falls back to defaults for an unknown key", () => {
    const result = sanitizePresentation({ emblemKey: "skull", accentKey: "neon" });

    assert.equal(result.emblemKey, DEFAULT_EMBLEM_KEY);
    assert.equal(result.accentKey, DEFAULT_ACCENT_KEY);
  });

  it("refuses anything that is not a stable key, so no CSS or markup can be stored", () => {
    const injected = sanitizePresentation({
      emblemKey: "<img src=x onerror=alert(1)>",
      accentKey: "red; background: url(http://evil)",
    });

    assert.equal(injected.emblemKey, DEFAULT_EMBLEM_KEY);
    assert.equal(injected.accentKey, DEFAULT_ACCENT_KEY);
  });

  it("falls back for missing values rather than emitting undefined", () => {
    const result = sanitizePresentation({});

    assert.equal(result.emblemKey, DEFAULT_EMBLEM_KEY);
    assert.equal(result.accentKey, DEFAULT_ACCENT_KEY);
  });
});

describe("profile streak history", () => {
  it("returns every recorded day and the inactivity for each streak", () => {
    const dateKeys = Array.from({ length: 16 }, (unused, index) => (
      `2026-08-${String(index + 1).padStart(2, "0")}`
    ));
    const source = {
      checkInHistory: dateKeys.map((dateKey) => ({ dateKey, answer: "YES" })),
      readingCheckIns: dateKeys.map((dateKey) => ({ dateKey, answer: "YES" })),
      dailyGoals: dateKeys.map((dateKey) => ({ dateKey, completedAt: new Date(`${dateKey}T10:00:00Z`) })),
    };

    const streaks = buildStreaks(source, "2026-08-18", "2026-08-01");

    for (const streak of Object.values(streaks)) {
      assert.equal(streak.days.length, 16);
      assert.equal(streak.inactiveDays, 1);
      assert.equal(streak.isInactive, true);
      assert.equal("recent" in streak, false);
    }
  });

  it("preserves the user's Yes or No answer instead of exposing streak eligibility", () => {
    const streaks = buildStreaks({
      checkInHistory: [
        { dateKey: "2026-09-04", answer: "YES" },
        { dateKey: "2026-09-05", answer: "NO" },
      ],
      readingCheckIns: [
        { dateKey: "2026-09-04", answer: "NO" },
        { dateKey: "2026-09-05", answer: "YES" },
      ],
      dailyGoals: [
        { dateKey: "2026-09-04", completedAt: new Date("2026-09-04T10:00:00Z") },
      ],
      dailyGoalCheckIns: [
        { dateKey: "2026-09-04", answer: "YES" },
        { dateKey: "2026-09-05", answer: "NO" },
      ],
    }, "2026-09-05", "2026-09-01");

    assert.deepEqual(
      streaks.recovery.days.map(({ dateKey, answer }) => ({ dateKey, answer })),
      [
        { dateKey: "2026-09-05", answer: "NO" },
        { dateKey: "2026-09-04", answer: "YES" },
      ],
    );
    assert.deepEqual(
      streaks.reading.days.map(({ dateKey, answer }) => ({ dateKey, answer })),
      [
        { dateKey: "2026-09-05", answer: "YES" },
        { dateKey: "2026-09-04", answer: "NO" },
      ],
    );
    assert.deepEqual(
      streaks.goals.days.map(({ dateKey, answer }) => ({ dateKey, answer })),
      [
        { dateKey: "2026-09-05", answer: "NO" },
        { dateKey: "2026-09-04", answer: "YES" },
      ],
    );
    assert.equal(streaks.goals.recordedDays, 2);
    assert.equal(streaks.goals.inactiveDays, 0);
  });

  it("loads explicit task-day answers without loading private task text", () => {
    const repository = readFileSync(
      new URL("../src/repositories/profileRepository.js", import.meta.url),
      "utf8",
    );

    assert.match(repository, /dailyGoalCheckIns:\s*\{[\s\S]*?select:\s*\{\s*dateKey:\s*true,\s*answer:\s*true\s*\}/);
    assert.match(repository, /dailyGoals:\s*\{\s*select:\s*\{\s*dateKey:\s*true,\s*completedAt:\s*true\s*\}/);
    assert.doesNotMatch(repository, /dailyGoals:\s*\{\s*select:\s*\{[^}]*text:\s*true/);
  });

  it("labels history as answers and keeps each complete date on one line", () => {
    const template = readFileSync(
      new URL("../src/views/pages/partials/profile-content.ejs", import.meta.url),
      "utf8",
    );
    const styles = readFileSync(
      new URL("../public/styles/game/profile.css", import.meta.url),
      "utf8",
    );

    assert.match(template, /<th scope="col">Answer<\/th>/);
    assert.match(template, /day\.answer === "YES" \? "Yes" : day\.answer === "NO_DATA" \? "No data" : "No"/);
    assert.doesNotMatch(template, /Not counted|Counted/);
    assert.match(styles, /\.profile-streak-table th\[scope="row"\][^{]*\{[^}]*white-space:\s*nowrap/s);
  });
});
