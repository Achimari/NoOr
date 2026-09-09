
export const STATUS_KEYS = {
  GUARD: "GUARD",
  SHIELD: "SHIELD",
  BURN: "BURN",
  EXPOSED: "EXPOSED",
  RIPOSTE: "RIPOSTE",
};

export const STATUS_ORDER = [
  STATUS_KEYS.GUARD,
  STATUS_KEYS.SHIELD,
  STATUS_KEYS.BURN,
  STATUS_KEYS.EXPOSED,
  STATUS_KEYS.RIPOSTE,
];

export const STATUS_LABELS = {
  [STATUS_KEYS.GUARD]: { label: "Guard", icon: "guard" },
  [STATUS_KEYS.SHIELD]: { label: "Shield", icon: "shield" },
  [STATUS_KEYS.BURN]: { label: "Burn", icon: "burn" },
  [STATUS_KEYS.EXPOSED]: { label: "Exposed", icon: "exposed" },
  [STATUS_KEYS.RIPOSTE]: { label: "Riposte", icon: "riposte" },
};

export const CHARGE_STATUS_KEYS = [STATUS_KEYS.EXPOSED, STATUS_KEYS.RIPOSTE];

function isChargeKey(key) {
  return CHARGE_STATUS_KEYS.includes(key);
}

export function hasCharge(combatant, key) {
  return Number(combatant?.statuses?.[key]?.charges) > 0;
}

export function chargesOf(combatant, key) {
  return hasCharge(combatant, key) ? combatant.statuses[key].charges : 0;
}

export function grantCharge(combatant, key) {
  if (!isChargeKey(key)) {
    throw new Error(`${key} is not a charge status`);
  }

  const refreshed = hasCharge(combatant, key);
  combatant.statuses = combatant.statuses || {};
  combatant.statuses[key] = { key, charges: 1 };

  return refreshed ? "REFRESHED" : "APPLIED";
}

export function consumeCharge(combatant, key) {
  if (!hasCharge(combatant, key)) return false;

  delete combatant.statuses[key];
  if (!Object.keys(combatant.statuses).length) delete combatant.statuses;

  return true;
}

export function describeStatuses(combatant, { tactics = false } = {}) {
  const descriptors = [];

  for (const key of STATUS_ORDER) {
    const display = STATUS_LABELS[key];

    if (key === STATUS_KEYS.GUARD && combatant.defending) {
      descriptors.push({ key, label: display.label, icon: display.icon });
    }
    if (key === STATUS_KEYS.SHIELD && combatant.shield > 0) {
      descriptors.push({ key, label: display.label, icon: display.icon, amount: combatant.shield });
    }
    if (key === STATUS_KEYS.BURN && combatant.burn?.turns > 0) {
      descriptors.push({
        key,
        label: display.label,
        icon: display.icon,
        turns: combatant.burn.turns,
        amount: combatant.burn.damage,
      });
    }
    if (tactics && isChargeKey(key) && hasCharge(combatant, key)) {
      descriptors.push({ key, label: display.label, icon: display.icon, charges: chargesOf(combatant, key) });
    }
  }

  return descriptors;
}
