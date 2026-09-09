import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CAPABLE_POLICIES,
  DECISION_CAP,
  POLICY_NAMES,
  buildArchetypes,
  decisionStats,
  runDuelMatrix,
  runPveMatrix,
  runTypicalMatrix,
  simulateDuel,
} from "../scripts/simulate-battle-balance.js";
import { COMBAT } from "../src/domain/constants.js";

const archetypes = buildArchetypes();
const pve = runPveMatrix(archetypes);
const typical = runTypicalMatrix(archetypes);
const duels = runDuelMatrix(archetypes);

const winRate = (rows, policy) => {
  const runs = rows.filter((row) => row.policy === policy);

  return runs.filter((row) => row.winner === "PLAYER").length / runs.length;
};

describe("termination", () => {
  it("finishes every simulated battle inside the caps", () => {
    for (const row of [...pve, ...duels]) {
      assert.ok(row.turns <= COMBAT.MAX_TURNS, `${row.build} exceeded the engine turn cap`);
      assert.ok(row.decisions <= DECISION_CAP * 2, `${row.build} exceeded the decision cap`);
    }
  });

  it("resolves every run to a winner rather than stalling out", () => {
    const stalled = [...pve, ...duels].filter((row) => row.reason !== "COMPLETED" || row.winner === "NONE");

    assert.deepEqual(
      stalled.map((row) => `${row.kind} ${row.build} ${row.policy} ${row.reason}`),
      [],
    );
  });
});

describe("no winning stall", () => {
  it("never lets Guard-only win a single PvE run", () => {
    assert.equal(winRate(pve, "guard-only"), 0, "a stall is survivable, never a strategy");
  });

  it("never lets Guard-only win a duel from either seat", () => {
    const guarded = duels.filter((row) => row.policy === "guard-only");

    for (const row of guarded) assert.notEqual(row.winner, "FIRST");
  });

  it("does let Guard-only survive longer than it wins, so guarding still does something", () => {
    const guardDecisions = pve.filter((row) => row.policy === "guard-only")
      .reduce((sum, row) => sum + row.decisions, 0);
    const attackDecisions = pve.filter((row) => row.policy === "attack-only")
      .reduce((sum, row) => sum + row.decisions, 0);

    assert.ok(guardDecisions > attackDecisions, "guarding buys time even though it cannot win");
  });
});

describe("reading the trial is rewarded", () => {
  it("puts intent-aware play clearly ahead of Attack-only across the PvE matrix", () => {
    assert.ok(
      winRate(pve, "intent-aware") > winRate(pve, "attack-only"),
      `intent-aware ${winRate(pve, "intent-aware")} must beat attack-only ${winRate(pve, "attack-only")}`,
    );
  });

  it("puts combo-aware play ahead of intent-aware, so the follow-ups are worth learning", () => {
    assert.ok(winRate(pve, "combo-aware") > winRate(pve, "intent-aware"));
  });

  it("keeps the thoughtless policies at the bottom", () => {
    for (const weak of ["attack-only", "attack-guard", "guard-only"]) {
      assert.ok(
        winRate(pve, "combo-aware") > winRate(pve, weak),
        `combo-aware must beat ${weak}`,
      );
    }
  });
});

describe("the follow-ups are actually used", () => {
  const totals = (policy, field) => pve
    .filter((row) => row.policy === policy)
    .reduce((sum, row) => sum + row[field], 0);

  it("has both charges created and spent somewhere in the matrix", () => {
    const created = POLICY_NAMES.filter((policy) => totals(policy, "playerApplied") > 0);
    const spent = POLICY_NAMES.filter((policy) => totals(policy, "playerConsumed") > 0);

    assert.ok(created.length > 0, "some policy creates a charge");
    assert.ok(spent.length > 0, "some policy spends one");
    assert.ok(
      POLICY_NAMES.some((policy) => totals(policy, "playerExposedApplied") > 0),
      "Exposed is reachable",
    );
    assert.ok(
      POLICY_NAMES.some((policy) => totals(policy, "playerRiposteApplied") > 0),
      "Riposte is reachable",
    );
  });

  it("creates and spends Exposed through the policies that read a guard", () => {
    for (const policy of ["intent-aware", "combo-aware"]) {
      assert.ok(totals(policy, "playerExposedApplied") > 0, `${policy} breaks guards and opens them up`);
      assert.ok(totals(policy, "playerConsumed") > 0, `${policy} spends the opening it made`);
    }
  });

  it("creates and spends Riposte through the policies that actually guard", () => {
    assert.ok(totals("attack-guard", "playerRiposteApplied") > 0);
    assert.ok(totals("attack-guard", "playerConsumed") > 0);
    assert.ok(totals("guard-only", "playerRiposteApplied") > 0, "guarding always earns one");
    assert.equal(totals("guard-only", "playerConsumed"), 0, "and a policy that never attacks never spends it");
  });

  it("leaves neither charge reachable by a policy that never earns it", () => {
    assert.equal(totals("attack-only", "playerApplied"), 0, "a charge is never granted for free");
    assert.equal(totals("spell-priority", "playerApplied"), 0);
  });

  it("never creates a charge the player never spends across the whole matrix", () => {
    const applied = pve.reduce((sum, row) => sum + row.playerApplied, 0);
    const consumed = pve.reduce((sum, row) => sum + row.playerConsumed, 0);

    assert.ok(applied > 0);
    assert.ok(consumed > 0);
    assert.ok(consumed <= applied, "a charge can never be spent more often than it was granted");
  });

  it("keeps them occasional rather than automatic", () => {
    const runs = pve.filter((row) => row.policy === "combo-aware");
    const perRun = runs.reduce((sum, row) => sum + row.playerApplied, 0) / runs.length;

    assert.ok(perRun > 0.2, `charges appear often enough to learn (${perRun.toFixed(2)} per run)`);
    assert.ok(perRun < 4, `and not on every single turn (${perRun.toFixed(2)} per run)`);
  });
});

describe("cooldowns", () => {
  it("stops a spell-priority policy casting the same spell twice in a row", () => {
    for (const row of pve.filter((entry) => entry.policy === "spell-priority")) {
      const casts = Object.values(row.playerSpellUses).reduce((sum, count) => sum + count, 0);

      assert.ok(casts <= row.decisions, `${row.build}: ${casts} casts in ${row.decisions} decisions`);
    }
  });

  it("caps how often any single spell can be used in one battle", () => {
    for (const row of pve) {
      for (const [key, uses] of Object.entries(row.playerSpellUses)) {
        assert.ok(
          uses <= Math.ceil((row.decisions + 1) / 2),
          `${row.build} used ${key} ${uses} times in ${row.decisions} decisions`,
        );
      }
    }
  });

  it("never leaves a policy stuck: no run is decided by an illegal choice", () => {
    assert.equal(pve.reduce((sum, row) => sum + row.corrected, 0), 0);
  });
});

describe("no fixed-side advantage", () => {
  it("splits side-swapped mirrors close to evenly", () => {
    const first = duels.filter((row) => row.winner === "FIRST").length;
    const share = first / duels.length;

    assert.ok(share > 0.4 && share < 0.6, `first seat won ${(share * 100).toFixed(1)}% of ${duels.length} duels`);
  });

  it("gives an identical build against itself no seat-dependent outcome bias", () => {
    const mirror = archetypes.find((entry) => entry.id === "balanced/mid/rounded");
    const forward = simulateDuel({ first: mirror, second: mirror, firstPolicy: "combo-aware", secondPolicy: "combo-aware" });

    assert.equal(forward.reason, "COMPLETED");
    assert.ok(forward.turns > 0);
  });
});

describe("build viability", () => {
  it("gives every base allocation at least one loadout that wins", () => {
    const byArchetype = {};

    for (const row of typical) {
      const archetype = row.build.split("/")[0];
      const bucket = byArchetype[archetype] || (byArchetype[archetype] = {});
      const loadout = row.build.split("/")[2];
      bucket[loadout] = (bucket[loadout] || 0) + (row.winner === "PLAYER" ? 1 : 0);
    }

    for (const [archetype, loadouts] of Object.entries(byArchetype)) {
      const best = Math.max(...Object.values(loadouts));

      assert.ok(best > 0, `${archetype} has no viable loadout: ${JSON.stringify(loadouts)}`);
    }
  });

  it("leaves no base allocation dominating every other one", () => {
    const byArchetype = {};

    for (const row of typical) {
      const archetype = row.build.split("/")[0];
      const bucket = byArchetype[archetype] || (byArchetype[archetype] = { runs: 0, wins: 0 });
      bucket.runs += 1;
      bucket.wins += row.winner === "PLAYER" ? 1 : 0;
    }

    const rates = Object.values(byArchetype).map((bucket) => bucket.wins / bucket.runs);

    assert.ok(
      Math.max(...rates) - Math.min(...rates) < 0.45,
      `spread across archetypes is ${JSON.stringify(byArchetype)}`,
    );
  });

  it("covers every policy and every archetype in the matrix it reports on", () => {
    assert.equal(POLICY_NAMES.length, 6);
    assert.ok(CAPABLE_POLICIES.every((policy) => POLICY_NAMES.includes(policy)));
    assert.equal(new Set(archetypes.map((entry) => entry.archetype)).size, 4);
    assert.equal(new Set(archetypes.map((entry) => entry.band)).size, 3);
  });
});

describe("battle length", () => {
  it("keeps a typical reachable battle inside a readable range", () => {
    const stats = decisionStats(typical);

    assert.ok(stats.median >= 6, `median decisions ${stats.median} is too short to be tactical`);
    assert.ok(stats.p90 <= 24, `p90 decisions ${stats.p90} is longer than a session should run`);
    assert.ok(stats.min >= 3, `a battle ended in ${stats.min} decisions`);
  });
});
