import { COMBAT } from "./constants.js";

function normalizeActor(actor) {
  return {
    side: actor.side,
    speed: Math.max(COMBAT.MIN_SPEED, Number(actor.speed) || COMBAT.MIN_SPEED),
    gauge: Number.isFinite(actor.gauge) ? actor.gauge : 0,
    tieBreak: Number.isFinite(actor.tieBreak) ? actor.tieBreak : 0,
  };
}

export function advanceToNextActor(actors) {
  const normalized = actors.map(normalizeActor);
  if (!normalized.length) return null;

  const ready = normalized.filter((actor) => actor.gauge >= COMBAT.GAUGE_THRESHOLD);

  if (!ready.length) {
    const ticks = Math.min(
      ...normalized.map((actor) => (COMBAT.GAUGE_THRESHOLD - actor.gauge) / actor.speed),
    );

    for (const actor of normalized) {
      actor.gauge += actor.speed * ticks;
    }
  }

  const candidates = normalized.filter((actor) => actor.gauge >= COMBAT.GAUGE_THRESHOLD - 1e-9);
  const actingSide = candidates.sort((first, second) => (
    second.gauge - first.gauge || first.tieBreak - second.tieBreak
  ))[0].side;

  return {
    actingSide,
    actors: normalized.map((actor) => ({
      side: actor.side,
      speed: actor.speed,
      tieBreak: actor.tieBreak,
      gauge: actor.gauge,
    })),
  };
}

export function consumeTurn(actors, actingSide) {
  return actors.map((actor) => (
    actor.side === actingSide
      ? { ...actor, gauge: actor.gauge - COMBAT.GAUGE_THRESHOLD }
      : { ...actor }
  ));
}

export function projectTurnOrder(actors, count = COMBAT.PROJECTED_TURNS) {
  let working = actors.map(normalizeActor);
  const order = [];

  for (let index = 0; index < count; index += 1) {
    const step = advanceToNextActor(working);
    if (!step) break;

    order.push(step.actingSide);
    working = consumeTurn(step.actors, step.actingSide);
  }

  return order;
}

export function adjustGauge(actors, side, delta) {
  return actors.map((actor) => (
    actor.side === side
      ? { ...actor, gauge: Math.max(0, actor.gauge + delta) }
      : { ...actor }
  ));
}
