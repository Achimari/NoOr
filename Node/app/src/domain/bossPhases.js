import { ACTIONS } from "./combat.js";

export const INTENT_SEVERITIES = ["LIGHT", "STANDARD", "HEAVY", "CONTROL"];

export const PHASE_THRESHOLDS = {
  STEADY: 1,
  PRESSURE: 0.6,
  LAST_STAND: 0.25,
};

const strike = {
  action: ACTIONS.ATTACK,
  severity: "STANDARD",
  label: "Direct strike",
  counter: "Guard halves this hit.",
};

const brace = {
  action: ACTIONS.DEFEND,
  severity: "LIGHT",
  label: "Bracing",
  counter: "Break punishes a guard, and opens it up afterwards.",
};

const guardBreak = {
  action: ACTIONS.BREAK,
  severity: "STANDARD",
  label: "Guard break",
  counter: "Do not guard this one: Break is strongest against a guard.",
};

const surge = {
  action: ACTIONS.SURGE,
  severity: "HEAVY",
  label: "Heavy surge",
  counter: "Guard halves this hit.",
};

function cast(spellKey, label, counter) {
  return { action: ACTIONS.CAST, spellKey, severity: "CONTROL", label, counter };
}

export const FALLBACK_DESCRIPTOR = strike;

export const THE_DOUBT_PHASES = [
  {
    key: "STEADY",
    threshold: PHASE_THRESHOLDS.STEADY,
    banner: "The Doubt holds its ground.",
    sequence: [strike, strike, brace, guardBreak],
  },
  {
    key: "PRESSURE",
    threshold: PHASE_THRESHOLDS.PRESSURE,
    banner: "The Doubt presses harder.",
    sequence: [brace, guardBreak, strike, brace, strike],
  },
];

export const THE_DISTRACTION_PHASES = [
  {
    key: "STEADY",
    threshold: PHASE_THRESHOLDS.STEADY,
    banner: "The Distraction circles.",
    sequence: [
      strike,
      guardBreak,
      cast("still-water", "Pulls you back", "You lose tempo, not health. Spend the turn on something that keeps."),
      strike,
      guardBreak,
    ],
  },
  {
    key: "PRESSURE",
    threshold: PHASE_THRESHOLDS.PRESSURE,
    banner: "The Distraction speeds up.",
    sequence: [
      guardBreak,
      strike,
      cast("still-water", "Pulls you back", "You lose tempo, not health. Spend the turn on something that keeps."),
      strike,
      strike,
      guardBreak,
    ],
  },
];

export const THE_DISCOURAGEMENT_PHASES = [
  {
    key: "STEADY",
    threshold: PHASE_THRESHOLDS.STEADY,
    banner: "The Discouragement settles in.",
    sequence: [
      strike,
      strike,
      cast("quiet-resolve", "Raises a shield", "Work through it, or wait for it to run down."),
      strike,
      brace,
    ],
  },
  {
    key: "PRESSURE",
    threshold: PHASE_THRESHOLDS.PRESSURE,
    banner: "The Discouragement leans on you.",
    sequence: [
      cast("kindled-lamp", "Sets a lingering burn", "It ticks at the start of your turns. Finish sooner, or recover between them."),
      strike,
      brace,
      strike,
      strike,
    ],
  },
  {
    key: "LAST_STAND",
    threshold: PHASE_THRESHOLDS.LAST_STAND,
    banner: "The Discouragement gathers everything it has left.",
    sequence: [brace, surge, strike],
  },
];

export function selectPhase(encounter, healthRatio) {
  const ratio = Number.isFinite(healthRatio) ? Math.max(0, healthRatio) : 1;
  const phases = encounter?.phases || [];
  let chosen = phases[0] || null;

  for (const phase of phases) {
    if (ratio <= phase.threshold && (!chosen || phase.threshold <= chosen.threshold)) {
      chosen = phase;
    }
  }

  return chosen;
}

export function descriptorAt(phase, cycleIndex) {
  const sequence = phase?.sequence?.length ? phase.sequence : [FALLBACK_DESCRIPTOR];

  return sequence[Math.abs(Math.trunc(cycleIndex) || 0) % sequence.length];
}
