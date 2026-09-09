import { ACHIEVEMENT_CATEGORIES, ACHIEVEMENT_TOTAL } from "../domain/achievements.js";
import { ENCOUNTERS } from "../domain/bosses.js";
import { PHASE_THRESHOLDS } from "../domain/bossPhases.js";
import { SPELL_CATALOG } from "../domain/spells.js";
import {
  BASE_POINT_TOTAL,
  COMBAT,
  DEXTERITY_REQUIRED_GOALS,
  EQUIPPED_SPELL_LIMIT,
  FORMULA_VERSION,
  PVP,
  PVP_FORMULA_VERSION,
  FORMULA_VERSIONS,
} from "../domain/constants.js";

export function renderHelpPage(req, res) {
  return res.render("pages/help", {
    pageId: "help",
    title: "Help",
    help: {
      basePoints: BASE_POINT_TOTAL,
      requiredGoals: DEXTERITY_REQUIRED_GOALS,
      combat: COMBAT,
      spellLimit: EQUIPPED_SPELL_LIMIT,
      spells: SPELL_CATALOG.map((spell) => ({
        name: spell.name,
        wisdomRequired: spell.wisdomRequired,
        manaCost: spell.manaCost,
        cooldownTurns: spell.cooldownTurns,
        target: spell.target,
        summary: spell.summary,
      })),
      encounters: ENCOUNTERS.map((encounter) => ({ name: encounter.name, blurb: encounter.blurb })),
      phases: {
        pressure: PHASE_THRESHOLDS.PRESSURE,
        lastStand: PHASE_THRESHOLDS.LAST_STAND,
      },
      tactics: {
        inSparring: PVP_FORMULA_VERSION >= FORMULA_VERSIONS.TACTICS,
        inTrials: FORMULA_VERSION >= FORMULA_VERSIONS.TACTICS,
      },
      pvp: {
        actionTimeoutSeconds: Math.round(PVP.ACTION_TIMEOUT_MS / 1000),
        queueTimeoutMinutes: Math.round(PVP.QUEUE_TTL_MS / 60000),
      },
      achievements: {
        total: ACHIEVEMENT_TOTAL,
        categories: ACHIEVEMENT_CATEGORIES.map((category) => ({
          name: category.name,
          description: category.description,
        })),
      },
    },
  });
}
