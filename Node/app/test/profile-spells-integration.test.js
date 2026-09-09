import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import ejs from "ejs";
import en from "../src/i18n/locales/en.js";
import { getPageAssets } from "../src/middleware/viewLocals.js";

const spellsPartialPath = fileURLToPath(
  new URL("../src/views/pages/partials/profile-spells.ejs", import.meta.url),
);

function profile(overrides = {}) {
  return {
    isOwner: true,
    stats: { intelligence: 4, wisdom: 2 },
    derived: { maxMana: 40 },
    allocation: { confirmed: true },
    spells: {
      unlockedCount: 0,
      equipped: [],
      limit: 3,
      catalog: [{
        key: "clear-sight",
        name: "Clear Sight",
        wisdomRequired: 2,
        manaCost: 7,
        target: "OPPONENT",
        summary: "Deal 10 damage and remove the opponent's guard.",
        tactic: "Use it against a guarded opponent.",
        unlocked: false,
        available: true,
        wisdomRemaining: 0,
        equipped: false,
      }],
    },
    ...overrides,
  };
}

function withLoadout(equipped = ["clear-sight"]) {
  return profile({
    spells: {
      unlockedCount: 4,
      equipped,
      limit: 3,
      catalog: [
        {
          key: "clear-sight",
          name: "Clear Sight",
          wisdomRequired: 2,
          manaCost: 7,
          target: "OPPONENT",
          summary: "Deal 10 damage and remove the opponent's guard.",
          tactic: "Use it against a guarded opponent.",
          unlocked: true,
          available: false,
          wisdomRemaining: 0,
          equipped: equipped.includes("clear-sight"),
          cooldownTurns: 1,
        },
        {
          key: "dawn-break",
          name: "Dawn Break",
          wisdomRequired: 9,
          manaCost: 16,
          target: "OPPONENT",
          summary: "Deal 38 damage.",
          tactic: "The finisher.",
          unlocked: true,
          available: false,
          wisdomRemaining: 0,
          equipped: equipped.includes("dawn-break"),
          cooldownTurns: 2,
        },
        {
          key: "steady-breath",
          name: "Steady Breath",
          wisdomRequired: 1,
          manaCost: 6,
          target: "SELF",
          summary: "Recover 22 health.",
          tactic: "Cheap survival.",
          unlocked: true,
          available: false,
          wisdomRemaining: 0,
          equipped: equipped.includes("steady-breath"),
          cooldownTurns: 2,
        },
        {
          key: "still-water",
          name: "Still Water",
          wisdomRequired: 4,
          manaCost: 10,
          target: "OPPONENT",
          summary: "Push the opponent back.",
          tactic: "Buys a turn.",
          unlocked: true,
          available: false,
          wisdomRemaining: 0,
          equipped: equipped.includes("still-water"),
          cooldownTurns: 2,
        },
      ],
    },
  });
}

async function renderSpells(value) {
  return ejs.renderFile(spellsPartialPath, { profile: value });
}

describe("Profile spell exploration", () => {
  it("renders the complete learnable spell path on the owner's Profile", async () => {
    const html = await renderSpells(profile());

    assert.match(html, /id="spells"/);
    assert.match(html, /data-explore/);
    assert.match(html, /Clear Sight/);
    assert.match(html, /Learn Clear Sight/);
    assert.match(html, /Wisdom this month/);
  });

  it("does not expose the spell catalog on a public Profile", async () => {
    const html = await renderSpells(profile({
      isOwner: false,
      spells: { unlockedCount: 1 },
    }));

    assert.doesNotMatch(html, /data-explore/);
    assert.doesNotMatch(html, /Clear Sight/);
  });

  it("does not offer a Learn action until base points are confirmed", async () => {
    const html = await renderSpells(profile({ allocation: { confirmed: false } }));

    assert.match(html, /Confirm your base points above/);
    assert.doesNotMatch(html, /data-spell-unlock/);
  });

  it("loads spell-path styling and behavior with the Profile bundle", () => {
    const assets = getPageAssets("profile");

    assert.deepEqual(assets.styles, [
      "/styles/game/profile.css",
      "/styles/game/explore.css",
    ]);
    assert.equal(assets.script, "/scripts/pages/profile.js");

    const script = readFileSync(
      new URL("../public/scripts/pages/profile.js", import.meta.url),
      "utf8",
    );
    assert.match(script, /data-spell-unlock/);
  });

  it("removes Explore from primary navigation", () => {
    assert.equal(en.header.nav.some((link) => link.to === "/explore"), false);
  });

  it("redirects the legacy Explore URL to the Profile spell section", async () => {
    const controller = await import("../src/controllers/profilePageController.js");
    assert.equal(typeof controller.redirectExploreToProfile, "function");

    let redirect = null;
    controller.redirectExploreToProfile({}, {
      redirect(status, location) {
        redirect = { status, location };
        return redirect;
      },
    });

    assert.deepEqual(redirect, { status: 302, location: "/profile#spells" });
  });
});

describe("the three-spell loadout on Profile", () => {
  it("shows how many of the three are carried, server-rendered", async () => {
    const html = await renderSpells(withLoadout(["clear-sight"]));

    assert.match(html, /1 of 3 equipped/, "the count is in the HTML, not computed by script");
    assert.match(html, /data-loadout-count/);
  });

  it("offers Equip on a learned spell that is not carried, and Unequip on one that is", async () => {
    const html = await renderSpells(withLoadout(["clear-sight"]));

    assert.match(html, /data-loadout-toggle="dawn-break"[^>]*>\s*Equip/);
    assert.match(html, /data-loadout-toggle="clear-sight"[^>]*>\s*Unequip/);
  });

  it("never offers a loadout control for a spell that is not learned", async () => {
    const html = await renderSpells(profile());

    assert.doesNotMatch(html, /data-loadout-toggle/);
  });

  it("marks the carried spells so the state is readable without colour", async () => {
    const html = await renderSpells(withLoadout(["clear-sight"]));

    assert.match(html, /data-equipped="true"/);
    assert.match(html, /data-equipped="false"/);
    assert.match(html, /Carried into battle/);
  });

  it("shows each learned spell's cooldown, because it is now part of the choice", async () => {
    const html = await renderSpells(withLoadout(["clear-sight"]));

    assert.match(html, /Cooldown/);
    assert.match(html, /2 turns/);
  });

  it("keeps the loadout section out of a public profile entirely", async () => {
    const html = await renderSpells(profile({ isOwner: false, spells: { unlockedCount: 2 } }));

    assert.doesNotMatch(html, /data-loadout-toggle/);
    assert.doesNotMatch(html, /equipped/);
  });

  it("disables Equip once three are carried, with a reason rather than a dead button", async () => {
    const html = await renderSpells(withLoadout(["clear-sight", "dawn-break", "steady-breath"]));

    assert.match(html, /data-loadout-toggle="still-water"[^>]*disabled/);
    assert.match(html, /Unequip one first/);
    assert.doesNotMatch(html, /data-loadout-toggle="clear-sight"[^>]*disabled/);
  });

  it("keeps Equip live while there is still room", async () => {
    const html = await renderSpells(withLoadout(["clear-sight"]));

    assert.doesNotMatch(html, /data-loadout-toggle="dawn-break"[^>]*disabled/);
  });

  it("gives every loadout control a 44px target and an accessible pressed state", async () => {
    const html = await renderSpells(withLoadout(["clear-sight"]));
    const css = getPageAssets("profile").styles
      .map((href) => readFileSync(
        fileURLToPath(new URL(`../public/${href.replace(/^\//, "")}`, import.meta.url)),
        "utf8",
      ))
      .join("\n");

    assert.match(html, /aria-pressed="true"/);
    assert.match(html, /aria-pressed="false"/);
    assert.match(css, /\.explore-loadout-toggle\b/);
    assert.match(css, /\.explore-loadout-toggle[^{]*\{[^}]*min-height:\s*44px/);
  });
});
