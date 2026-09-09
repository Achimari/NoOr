# State

Last session: 2026-09-08 — Battle V3 ("tactics").

- Battle formula version is now **3** for new **PvE** battles. New **PvP**
  battles are deliberately pinned to version 2 by `PVP_FORMULA_VERSION`; raising
  it to `FORMULA_VERSION` is the whole change when you want V3 sparring, and
  nothing else branches on it. V3 PvP is not claimed complete.
- V1 and V2 battles still in flight finish under exactly their own rules. Every
  V3 rule is reached only through `supportsTactics(state)`.
- Two one-charge follow-ups: **Exposed** (a Break that finds a guard opens the
  target; next direct hit ×1.25) and **Riposte** (a guard that absorbs a hit
  earns the defender ×1.30 on their next basic Attack). Never stack; refresh only.
- Spells scale from the battle's frozen stats and have owner-decision cooldowns.
  Every coefficient reproduces the shipped V1/V2 value exactly at Intelligence 4.
- Characters carry **three** spells. `GameProfile.equippedSpellKeys` is the store;
  matchmaking rating now counts equipped loadout power, not lifetime unlocks.
- Each trial is a data-defined phase FSM (`src/domain/bossPhases.js`) publishing a
  committed structured intent: action, label, severity, honest preview, counter,
  public phase key.
- `node scripts/simulate-battle-balance.js` prints the balance evidence;
  `test/battle-balance.test.js` guards the invariants without freezing numbers.
- Specification and outcomes: `docs/battle-v3/SPEC.md`.
  Task history: `docs/battle-v3/IMPLEMENTATION_PLAN.md`.
  Architecture of record for the older work is still `tasks/plan.md` / `tasks/todo.md`.

Open for the owner (evidence in `docs/battle-v3/SPEC.md`, "Outcome"):

- Typical PvE resolves in a median of 8 player decisions, at the bottom of the
  8–18 target. The cause is the health-to-damage ratio falling as characters
  grow; fixing it means changing `HEALTH_PER_STRENGTH` / `DAMAGE_PER_STRENGTH`,
  which changes every existing character's stats. Not taken unilaterally.
- Whether to move PvP to formula 3.
