import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import vm from "node:vm";
import ejs from "ejs";

import { sharedViewLocals } from "./helpers/viewLocals.js";
import {
  ACTIONS,
  SIDES,
  applyAction,
  createBattleState,
  toBattleView,
} from "../src/domain/combat.js";
import { buildCharacterSnapshot } from "../src/domain/stats.js";
import { runBossTurns } from "../src/domain/bosses.js";

const templatePath = fileURLToPath(
  new URL("../src/views/pages/partials/battle-content.ejs", import.meta.url),
);
const clientPath = fileURLToPath(new URL("../public/scripts/pages/battle.js", import.meta.url));
const arenaStylesPath = fileURLToPath(
  new URL("../public/styles/game/battle-arena.css", import.meta.url),
);
const entryStylesPath = fileURLToPath(
  new URL("../public/styles/game/battle.css", import.meta.url),
);

function loadCompiler() {
  const source = readFileSync(clientPath, "utf8");
  const start = source.indexOf("// A primary is a move that happened.");
  const end = source.indexOf("/* Presentation compiler (test boundary: end) */");

  assert.notEqual(start, -1, "compiler start marker missing");
  assert.notEqual(end, -1, "compiler end marker missing");

  return vm.runInNewContext(
    `${source.slice(start, end)}\n({ compileBeats, planBeat, tierFor });`,
    {},
  );
}

const { compileBeats, planBeat } = loadCompiler();

const CONTEXT = {
  yourSide: SIDES.PLAYER,
  names: { you: "Ruth", them: "The Doubt" },
  spellName: (key) => (key === "steady-breath" ? "Steady Breath" : String(key)),
};

function plansFor(entries, context = CONTEXT) {
  return Array.from(compileBeats(entries).beats, (beat) => planBeat(beat, context));
}

function act(state, side, type, spellKey = null) {
  return applyAction(state, { side, type, spellKey }).state;
}

function snapshot(totals, spellKeys = [], name = "Someone") {
  return buildCharacterSnapshot({ totals, unlockedSpellKeys: spellKeys, name });
}

function evenBattle({ spells = [] } = {}) {
  return createBattleState({
    playerSnapshot: snapshot({ strength: 4, dexterity: 6, intelligence: 6 }, spells, "Ruth"),
    opponentSnapshot: snapshot({ strength: 4, dexterity: 6, intelligence: 6 }, spells, "The Doubt"),
  });
}

function sliceFor(before, after) {
  return toBattleView(after).log.slice(toBattleView(before).log.length);
}

async function renderBattlePage(overrides = {}) {
  return ejs.renderFile(templatePath, {
    ...sharedViewLocals,
    pve: {
      activeBattleId: null,
      encounters: [
        {
          key: "the-doubt",
          order: 1,
          name: "The Doubt",
          blurb: "The quiet voice that says none of this counts.",
          completed: false,
          unlocked: true,
          bestTurns: null,
        },
      ],
    },
    character: {
      stats: { strength: 4, dexterity: 3, intelligence: 3, wisdom: 1 },
      derived: { maxHealth: 132, basicDamage: 16, speed: 9, maxMana: 35 },
      rating: 210,
      allocation: { confirmed: true },
      spellCount: 2,
    },
    siteData: { socialLinks: [] },
    t: (_key, fallback) => (Array.isArray(fallback) ? fallback : ""),
    ...overrides,
  });
}

describe("battle arena markup", () => {
  it("gives the active battle a stage, two opposed characters and one dock", async () => {
    const html = await renderBattlePage();

    assert.match(html, /data-battle-stage/);
    assert.match(html, /data-character="you"/);
    assert.match(html, /data-character="them"/);
    assert.match(html, /data-effect-layer="you"/);
    assert.match(html, /data-effect-layer="them"/);
    assert.match(html, /data-battle-dock/);
    assert.match(html, /data-battle-outcome/);
  });

  it("starts every character at a named resting pose", async () => {
    const html = await renderBattlePage();
    const poses = html.match(/data-pose="[a-z-]+"/g) || [];

    assert.equal(poses.length, 2);
    assert.deepEqual([...new Set(poses)], ['data-pose="idle"']);
  });

  it("carries no dashboard clutter into the fight", async () => {
    const html = await renderBattlePage();

    assert.doesNotMatch(html, /data-projected-order/);
    assert.doesNotMatch(html, /Coming up/);
    assert.doesNotMatch(html, /battle-log-card/);
    assert.doesNotMatch(html, /class="battle-sides"/);
    assert.doesNotMatch(html, /battle-side-effects/);
  });

  it("keeps the arena sky free of decorative horizontal lines", async () => {
    const html = await renderBattlePage();
    const styles = readFileSync(arenaStylesPath, "utf8");

    assert.doesNotMatch(html, /class="battle-current"/);
    assert.doesNotMatch(styles, /\.battle-ground::after/);
  });

  it("renders the guardian without a protruding arm", async () => {
    const html = await renderBattlePage();
    const styles = readFileSync(arenaStylesPath, "utf8");

    assert.doesNotMatch(html, /class="bfig-arm"/);
    assert.doesNotMatch(styles, /\.bfig-arm/);
  });

  it("keeps the entry-state information, but outside focus mode", async () => {
    const html = await renderBattlePage();
    const entryStart = html.indexOf("data-battle-entry");
    const arenaStart = html.indexOf("data-battle-active");
    const entry = html.slice(entryStart, arenaStart);

    assert.match(entry, /battle-readiness/);
    assert.match(entry, /Trials/);
    assert.match(entry, /Friendly spar/);
    assert.match(entry, /footer-row/);
    assert.ok(entryStart < arenaStart, "the entry surface precedes the arena");
    assert.doesNotMatch(html.slice(arenaStart), /battle-character/);
    assert.doesNotMatch(html.slice(arenaStart), /battle-readiness/);
  });

  it("presents the character as a compact readiness line, not the whole build", async () => {
    const html = await renderBattlePage();

    assert.match(html, /class="battle-readiness"/);
    assert.match(html, /data-character-stat="rating">\s*<dt>Combat rating<\/dt>\s*<dd>210<\/dd>/);
    assert.match(html, /href="\/profile">View full loadout</);

    for (const stat of ["rating", "health", "damage", "mana", "spells"]) {
      assert.match(html, new RegExp(`data-character-stat="${stat}"`));
    }

    for (const stat of ["strength", "dexterity", "intelligence", "wisdom", "speed"]) {
      assert.doesNotMatch(html, new RegExp(`data-character-stat="${stat}"`));
    }
    assert.doesNotMatch(html, /battle-stat-icon|battle-stat-grid|Core attributes|Combat profile/);
  });

  it("collapses the two battle choices and the readiness line on narrow screens", () => {
    const styles = readFileSync(entryStylesPath, "utf8");

    assert.match(styles, /\.battle-choice-grid\s*{[^}]*display:\s*grid/s);
    assert.match(styles, /\.battle-choice-grid\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.55fr\)\s+minmax\(0,\s*1fr\)/s);
    assert.match(styles, /@media\s*\(max-width:\s*880px\)[\s\S]*\.battle-choice-grid\s*{[^}]*grid-template-columns:\s*1fr/s);
    assert.match(styles, /@media\s*\(max-width:\s*880px\)[\s\S]*\.battle-mode--sparring\s*{[^}]*border-block-start:\s*1px solid var\(--rule\)/s);
    assert.match(styles, /@media\s*\(max-width:\s*560px\)[\s\S]*\.battle-readiness\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
    assert.match(styles, /\.battle-readiness-values\s*{[^}]*flex-wrap:\s*wrap/s);
  });

  it("enters focus mode from the server when a battle is already running", async () => {
    const html = await renderBattlePage({
      pve: { activeBattleId: 42, encounters: [] },
    });

    assert.match(html, /data-battle-focus="true"/);
    assert.match(html, /data-battle-boot/);
  });

  it("offers the four moves, spells and a quiet forfeit, each with a reason slot", async () => {
    const html = await renderBattlePage();

    for (const action of ["ATTACK", "DEFEND", "BREAK", "SURGE"]) {
      assert.match(html, new RegExp(`data-action="${action}"`));
      assert.match(html, new RegExp(`data-move-reason="${action}"`));
      assert.match(html, new RegExp(`aria-describedby="move-reason-${action}"`));
    }

    assert.match(html, /data-spell-tray/);
    assert.match(html, /data-action="FORFEIT"/);
    assert.match(html, /class="battle-quiet-action"[^>]*data-action="FORFEIT"/);
  });

  it("keeps a polite live region and puts history behind a closed disclosure", async () => {
    const html = await renderBattlePage();

    assert.match(html, /data-battle-announcer[^>]*role="status"[^>]*aria-live="polite"/);
    assert.match(html, /<details class="battle-history" data-battle-history>/);
    assert.doesNotMatch(html, /<details class="battle-history"[^>]*\bopen\b/);
  });
});

describe("presentation compiler", () => {
  it("attaches a guard absorption to the hit it belongs to, not to the one before", () => {
    const start = evenBattle();
    const defender = start.activeSide;
    const guarded = act(start, defender, ACTIONS.DEFEND);
    const attacker = guarded.activeSide;
    const struck = act(guarded, attacker, ACTIONS.ATTACK);

    const entries = sliceFor(start, struck);
    assert.deepEqual(
      entries.slice(0, 2).map((row) => row.code),
      ["DEFEND", "GUARD_ABSORB"],
    );

    const plans = plansFor(entries, { ...CONTEXT, yourSide: defender });
    assert.deepEqual(plans.map((plan) => plan.kind), ["guard", "attack"]);

    const [, attack] = plans;
    assert.equal(attack.actor, "them");
    assert.equal(attack.target, "you");
    assert.equal(attack.guardAbsorbed, true);
    assert.equal(attack.tier, "medium");
  });

  it("does not hand one action's Resolve gain to the previous action", () => {
    const start = evenBattle();
    const defender = start.activeSide;
    const guarded = act(start, defender, ACTIONS.DEFEND);
    const struck = act(guarded, guarded.activeSide, ACTIONS.ATTACK);

    const [guard, attack] = plansFor(sliceFor(start, struck), { ...CONTEXT, yourSide: defender });

    assert.deepEqual(Array.from(guard.resolveGains), []);
    assert.deepEqual(
      Array.from(attack.resolveGains, (gain) => [gain.side, gain.amount]),
      [["you", 25], ["them", 20]],
    );
  });

  it("plays a PvE reply as separate beats in source order", () => {
    const start = evenBattle();
    const player = start.activeSide;
    const afterPlayer = act(start, player, ACTIONS.ATTACK);
    const afterBoss = runBossTurns({ ...afterPlayer, bossPattern: ["ATTACK"], bossTurn: 0 }).state;

    const plans = plansFor(sliceFor(start, afterBoss), { ...CONTEXT, yourSide: player });

    assert.equal(plans.length, 2);
    assert.deepEqual(plans.map((plan) => plan.kind), ["attack", "attack"]);
    assert.deepEqual(plans.map((plan) => plan.actor), ["you", "them"]);
    assert.deepEqual(plans.map((plan) => plan.target), ["them", "you"]);
  });

  it("reads a broken guard as one large beat rather than two moves", () => {
    const start = evenBattle();
    const guardSide = start.activeSide;
    const guarded = act(start, guardSide, ACTIONS.DEFEND);
    const breaker = guarded.activeSide;
    const broken = act(guarded, breaker, ACTIONS.BREAK);

    const plans = plansFor(sliceFor(guarded, broken), { ...CONTEXT, yourSide: breaker });

    assert.equal(plans.length, 1);
    assert.equal(plans[0].kind, "break");
    assert.equal(plans[0].actor, "you");
    assert.equal(plans[0].guardBroken, true);
    assert.equal(plans[0].tier, "large");
  });

  it("keeps an unguarded break visibly weaker than a real one", () => {
    const start = evenBattle();
    const breaker = start.activeSide;
    const broken = act(start, breaker, ACTIONS.BREAK);

    const [plan] = plansFor(sliceFor(start, broken), { ...CONTEXT, yourSide: breaker });

    assert.equal(plan.kind, "break");
    assert.equal(plan.guardBroken, false);
    assert.equal(plan.weak, true);
    assert.equal(plan.tier, "small");
    assert.match(plan.announce, /broke early/);
  });

  it("groups a Surge with the Resolve it spent and treats it as large", () => {
    let state = evenBattle();
    for (let index = 0; index < 6; index += 1) {
      state = act(state, state.activeSide, ACTIONS.ATTACK);
    }

    const before = state;
    const surger = state.activeSide;
    const surged = act(state, surger, ACTIONS.SURGE);
    const entries = sliceFor(before, surged);

    assert.equal(entries[0].code, "RESOLVE_SPEND");

    const plans = plansFor(entries, { ...CONTEXT, yourSide: surger });
    assert.equal(plans.length, 1);
    assert.equal(plans[0].kind, "surge");
    assert.equal(plans[0].tier, "large");
    assert.equal(plans[0].banner, "Ruth used Surge");
  });

  it("groups a cast with the effects that follow it", () => {
    const start = evenBattle({ spells: ["steady-breath"] });
    const hurt = act(start, start.activeSide, ACTIONS.ATTACK);
    const caster = hurt.activeSide;
    const healed = act(hurt, caster, ACTIONS.CAST, "steady-breath");

    const plans = plansFor(sliceFor(hurt, healed), { ...CONTEXT, yourSide: caster });

    assert.equal(plans.length, 1);
    assert.equal(plans[0].kind, "cast");
    assert.equal(plans[0].banner, "Ruth cast Steady Breath");
    assert.ok(plans[0].heal > 0);
    assert.equal(plans[0].tier, "small");
    assert.match(plans[0].announce, /cast Steady Breath/);
  });

  it("commits health from the log entry rather than from a client calculation", () => {
    const start = evenBattle();
    const attacker = start.activeSide;
    const struck = act(start, attacker, ACTIONS.ATTACK);
    const entries = sliceFor(start, struck);
    const attackEntry = entries.find((row) => row.code === "ATTACK");

    const [plan] = plansFor(entries, { ...CONTEXT, yourSide: attacker });
    const healthCommit = Array.from(plan.commits).find((commit) => commit.key === "health");

    assert.equal(healthCommit.side, "them");
    assert.equal(healthCommit.value, attackEntry.health);
  });

  it("lifts the end of the battle out of the beats so the fatal hit plays first", () => {
    let state = evenBattle();
    let guard = 0;

    while (state.status === "ACTIVE" && guard < 200) {
      state = act(state, state.activeSide, ACTIONS.ATTACK);
      guard += 1;
    }

    const log = toBattleView(state).log;
    const lastAttackIndex = log.map((row) => row.code).lastIndexOf("ATTACK");
    const script = compileBeats(log.slice(lastAttackIndex));

    assert.equal(script.endsBattle, true);
    assert.ok(script.beats.length >= 1);
    assert.ok(Array.from(script.beats).every((beat) => beat.primary.code !== "BATTLE_END"));
  });

  it("produces nothing for a repeated poll that carries no new log entries", () => {
    const start = evenBattle();
    const struck = act(start, start.activeSide, ACTIONS.ATTACK);
    const log = toBattleView(struck).log;

    const script = compileBeats(log.slice(log.length));

    assert.equal(script.beats.length, 0);
    assert.equal(script.endsBattle, false);
  });

  it("announces each beat once, in the player's own terms", () => {
    const start = evenBattle();
    const attacker = start.activeSide;
    const struck = act(start, attacker, ACTIONS.ATTACK);

    const [plan] = plansFor(sliceFor(start, struck), { ...CONTEXT, yourSide: attacker });

    assert.match(plan.announce, /^You attacked for \d+ damage\./);
    assert.match(plan.announce, /gained \d+ Resolve/);
    assert.equal(plan.banner, "Ruth used Attack");
  });

  it("reads the same log from the other seat without leaking sides", () => {
    const start = evenBattle();
    const attacker = start.activeSide;
    const struck = act(start, attacker, ACTIONS.ATTACK);
    const entries = sliceFor(start, struck);

    const other = attacker === SIDES.PLAYER ? SIDES.OPPONENT : SIDES.PLAYER;
    const [asOpponent] = plansFor(entries, { ...CONTEXT, yourSide: other });

    assert.equal(asOpponent.actor, "them");
    assert.equal(asOpponent.target, "you");
  });

  it("treats a lingering burn tick as its own small beat", () => {
    const plans = plansFor([
      { code: "BURN_TICK", side: SIDES.OPPONENT, amount: 9, health: 40 },
      { code: "ATTACK", side: SIDES.OPPONENT, targetSide: SIDES.PLAYER, amount: 12, health: 80 },
    ]);

    assert.deepEqual(plans.map((plan) => plan.kind), ["burn", "attack"]);
    assert.equal(plans[0].tier, "small");
    assert.equal(plans[0].target, "them");
    assert.equal(plans[1].tier, "medium");
  });

  it("plays a forfeit as a sad beat with no attack", () => {
    const plans = plansFor([
      { code: "BATTLE_END", winner: SIDES.OPPONENT },
      { code: "FORFEIT", side: SIDES.PLAYER },
    ]);

    assert.equal(plans.length, 1);
    assert.equal(plans[0].kind, "forfeit");
    assert.equal(plans[0].damage, null);
    assert.equal(plans[0].tier, "small");
    assert.equal(compileBeats([
      { code: "BATTLE_END", winner: SIDES.OPPONENT },
      { code: "FORFEIT", side: SIDES.PLAYER },
    ]).endsBattle, true);
  });
});

describe("presentation compiler under version 3", () => {
  function v3Battle(options = {}) {
    const state = evenBattle(options);
    state.formulaVersion = 3;

    return state;
  }

  const keys = (list) => Array.from(list || []);

  it("keeps a successful Break and the Exposed it applies as one beat", () => {
    const start = v3Battle();
    const guarded = act(start, start.activeSide, ACTIONS.DEFEND);
    const breaker = guarded.activeSide;
    const broken = act(guarded, breaker, ACTIONS.BREAK);

    const plans = plansFor(sliceFor(guarded, broken), { ...CONTEXT, yourSide: breaker });

    assert.equal(plans.length, 1, "the follow-up belongs to the move that created it");
    assert.equal(plans[0].kind, "break");
    assert.deepEqual(keys(plans[0].statusApplied), ["EXPOSED"]);
  });

  it("keeps a Guard absorption and the Riposte it earns inside the attacker's beat", () => {
    const start = v3Battle();
    const guardSide = start.activeSide;
    const guarded = act(start, guardSide, ACTIONS.DEFEND);
    const attacker = guarded.activeSide;
    const hit = act(guarded, attacker, ACTIONS.ATTACK);

    const plans = plansFor(sliceFor(guarded, hit), { ...CONTEXT, yourSide: attacker });

    assert.equal(plans.length, 1);
    assert.equal(plans[0].guardAbsorbed, true);
    assert.deepEqual(keys(plans[0].statusApplied), ["RIPOSTE"], "attributed to the hit that earned it");
  });

  it("shows a consumed charge and the bonus damage it paid on the hit that spent it", () => {
    let state = v3Battle();
    const guardSide = state.activeSide;
    state = act(state, guardSide, ACTIONS.DEFEND);
    const attacker = state.activeSide;
    const absorbed = act(state, attacker, ACTIONS.ATTACK);

    const riposted = act(absorbed, guardSide, ACTIONS.ATTACK);
    const plans = plansFor(sliceFor(absorbed, riposted), { ...CONTEXT, yourSide: guardSide });

    assert.equal(plans.length, 1);
    assert.deepEqual(keys(plans[0].statusConsumed), ["RIPOSTE"]);
    assert.ok(plans[0].statusBonus > 0, "the extra damage is a number the server sent");
    assert.match(plans[0].announce, /Riposte/);
  });

  it("plays a phase change as its own short beat with a banner", () => {
    const plans = plansFor([
      { code: "PHASE_CHANGE", side: "OPPONENT", phase: "PRESSURE" },
      { code: "ATTACK", side: "OPPONENT", targetSide: "PLAYER", amount: 9, health: 40 },
    ]);

    assert.equal(plans.length, 2);
    assert.equal(plans[0].kind, "phase");
    assert.equal(plans[0].phase, "PRESSURE");
    assert.ok(plans[0].banner.length > 0);
    assert.equal(plans[0].tier, "small", "a banner, not a second boss fight");
    assert.equal(plans[1].kind, "attack");
  });

  it("names a refreshed charge as a refresh rather than a new one", () => {
    const plans = plansFor([
      { code: "ATTACK", side: "PLAYER", targetSide: "OPPONENT", amount: 9, health: 40 },
      { code: "STATUS_REFRESHED", side: "OPPONENT", key: "EXPOSED" },
    ]);

    assert.deepEqual(keys(plans[0].statusRefreshed), ["EXPOSED"]);
    assert.match(plans[0].announce, /still exposed|refreshed/i);
  });

  it("never opens an empty beat for a status entry alone", () => {
    const plans = plansFor([
      { code: "STATUS_APPLIED", side: "OPPONENT", key: "EXPOSED" },
      { code: "ATTACK", side: "PLAYER", targetSide: "OPPONENT", amount: 9, health: 40 },
    ]);

    assert.equal(plans.length, 1, "a leading status entry is carried into the move it belongs to");
    assert.deepEqual(keys(plans[0].statusApplied), ["EXPOSED"]);
  });
});

describe("version 3 arena markup", () => {
  it("gives the intent chip room for a label, a severity and a preview", async () => {
    const html = await renderBattlePage();

    assert.match(html, /data-intent-label/);
    assert.match(html, /data-intent-severity/);
    assert.match(html, /data-intent-preview/);
    assert.match(html, /data-intent-counter/);
  });

  it("exposes the counter on focus or click, never on hover alone", async () => {
    const html = await renderBattlePage();
    const css = readFileSync(arenaStylesPath, "utf8");

    assert.match(html, /<details[^>]*class="battle-intent"/);
    assert.match(html, /data-intent-counter/);
    assert.doesNotMatch(css, /\.battle-intent[^{]*:hover[^{]*\{[^}]*display/);
  });

  it("keeps one short phase banner rather than a permanent phase panel", async () => {
    const html = await renderBattlePage();

    assert.match(html, /data-phase-banner/);
    assert.doesNotMatch(html, /battle-phase-card/);
  });

  it("still refuses the entry-state dashboard inside the arena", async () => {
    const html = await renderBattlePage();
    const arena = html.slice(html.indexOf("data-battle-active"));

    assert.doesNotMatch(arena, /battle-stat-grid/);
    assert.doesNotMatch(arena, /Combat rating/);
  });

  it("styles the two new status chips with a word as well as a mark", async () => {
    const css = readFileSync(arenaStylesPath, "utf8");

    assert.match(css, /data-status="EXPOSED"/);
    assert.match(css, /data-status="RIPOSTE"/);
  });

  it("keeps every spell tray control at 44px and gives a disabled one a reason", async () => {
    const html = await renderBattlePage();
    const css = readFileSync(arenaStylesPath, "utf8");

    assert.match(html, /data-spell-actions/);
    assert.match(css, /\.battle-spell\b[^{]*\{[^}]*min-height:\s*44px/);
    assert.match(readFileSync(clientPath, "utf8"), /data-spell-reason/);
  });

  it("reads no combat constant in the browser: previews come from the server", () => {
    const source = readFileSync(clientPath, "utf8");

    assert.doesNotMatch(source, /EXPOSED_MULTIPLIER|RIPOSTE_MULTIPLIER|SHIELD_CAP_RATIO/);
    assert.doesNotMatch(source, /\b1\.25\b|\b1\.30?\b/, "no combat multiplier is restated in the client");
    assert.doesNotMatch(source, /basicDamage\s*\*/);
  });
});
