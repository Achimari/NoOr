import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adjustGauge,
  advanceToNextActor,
  consumeTurn,
  projectTurnOrder,
} from "../src/domain/initiative.js";

function actors(playerSpeed, opponentSpeed) {
  return [
    { side: "PLAYER", speed: playerSpeed, gauge: 0, tieBreak: 0 },
    { side: "OPPONENT", speed: opponentSpeed, gauge: 0, tieBreak: 1 },
  ];
}

function countTurns(playerSpeed, opponentSpeed, turns) {
  let working = actors(playerSpeed, opponentSpeed);
  const tally = { PLAYER: 0, OPPONENT: 0 };

  for (let index = 0; index < turns; index += 1) {
    const step = advanceToNextActor(working);
    tally[step.actingSide] += 1;
    working = consumeTurn(step.actors, step.actingSide);
  }

  return tally;
}

describe("initiative gauge", () => {
  it("gives the faster actor the first turn", () => {
    assert.equal(advanceToNextActor(actors(6, 3)).actingSide, "PLAYER");
    assert.equal(advanceToNextActor(actors(3, 6)).actingSide, "OPPONENT");
  });

  it("lets twice the dexterity act about twice as often", () => {
    const tally = countTurns(8, 4, 30);

    assert.equal(tally.PLAYER, 20);
    assert.equal(tally.OPPONENT, 10);
    assert.ok(Math.abs(tally.PLAYER / tally.OPPONENT - 2) < 0.01);
  });

  it("holds the ratio at other speed pairs", () => {
    const tally = countTurns(9, 3, 40);

    assert.equal(tally.PLAYER / tally.OPPONENT, 3);
  });

  it("gives a sufficiently faster actor consecutive turns", () => {
    let working = actors(10, 3);
    const sequence = [];

    for (let index = 0; index < 5; index += 1) {
      const step = advanceToNextActor(working);
      sequence.push(step.actingSide);
      working = consumeTurn(step.actors, step.actingSide);
    }

    assert.deepEqual(sequence.slice(0, 3), ["PLAYER", "PLAYER", "PLAYER"]);
  });

  it("alternates when speeds are equal", () => {
    const tally = countTurns(5, 5, 20);

    assert.equal(tally.PLAYER, 10);
    assert.equal(tally.OPPONENT, 10);
  });

  it("resolves an exact tie by the stored tie-break order, not object order", () => {
    const first = advanceToNextActor([
      { side: "OPPONENT", speed: 5, gauge: 0, tieBreak: 1 },
      { side: "PLAYER", speed: 5, gauge: 0, tieBreak: 0 },
    ]);
    const second = advanceToNextActor([
      { side: "PLAYER", speed: 5, gauge: 0, tieBreak: 0 },
      { side: "OPPONENT", speed: 5, gauge: 0, tieBreak: 1 },
    ]);

    assert.equal(first.actingSide, "PLAYER");
    assert.equal(second.actingSide, "PLAYER");
  });

  it("subtracts only from the actor that acted, keeping the other's progress", () => {
    const step = advanceToNextActor(actors(10, 5));
    const after = consumeTurn(step.actors, step.actingSide);
    const opponent = after.find((actor) => actor.side === "OPPONENT");

    assert.ok(opponent.gauge > 0, "the slower actor keeps its accumulated gauge");
    assert.equal(after.find((actor) => actor.side === "PLAYER").gauge, 0);
  });

  it("treats zero or missing speed as the minimum rather than stalling", () => {
    const step = advanceToNextActor([
      { side: "PLAYER", speed: 0, gauge: 0, tieBreak: 0 },
      { side: "OPPONENT", speed: 0, gauge: 0, tieBreak: 1 },
    ]);

    assert.equal(step.actingSide, "PLAYER");
    assert.ok(Number.isFinite(step.actors[0].gauge));
  });
});

describe("projectTurnOrder", () => {
  it("projects the upcoming turns without mutating the live gauges", () => {
    const live = actors(8, 4);
    const order = projectTurnOrder(live, 4);

    assert.deepEqual(order, ["PLAYER", "PLAYER", "OPPONENT", "PLAYER"]);
    assert.equal(live[0].gauge, 0, "projection must not mutate its input");
  });
});

describe("adjustGauge", () => {
  it("slows one actor without touching the other", () => {
    const result = adjustGauge(actors(5, 5).map((a) => ({ ...a, gauge: 50 })), "OPPONENT", -40);

    assert.equal(result.find((a) => a.side === "OPPONENT").gauge, 10);
    assert.equal(result.find((a) => a.side === "PLAYER").gauge, 50);
  });

  it("never drives a gauge below zero", () => {
    const result = adjustGauge(actors(5, 5), "OPPONENT", -80);

    assert.equal(result.find((a) => a.side === "OPPONENT").gauge, 0);
  });
});
