# Implementation Plan: NoOr gamification, profiles, exploration, and combat

Approved at the specification gate. Module ids are stable and are the index of
what exists; do not rename them.

## Architecture decisions

1. **Pure domain first.** All rules that the brief lists as testable live in
   `src/domain/*` as pure, I/O-free modules. Progression and combat share one
   source of formulas so a stat can never mean two things.
2. **One reconciliation service.** `reconcileRewardsForDate(userId, dateKey, tx)`
   is the only place reward arithmetic exists. Every mutation path that can
   affect eligibility calls it. No increments in controllers.
3. **Reward identity is the source row's stored dateKey**, never a recomputed
   one, so a timezone change cannot duplicate or orphan a reward.
4. **Hard delete on revoke.** Ledger rows are created and deleted; totals are a
   row count. The source tables remain the audit trail.
5. **Nullable unique columns for single-active invariants.** Postgres allows many
   NULLs, so `activeQueueUserId` / `activePvpUserId` enforce "one active queue
   entry" and "one active PvP battle" without raw partial indexes.
6. **Idempotency is claimed by insert**, never check-then-act. The unique index
   on (battleId, idempotencyKey) picks the winner.
7. **REST + short polling.** No new transport dependency. Timeouts are evaluated
   lazily inside the polling read's transaction; no new background worker.
8. **Page-scoped assets.** New surfaces get their own script and stylesheet.
   `public/scripts/app.js` (2600 lines) and `dashboard.css` (4185 lines) are not
   touched at all.
9. **Repo response conventions win** over the api-design skill's envelope:
   `res.json({ resource })`, `{ errors: [] }` at 400, `{ error }` from the error
   handler, matching the 14 existing endpoints.

## Decisions applied from the approval gate

- Q1 `/customer/:id` 302-redirects to `/profile/:id`; the legacy page's prayer
  list and Telegram disclosure are retired (privacy improvement).
- Q2 The existing "all planned goals complete" Tasks streak is unchanged.
  Dexterity ("planned and finished all five") is labelled separately.
- Q3 Boss rating is clamped: `clamp(player x (1+margin), chapterMin, chapterMax)`.
- Q4 Automated tests are pure-domain (`node --test`, no new dependencies).
- Q5 `prisma format` is run, then any hunk outside the new models is reverted.
- Q6 New rate limits: queue 10/5min, unlock 30/5min, actions 120/min,
  profile PATCH 30/5min.
- Q7 Dev database is the compose `postgres` service only, started detached.

## Capability map

| Module id | Responsibility | Depends on |
|---|---|---|
| page-assets | per-page script/style entries | - |
| game-core | pure stats, derived, rating, initiative, combat, spells, bosses | - |
| game-progression | allocation, ledger, reconciliation, backfill | game-core |
| profile-and-privacy | owner + public DTO, presets, consent, streaks | game-progression |
| account-navigation | three-dot popover, mobile entries | page-assets, profile-and-privacy |
| exploration-and-spells | unlock persistence, Explore page | game-core, profile-and-privacy |
| combat-core | battle persistence, versioning, idempotent actions | game-core, exploration-and-spells |
| pve-trials | three encounters, boss snapshot, Battle UI | combat-core |
| pvp-matchmaking | queue, matching, polling, reconnect, forfeit | combat-core, profile-and-privacy |
| public-daily-activity | consent-aware task + reflection disclosure | profile-and-privacy |
| help-and-onboarding | full guide, real screenshots | all |

Build order: page-assets -> game-core -> game-progression -> profile-and-privacy
-> (account-navigation, public-daily-activity) || exploration-and-spells
-> combat-core -> (pve-trials, pvp-matchmaking) -> help-and-onboarding

## Worktree preservation

Baseline captured before any edit. Never touched: `public/scripts/app.js`,
`public/styles/home/dashboard.css`, `home-content.ejs`, `statistics-content.ejs`,
`settings-content.ejs`. Existing migrations are never amended. New migrations are
dated after 20260821120000.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `prisma format` reformats the user's dirty schema | High | Diff-review after running; revert unrelated hunks |
| Reconciliation missed on a mutation path | High | One service, called from all nine paths, listed in Task 7 |
| Boss scaling treadmill | Med | Clamped band with tested lower and upper bounds |
| Wisdom revocable but unlocks permanent | Med | Documented in Help; threshold checked against current total |
| No DB integration tests | Med | Constraint-based design + manual runtime exercise; named openly |
