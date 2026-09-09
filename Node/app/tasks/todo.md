# Task list: NoOr gamification

## Phase 1 - foundation
- [x] 1 Page-scoped asset pipeline (page-assets)
- [x] 2 game-core: constants, stats, derived, combat rating + `npm test`
- [x] 3 game-core: initiative gauge + combat resolution
- [x] 4 game-core: spell catalog + boss scaling
- [x] Checkpoint A: all domain rules tested, no DB code, npm test green

## Phase 2 - progression and profile
- [x] 5 Schema + migration: GameProfile, StatReward
- [x] 6 Progression repository + service + reconciliation
- [x] 7 Wire reconciliation into all nine mutation paths
- [x] 8 Backfill script + idempotency proof
- [x] 9 Own /profile: allocation, presets, derived summary
- [x] 10 Public /profile/:id, consent controls, /customer/:id redirect, streaks
- [x] Checkpoint B: progression + profiles end to end, no regressions

## Phase 3 - navigation, explore, combat
- [x] 11 Account popover + mobile account entries
- [x] 12 Spell unlock persistence + /api/spells
- [x] 13 /explore page
- [x] 14 Battle persistence + action API + /battle entry state
- [x] 15 PvE trials: three encounters + active battle UI
- [x] 16 PvP queue, matching, polling, reconnect, forfeit, timeout
- [x] Checkpoint C: both combat modes playable end to end

## Phase 4 - release
- [x] 17 Help page content + real screenshots
- [x] 18 Accessibility, security, simplification review
- [x] 19 Release verification gates

## Follow-ups for the repository owner (not actioned)

- `prisma/migrations/20260719000000_add_check_in_difficulty/` is an empty
  directory with no `migration.sql`. It breaks `prisma migrate status` and
  `prisma migrate dev` (`migrate deploy` is unaffected). Pre-existing; deleting
  the empty directory fixes it.
- The dev database carries `difficulty` columns on `CheckIn` and
  `check_in_history` that `schema.prisma` does not declare. `prisma migrate dev`
  would try to DROP them. Pre-existing drift; either add the columns to the
  schema or write a migration that removes them deliberately.
- `GET /api/customers/:id` still returns another user's prayers, Telegram
  username/first name/connection time and full check-in history to any signed-in
  user. No client code calls it any more. Pre-existing; left untouched.
- `renderCustomerDetails`, `src/views/pages/customer.ejs` and
  `partials/customer-content.ejs` are now unreachable via the UI because
  `/customer/:id` redirects to `/profile/:id`. Left in place pending your call.
- Deleting an `Auth` row cascades battle participants but leaves orphaned
  `battles` whose snapshot JSON still contains the person's display name.
  Worth an explicit retention decision before launch.
