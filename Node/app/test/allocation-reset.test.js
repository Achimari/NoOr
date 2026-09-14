import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import ejs from "ejs";
import * as profiles from "../src/repositories/gameProfileRepository.js";
import * as progression from "../src/services/progressionService.js";
import { prisma } from "../src/prisma/client.js";
import { sharedViewLocals } from "./helpers/viewLocals.js";
import { postAllocationReset } from "../src/controllers/gameController.js";
import express from "express";
import apiRoutes from "../src/routes/apiRoutes.js";

function stubMethod(t, target, method, implementation) {
  const original = target[method];
  target[method] = implementation;
  t.after(() => { target[method] = original; });
}

describe("saved base-point reset", () => {
  it("clears only the owner's base points and allocation flags", async () => {
    const profile = {
      id: 7, baseStrength: 4, baseDexterity: 3, baseIntelligence: 3,
      allocationConfirmedAt: new Date(), allocationLockedAt: new Date(),
      emblemKey: "dawn", accentKey: "neutral", equippedSpellKeys: ["steady-breath"],
      shareTodayGoals: true,
    };
    const client = { gameProfile: {
      findUnique: async () => profile,
      updateMany: async ({ where, data }) => {
        assert.equal(where.id, 7);
        assert.deepEqual(Object.keys(data).sort(), [
          "allocationConfirmedAt", "allocationLockedAt", "baseDexterity", "baseIntelligence", "baseStrength",
        ]);
        assert.deepEqual(where.user.battleParticipants, { none: { battle: { status: "ACTIVE" } } });
        assert.deepEqual(where.user.matchQueueEntries.none.OR, [
          { status: "SEARCHING", expiresAt: { gt: where.user.matchQueueEntries.none.OR[0].expiresAt.gt } },
          { status: "MATCHED", battleId: null },
        ]);
        assert.ok(where.user.matchQueueEntries.none.OR[0].expiresAt.gt instanceof Date);
        Object.assign(profile, data);
        return { count: 1 };
      },
    } };

    assert.equal(await profiles.resetAllocation(7, client), true);
    assert.deepEqual([profile.baseStrength, profile.baseDexterity, profile.baseIntelligence], [0, 0, 0]);
    assert.equal(profile.allocationConfirmedAt, null);
    assert.equal(profile.allocationLockedAt, null);
    assert.deepEqual(profile.equippedSpellKeys, ["steady-breath"]);
    assert.equal(profile.shareTodayGoals, true);
    assert.equal(await profiles.resetAllocation(7, client), true, "resetting twice remains safe");
  });

  it("reports a conflict when a battle or matchmaking prevents the reset", async (t) => {
    stubMethod(t, prisma.gameProfile, "findUnique", async () => ({ id: 7 }));
    stubMethod(t, prisma.gameProfile, "updateMany", async () => ({ count: 0 }));
    await assert.rejects(progression.resetBaseAllocation(7), (error) => {
      assert.equal(error.statusCode, 409);
      assert.match(error.message, /battle|matchmaking/i);
      return true;
    });
  });

  it("recomputes the character using earned points and preserves learned spells", async (t) => {
    const profile = {
      id: 7, baseStrength: 4, baseDexterity: 3, baseIntelligence: 3,
      allocationConfirmedAt: new Date(), allocationLockedAt: new Date(),
      equippedSpellKeys: ["steady-breath"],
    };
    stubMethod(t, prisma.gameProfile, "findUnique", async () => profile);
    stubMethod(t, prisma.gameProfile, "updateMany", async ({ where, data }) => {
      assert.equal(where.id, 7);
      Object.assign(profile, data);
      return { count: 1 };
    });
    stubMethod(t, prisma.auth, "findUnique", async () => ({ timezone: "UTC" }));
    const dateKey = new Date().toISOString().slice(0, 10);
    stubMethod(t, prisma.statReward, "findMany", async () => [
      { stat: "strength", amount: 2, dateKey }, { stat: "wisdom", amount: 1, dateKey },
    ]);
    stubMethod(t, prisma.spellUnlock, "findMany", async () => [
      { spellKey: "steady-breath", unlockedAt: new Date() },
    ]);

    const character = await progression.resetBaseAllocation(7);

    assert.deepEqual(character.base, { strength: 0, dexterity: 0, intelligence: 0 });
    assert.deepEqual(character.totals, { strength: 2, dexterity: 0, intelligence: 0, wisdom: 1 });
    assert.deepEqual(character.allocation, { total: 10, confirmed: false, locked: false });
    assert.deepEqual(character.spellKeys, ["steady-breath"]);

    let response;
    await postAllocationReset(
      { user: { id: 7 }, body: { userId: 99 } },
      { json: (body) => { response = body; } },
    );
    assert.deepEqual(response.game.base, character.base, "the request body cannot target another account");
    assert.equal(response.game.allocation.confirmed, false);
  });
});

describe("allocation reset API", () => {
  it("rejects an unauthenticated reset", async (t) => {
    const app = express();
    app.use(apiRoutes);
    const server = app.listen(0, "127.0.0.1");
    t.after(() => new Promise((resolve) => server.close(resolve)));
    await new Promise((resolve) => server.once("listening", resolve));

    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/game/allocation/reset`, { method: "POST" });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Unauthorized" });
  });
});

describe("My Profile reset control", () => {
  const source = readFileSync(new URL("../src/views/pages/partials/profile-content.ejs", import.meta.url), "utf8");
  // Render the allocation section with the production EJS, including owner visibility.
  const start = source.indexOf('<% if (profile.isOwner) { %>', source.indexOf('class="profile-split"'));
  const end = source.indexOf('<section class="profile-pane profile-stats"', start);
  const allocation = source.slice(start, end);
  const render = (isOwner, locked) => ejs.render(allocation, {
    ...sharedViewLocals,
    profile: { isOwner, allocation: { locked, confirmed: true }, base: { strength: 4, dexterity: 3, intelligence: 3 }, earned: { strength: 0, dexterity: 0, intelligence: 0 } },
  }, { filename: new URL("../src/views/pages/partials/profile-content.ejs", import.meta.url).pathname });

  it("offers Reset stats even after a battle has locked the base points", () => {
    const html = render(true, true);
    assert.match(html, /data-allocation-reset-stats[^>]*>Reset stats<\/button>/);
    assert.match(html, /data-allocation-error[^>]*role="alert"/);
  });

  it("offers saving and resetting stats without an Undo changes button", () => {
    const html = render(true, false);
    assert.match(html, /data-allocation-save/);
    assert.doesNotMatch(html, /Undo changes|data-allocation-reset[\s>]/);
    assert.match(html, /data-allocation-reset-stats[^>]*>Reset stats<\/button>/);
  });

  it("does not expose allocation controls on another member's profile", () => {
    assert.doesNotMatch(render(false, true), /data-allocation-reset/);
  });
});
