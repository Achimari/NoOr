# Task list: NoOr gamification

## Wave 2: Monochrome Press — implemented 2026-09-12

Acceptance criteria, file targets and verification:
`docs/sacred-press-redesign/CLAUDE_SECOND_WAVE_PROMPT.md`.
Approved contract changes and the superseded-test migration map are recorded in
`CONSTRAINTS.md` under **Approved direction change — 2026-09-12**.

- [x] W2.1 Measure baseline; capture before states; record approved monochrome contract changes.
      Baseline measured, not quoted: 1,146 pass / 0 fail / 0 skipped. Before states captured at
      1440 and 390 across twelve routes from an isolated fixture database
      (`scripts/seed-press-fixtures.js`), never from a real account.
- [x] W2.2 Implement shared palette and state pilot; verify contrast and focus on black/white.
- [x] W2.3 Propagate neutral aliases and route colors, preserving semantic and profile-preference behavior.
      Accent presets keep their stored keys (`neutral`/`green`/`amber`/`blue`/`rose`) and became five
      printed fills with honest labels. No stored preference was reset.
- [x] Checkpoint W2-A: focused tests, asset build and real shared-control/route inspection pass.
- [x] W2.4 Retone/rebuild gateway, terrain and any tinted paper texture from source.
      `PAPER`/`INK` fixed at the source; all twelve files rebuilt; a `MIN_DOT` clamp added so a
      plate's white is the sheet's white. Fibre needed no retone — its opacity dropped 0.5 → 0.22.
- [x] W2.5 Generate and integrate Today book plate; verify desktop/mobile crop and loading fallback.
- [x] W2.6 Generate and integrate shared Prayers/Community hands plate; preserve composer/privacy behavior.
- [x] W2.7 Generate and integrate Profile portrait; preserve selected emblem and public/owner states.
- [x] W2.8 Generate and integrate Battle scenery; preserve live figures/HUD and retest active-battle CLS.
- [x] Checkpoint W2-B: all six placements inspected; asset provenance and byte sizes recorded; focused tests pass.
      `public/images/plates/README.md` carries the source, dimensions, processing, variants and bytes
      for all twelve files, and the measured decode neutrality of each encoding.
- [x] W2.9 Polish evidenced composition/icon weaknesses without changing functional scope.
- [x] W2.10 Regenerate seven Help screenshots from safe deterministic fixtures; update alternatives and capture instructions.
      `scripts/capture-help-screenshots.mjs` + `docs/sacred-press-redesign/CAPTURE.md`.
      Real browser captures, isolated database, external messaging off, no image generation.
- [x] W2.11 Complete full test/build/browser matrix and evidence-backed handoff; disclose any remaining blockers.
- [x] Checkpoint W2-C: monochrome UI, integrated artwork and current Help verified; all existing quality floors preserved.

## Completed gamification tasks (historical)

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
