import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  diffRewards,
  getEligibleRewardsForDate,
  isDexterityEligible,
  isIntelligenceEligible,
  isStrengthEligible,
  isWisdomEligible,
} from "../src/domain/progression.js";

const complete = (count) => Array.from({ length: count }, (unused, index) => ({
  id: index + 1,
  completedAt: new Date("2026-08-21T10:00:00Z"),
}));

const mixed = (total, completed) => Array.from({ length: total }, (unused, index) => ({
  id: index + 1,
  completedAt: index < completed ? new Date("2026-08-21T10:00:00Z") : null,
}));

describe("strength eligibility", () => {
  it("is earned when the recovery answer for that stored date is YES", () => {
    assert.equal(isStrengthEligible({ answer: "YES" }), true);
  });

  it("is not earned for NO, a missing row, or a missed day", () => {
    assert.equal(isStrengthEligible({ answer: "NO" }), false);
    assert.equal(isStrengthEligible(null), false);
    assert.equal(isStrengthEligible(undefined), false);
  });
});

describe("intelligence eligibility", () => {
  it("is earned when the reading answer is YES", () => {
    assert.equal(isIntelligenceEligible({ answer: "YES" }), true);
    assert.equal(isIntelligenceEligible({ answer: "NO" }), false);
    assert.equal(isIntelligenceEligible(null), false);
  });
});

describe("wisdom eligibility", () => {
  it("needs a reading YES and a non-empty reflection", () => {
    assert.equal(isWisdomEligible({ answer: "YES", reflection: "A quiet thought." }), true);
  });

  it("is not earned when the reflection is empty, blank or missing", () => {
    assert.equal(isWisdomEligible({ answer: "YES", reflection: "" }), false);
    assert.equal(isWisdomEligible({ answer: "YES", reflection: "   \n\t " }), false);
    assert.equal(isWisdomEligible({ answer: "YES", reflection: null }), false);
    assert.equal(isWisdomEligible({ answer: "YES" }), false);
  });

  it("is not earned when the reading answer is NO, however long the reflection", () => {
    assert.equal(isWisdomEligible({ answer: "NO", reflection: "Many words here." }), false);
  });

  it("does not judge the content of the reflection", () => {
    assert.equal(isWisdomEligible({ answer: "YES", reflection: "." }), true);
  });
});

describe("dexterity eligibility", () => {
  it("needs exactly five goals, all complete", () => {
    assert.equal(isDexterityEligible(complete(5)), true);
  });

  it("is not earned for four completed goals", () => {
    assert.equal(isDexterityEligible(complete(4)), false);
  });

  it("is not earned when five goals exist but one is unfinished", () => {
    assert.equal(isDexterityEligible(mixed(5, 4)), false);
  });

  it("is not earned for one, two or three complete goals", () => {
    for (const count of [1, 2, 3]) {
      assert.equal(isDexterityEligible(complete(count)), false, `${count} goals must not earn Dexterity`);
    }
  });

  it("is not earned for an empty or missing day", () => {
    assert.equal(isDexterityEligible([]), false);
    assert.equal(isDexterityEligible(null), false);
  });
});

describe("getEligibleRewardsForDate", () => {
  it("awards all four on a complete day", () => {
    const rewards = getEligibleRewardsForDate({
      recovery: { answer: "YES" },
      reading: { answer: "YES", reflection: "Considered." },
      goals: complete(5),
    });

    assert.deepEqual(rewards.map((reward) => reward.stat).sort(), [
      "dexterity", "intelligence", "strength", "wisdom",
    ]);
  });

  it("awards intelligence without wisdom when no reflection was written", () => {
    const rewards = getEligibleRewardsForDate({
      recovery: { answer: "NO" },
      reading: { answer: "YES", reflection: "" },
      goals: complete(3),
    });

    assert.deepEqual(rewards.map((reward) => reward.stat), ["intelligence"]);
  });

  it("awards nothing on an empty day", () => {
    assert.deepEqual(getEligibleRewardsForDate({ recovery: null, reading: null, goals: [] }), []);
  });

  it("pairs each stat with exactly one source", () => {
    const rewards = getEligibleRewardsForDate({
      recovery: { answer: "YES" },
      reading: { answer: "YES", reflection: "x" },
      goals: complete(5),
    });
    const pairs = rewards.map((reward) => `${reward.stat}:${reward.source}`);

    assert.equal(new Set(pairs).size, rewards.length);
    assert.deepEqual(pairs.sort(), [
      "dexterity:GOALS", "intelligence:READING", "strength:RECOVERY", "wisdom:REFLECTION",
    ]);
  });
});

describe("diffRewards", () => {
  const strength = { stat: "strength", source: "RECOVERY" };
  const wisdom = { stat: "wisdom", source: "REFLECTION" };

  it("creates what is missing", () => {
    const { toCreate, toRemove } = diffRewards([], [strength, wisdom]);

    assert.equal(toCreate.length, 2);
    assert.equal(toRemove.length, 0);
  });

  it("removes what is no longer eligible", () => {
    const { toCreate, toRemove } = diffRewards([strength, wisdom], [strength]);

    assert.equal(toCreate.length, 0);
    assert.deepEqual(toRemove, [wisdom]);
  });

  it("is a no-op when the ledger already matches", () => {
    const { toCreate, toRemove } = diffRewards([strength, wisdom], [wisdom, strength]);

    assert.equal(toCreate.length, 0);
    assert.equal(toRemove.length, 0);
  });

  it("stays a no-op when run repeatedly, which is what makes backfill safe", () => {
    let ledger = [];
    for (let run = 0; run < 5; run += 1) {
      const { toCreate, toRemove } = diffRewards(ledger, [strength]);
      ledger = [...ledger.filter((r) => !toRemove.includes(r)), ...toCreate];
    }

    assert.equal(ledger.length, 1);
  });

  it("revokes and re-earns cleanly when a reflection is deleted then rewritten", () => {
    const withWisdom = [strength, wisdom];
    const deleted = diffRewards(withWisdom, [strength]);
    assert.deepEqual(deleted.toRemove, [wisdom]);

    const rewritten = diffRewards([strength], [strength, wisdom]);
    assert.deepEqual(rewritten.toCreate, [wisdom]);
  });
});
