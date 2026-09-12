
export const STATS = ["strength", "dexterity", "intelligence", "wisdom"];

export const ALLOCATABLE_STATS = ["strength", "dexterity", "intelligence"];

export const BASE_POINT_TOTAL = 10;

export const REWARD_SOURCES = {
  RECOVERY: "RECOVERY",
  READING: "READING",
  REFLECTION: "REFLECTION",
  GOALS: "GOALS",
};

export const REWARD_RULES = [
  { stat: "strength", source: REWARD_SOURCES.RECOVERY },
  { stat: "dexterity", source: REWARD_SOURCES.GOALS },
  { stat: "intelligence", source: REWARD_SOURCES.READING },
  { stat: "wisdom", source: REWARD_SOURCES.REFLECTION },
];

export const DEXTERITY_REQUIRED_GOALS = 5;

export const COMBAT = {
  BASE_HEALTH: 100,
  HEALTH_PER_STRENGTH: 8,
  BASE_DAMAGE: 8,
  DAMAGE_PER_STRENGTH: 2,
  BASE_MANA: 20,
  MANA_PER_INTELLIGENCE: 5,
  MIN_SPEED: 1,
  GAUGE_THRESHOLD: 100,
  DEFEND_REDUCTION: 0.5,
  PROJECTED_TURNS: 4,
  MAX_TURNS: 200,

  RESOLVE_MIN: 0,
  RESOLVE_MAX: 100,
  RESOLVE_ON_ATTACK: 20,
  RESOLVE_ON_GUARD_ABSORB: 25,
  RESOLVE_ON_BREAK: 10,

  BREAK_GUARDED_MULTIPLIER: 1.25,
  BREAK_UNGUARDED_MULTIPLIER: 0.6,

  SURGE_COST: 60,
  SURGE_MULTIPLIER: 1.75,

  EXPOSED_MULTIPLIER: 1.25,
  RIPOSTE_MULTIPLIER: 1.3,

  SHIELD_CAP_RATIO: 0.35,

  BOSS_SPEED_RATIO_CAP: 1.4,
};

export const RATING_WEIGHTS = {
  HEALTH: 0.5,
  DAMAGE: 5,
  MANA: 0.5,
  SPEED: 11,
  SPELL: 4,
};

export const FORMULA_VERSION = 3;

export const PVP_FORMULA_VERSION = 2;

export const FORMULA_VERSIONS = {
  BASE: 1,
  RESOLVE: 2,
  TACTICS: 3,
};

export const EQUIPPED_SPELL_LIMIT = 3;

export const PRESET_EMBLEMS = [
  { key: "dawn", label: "Dawn" },
  { key: "lantern", label: "Lantern" },
  { key: "still-water", label: "Still Water" },
  { key: "north-star", label: "North Star" },
  { key: "open-gate", label: "Open Gate" },
  { key: "quiet-hill", label: "Quiet Hill" },
];

/* The keys are the stored values and must not change: an account that chose
   `green` years ago still holds `green`, and every API, validator and test
   still speaks in these five words.
 *
 * The labels changed on 2026-09-12, when the interface became monochrome. A
 * control called "Green" that shows no green is a promise the product cannot
 * keep, so each preset is now named for the printed fill it actually renders —
 * solid ink, a hatch, a cross-hatch, a stipple, a bar. Nothing is reset and no
 * choice is lost; the same five options render as five distinguishable fills.
 * Recorded in CONSTRAINTS.md. */
export const PRESET_ACCENTS = [
  { key: "neutral", label: "Solid" },
  { key: "green", label: "Hatch" },
  { key: "amber", label: "Cross-hatch" },
  { key: "blue", label: "Stipple" },
  { key: "rose", label: "Bar" },
];

export const DEFAULT_EMBLEM_KEY = "dawn";
export const DEFAULT_ACCENT_KEY = "neutral";

export const RATE_LIMITS = {
  QUEUE_JOIN: { windowMs: 5 * 60 * 1000, limit: 10 },
  SPELL_UNLOCK: { windowMs: 5 * 60 * 1000, limit: 30 },
  BATTLE_ACTION: { windowMs: 60 * 1000, limit: 120 },
  PROFILE_WRITE: { windowMs: 5 * 60 * 1000, limit: 30 },
};

export const PVP = {
  QUEUE_TTL_MS: 5 * 60 * 1000,
  INITIAL_BAND: 0.08,
  BAND_STEP: 0.08,
  BAND_STEP_MS: 10_000,
  MAX_BAND: 0.6,
  ACTION_TIMEOUT_MS: 90 * 1000,
  POLL_MS: 2000,
  QUEUE_POLL_MS: 3000,
};
