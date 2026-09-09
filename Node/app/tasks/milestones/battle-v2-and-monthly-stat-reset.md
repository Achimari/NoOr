# Milestone: Battle V2 + monthly earned-stat reset

Minimum-viable doc mode (owner asked for compressed docs). `tasks/plan.md` and
`tasks/todo.md` remain the architecture source of truth and are not edited.

## Objective

Two connected changes to the existing Express/EJS game layer:

1. **Battle V2** — give combat a renewable tactical resource (Resolve) and two
   new actions (BREAK, SURGE) so the repeatable decision stops collapsing to
   "attack unless casting".
2. **Monthly earned-stat reset** — earned stats become a *this-month* figure.
   The ten base points, the StatReward ledger, spell unlocks, PvE progress and
   frozen battle snapshots are untouched.

## Assumptions recorded before implementation

1. **No schema migration.** `stat_rewards` already carries `@@index([userId, dateKey])`
   and `dateKey` is a sortable `YYYY-MM-DD` string, so a `gte`/`lt` range read
   is index-served. Nothing new needs to be stored.
2. **Effective month = month of `getTodayDateKey(now, timezone)`.** Deriving it
   from the day key rather than from the wall clock is what preserves
   `CHECK_IN_RESET_HOUR`: before the reset hour on the 1st, the day key still
   names the last day of the previous month, so the previous month still applies.
3. **`getTodayDateKey` gains an injectable `resetHour`.** Without it the reset
   hour cannot be exercised deterministically (the deployed value is 0).
4. **`getCharacter(userId, { now, timezone })`.** When `timezone` is omitted it
   is read from `Auth.timezone` for *that* user, so a public profile is computed
   in the profile owner's month, never the viewer's.
5. **Resolve is a V2-only field.** A battle started under formula version 1 has
   no `resolve` on its combatants. The engine treats a missing/older
   `formulaVersion` as V1: no Resolve is granted, and BREAK/SURGE are refused
   with `UNSUPPORTED_ACTION` rather than silently resolved under V2 rules. The
   client DTO reports `features.resolve` so the buttons are only enabled where
   the battle supports them.
6. **Boss intent is committed, not predicted.** The next boss action is resolved
   (including the SURGE→ATTACK fallback) at the moment the boss's turn is
   handed back to the player, and stored on the state. Boss Resolve can only
   rise between commit and execution — nothing the player can do lowers it — so
   a committed SURGE stays legal, and the displayed intent is exactly the action
   that runs.
7. **PvP never carries intent.** `nextOpponentIntent` is emitted only for
   `mode === "PVE"`.
8. **Database integration tests stay out of `npm test`.** Per `tasks/plan.md`
   decision Q4 the suite is pure-domain with no DB. Month-boundary arithmetic is
   therefore tested exhaustively as a pure function, and the wired-up behaviour
   is verified at runtime against the dev database without deleting user rows.

## Scope

- `domain/constants.js` — Resolve/BREAK/SURGE tunables, `FORMULA_VERSION` 2.
- `domain/combat.js` — Resolve, BREAK, SURGE, version-aware resolution, view.
- `domain/bosses.js` — four-action policies, legality-aware intent.
- `domain/spells.js` — Wisdom threshold comment (current month, not lifetime).
- `utils/dateKey.js` — pure effective-month range helper.
- `repositories/statRewardRepository.js` — date-key range read.
- `services/progressionService.js` — month-scoped `getCharacter`.
- `services/battleService.js` — intent commit, safe DTO, V2 wiring.
- `validators/battleValidators.js` — new action types.
- Battle UI (`battle-content.ejs`, `pages/battle.js`, `game/battle.css`).
- Monthly copy on profile / explore / help.

## Acceptance criteria

- [x] Base allocation survives a month boundary; earned values do not.
- [x] Previous-month rewards excluded, current-month rewards included.
- [x] Old `StatReward` rows are never deleted.
- [x] Effective month honours the user timezone and the daily reset hour.
- [x] December → January boundary is correct.
- [x] Spell unlocks survive a Wisdom reset.
- [x] A started battle keeps its frozen pre-reset snapshot.
- [x] Resolve starts at 0, clamps to 0..100.
- [x] ATTACK +20, BREAK +10, DEFEND +25 only on absorb.
- [x] BREAK: 125% through a guard (guard removed first), 60% otherwise.
- [x] SURGE: refused under 60 Resolve, spends exactly 60, 175%, guard applies.
- [x] Shields still absorb after the new actions.
- [x] Boss intent equals the action the boss executes.
- [x] PvP DTO never carries opponent intent.
- [x] V1 battle fixtures stay resolvable and refuse V2 actions.
- [x] `applyAction` never mutates its input.
- [x] Idempotency and optimistic-version behaviour unchanged.

## Exit condition

The owner opens `/battle`, starts a PvE trial, sees both Resolve bars and the
boss's next intent, watches SURGE stay disabled with its cost explained until
60 Resolve is banked, and sees earned stats on `/profile` labelled as
this-month figures with base points unchanged.

## Verification (2026-09-04)

- `npm test` — 167 tests, 46 suites, 0 failures (118 before this milestone).
- `npm run build:assets` — clean.
- `npx prisma validate` — valid. **No schema change and no migration**: the
  `(userId, dateKey)` index already serves the month range read.
- Runtime database check (read-only, dev database, 14 accounts, 33 reward rows):
  earned totals equal the count of this month's ledger rows for every account;
  simulating the next month zeroes all four earned values while base points and
  spell unlocks are unchanged; row count 33 before and 33 after. Nothing
  deleted, nothing written.
- Live formula-version check against battle 11 in the dev database (an ACTIVE
  `formulaVersion: 1` PvE battle): the DTO offers only ATTACK/DEFEND/CAST/
  FORFEIT, reports `resolve: null` and `surgeCost: null`, refuses BREAK and
  SURGE with `UNSUPPORTED_ACTION`, and still resolves an ATTACK normally with no
  Resolve granted.
- Browser (Playwright, Chromium): Resolve bars and numbers for both sides,
  `role="progressbar"` with a live `aria-valuenow`/`aria-valuetext`, SURGE
  disabled at 0 Resolve with its cost explained, SURGE enabled at 60 and
  spending exactly 60, BREAK through a guard for 125% while the trial's own
  early BREAK landed for 60%, the trial's announced intent matching what it did,
  reconnect straight back into the live battle, all four actions in the tab
  order, no horizontal overflow at 320/390/768px, and no console or page errors.

- Runtime API check: a fresh trial is created at `formulaVersion: 2` with
  `resolve: 0`, a committed `nextOpponentIntent` and the full action list;
  `SURGE` at 0 Resolve is refused server-side (409, "Surge needs 60 Resolve");
  an unknown action is still 400; a repeated idempotency key replays without
  advancing the version; a stale `expectedVersion` is still 409.

A throwaway account named **"BattleV2 QA"** was registered on the dev database
for the browser pass. It has since been removed (2026-09-05), together with its
battles, so no orphaned rows were left behind.
