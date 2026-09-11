import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import ejs from "ejs";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFileSync(path.join(appRoot, relative), "utf8");
const templatePath = path.join(appRoot, "src/views/pages/partials/battle-content.ejs");
const markup = read("src/views/pages/partials/battle-content.ejs");
const entry = markup.slice(markup.indexOf("data-battle-entry"), markup.indexOf("data-battle-active"));
const styles = read("public/styles/game/battle.css");

const MIXED_COURSE = [
  {
    key: "the-doubt",
    order: 1,
    name: "The Doubt",
    blurb: "The quiet voice that says none of this counts.",
    completed: true,
    unlocked: true,
    bestTurns: 7,
  },
  {
    key: "the-distraction",
    order: 2,
    name: "The Distraction",
    blurb: "Everything that is easier than the thing you meant to do.",
    completed: false,
    unlocked: true,
    bestTurns: null,
  },
  {
    key: "the-discouragement",
    order: 3,
    name: "The Discouragement",
    blurb: "The weight that settles after a day you would rather forget.",
    completed: false,
    unlocked: false,
    bestTurns: null,
  },
];

const COMPLETED_COURSE = MIXED_COURSE.map((encounter) => ({
  ...encounter,
  completed: true,
  unlocked: true,
  bestTurns: encounter.bestTurns ?? 9,
}));

async function renderEntry({ encounters = MIXED_COURSE, confirmed = true } = {}) {
  const html = await ejs.renderFile(templatePath, {
    pve: { activeBattleId: null, encounters },
    character: {
      stats: { strength: 4, dexterity: 3, intelligence: 3, wisdom: 1 },
      derived: { maxHealth: 132, basicDamage: 16, speed: 9, maxMana: 35 },
      rating: 310,
      allocation: { confirmed },
      spellCount: 2,
    },
    siteData: { socialLinks: [] },
    t: (_key, fallback) => (Array.isArray(fallback) ? fallback : ""),
  });

  return html.slice(html.indexOf("data-battle-entry"), html.indexOf("data-battle-active"));
}

function encounterBlock(html, key) {
  const start = html.indexOf(`data-encounter="${key}"`);
  assert.notEqual(start, -1, `no encounter row for ${key}`);
  const end = html.indexOf("</li>", start);
  return html.slice(start, end);
}

describe("Battle entry follows the Achimari Course Ledger", () => {
  it("uses the shared page shell and a direct page heading", () => {
    assert.match(entry, /class="page-shell battle-container"/);
    assert.match(entry, /class="page-head battle-head"/);
    assert.doesNotMatch(entry, /class="page-head-eyebrow"/);
    assert.match(entry, /class="page-head-title battle-title"/);
    assert.match(entry, /class="page-head-lede battle-intro"/);
    assert.doesNotMatch(entry, /dashboard-section|dashboard-card/);
  });

  it("opens on one sentence rather than a two-line explanation", async () => {
    const html = await renderEntry();
    const lede = html.match(/class="page-head-lede battle-intro"[^>]*>([\s\S]*?)<\/p>/)[1];

    assert.match(lede, /Choose your next encounter\. Battles never change your daily record\./);
    assert.equal(lede.trim().split(".").filter((part) => part.trim()).length, 2, "one sentence, two clauses");
  });

  it("makes Trials and Friendly spar sibling choices in one frame", async () => {
    const html = await renderEntry();
    const frame = html.indexOf("battle-choice");
    const trials = html.indexOf('data-region="trials"');
    const spar = html.indexOf('data-region="spar"');
    const readiness = html.indexOf('data-region="readiness"');

    assert.ok(frame !== -1 && frame < trials, "both choices live inside one shared choice frame");
    assert.ok(trials !== -1 && spar !== -1 && trials < spar, "Trials precedes Friendly spar");
    assert.ok(readiness > spar, "readiness follows both battle choices");
    assert.match(html, /battle-mode--trials/);
    assert.match(html, /battle-mode--sparring/);
    assert.match(html, /class="battle-encounter-marker"/);
    assert.match(html, /battle-entry-layout[\s\S]{0,200}?data-battle-modes/);
  });

  it("keeps one h1, an h2 per region and an h3 per battle choice", async () => {
    const html = await renderEntry();

    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.match(html, /<h2[^>]*id="battle-choice-title"[^>]*>\s*Choose a battle\s*</);
    assert.match(html, /<h2[^>]*id="battle-readiness-title"/);
    assert.match(html, /<h3[^>]*id="pve-title"[^>]*>\s*Trials\s*</);
    assert.match(html, /<h3[^>]*id="pvp-title"[^>]*>\s*Friendly spar\s*</);
    assert.doesNotMatch(html, /PvP Sparring/);
  });

  it("uses the canonical button system before combat", async () => {
    const html = await renderEntry();

    assert.doesNotMatch(entry, /\bbattle-button\b/);
    assert.match(html, /ui-button ui-button--primary[^"]*"[^>]*data-pve-start/);
    assert.match(html, /class="ui-button ui-button--[a-z]+"[^>]*data-queue-join/);
    assert.match(html, /ui-button ui-button--secondary[^"]*"[^>]*data-queue-cancel/);
    assert.doesNotMatch(html, /disabled[^>]*data-pve-start|data-pve-start[^>]*\bdisabled\b/);
  });

  it("gives exactly one trial the filled primary action", async () => {
    const html = await renderEntry();
    const open = encounterBlock(html, "the-distraction");
    const done = encounterBlock(html, "the-doubt");
    const locked = encounterBlock(html, "the-discouragement");

    assert.match(open, /ui-button--primary[^>]*data-pve-start="the-distraction"/, "the next open trial leads");
    assert.match(open, />\s*Begin trial\s*</);
    assert.match(open, /battle-encounter-blurb/, "the next trial keeps its description");

    assert.match(done, /data-pve-start="the-doubt"/, "a finished trial can still be replayed");
    assert.doesNotMatch(done, /ui-button--primary/, "a replay must never compete with the next step");
    assert.match(done, /ui-button--quiet/);
    assert.match(done, />\s*Face again\s*</);
    assert.doesNotMatch(done, /battle-encounter-blurb/, "a resolved trial collapses to its result");

    assert.doesNotMatch(locked, /<button/, "a locked trial offers no decorative disabled control");
    assert.match(locked, /Finish The Distraction first\./);

    assert.equal(
      (html.match(/ui-button--primary[^>]*data-pve-start/g) || []).length,
      1,
      "only one filled primary trial action at a time",
    );
  });

  it("hands the filled primary to Friendly spar once the course is finished", async () => {
    const finished = await renderEntry({ encounters: COMPLETED_COURSE });
    const partway = await renderEntry();

    assert.match(finished, /ui-button ui-button--primary[^"]*"[^>]*data-queue-join/);
    assert.equal((finished.match(/ui-button--primary[^>]*data-pve-start/g) || []).length, 0);
    assert.match(partway, /ui-button ui-button--secondary[^"]*"[^>]*data-queue-join/);
  });

  it("keeps the queue panel, its hooks and its polite live region intact", async () => {
    const html = await renderEntry();

    assert.match(html, /data-queue-panel[^>]*data-queue-state="IDLE"/);
    assert.match(html, /data-queue-status[^>]*role="status"[^>]*aria-live="polite"/);
    assert.match(html, /Not searching\./);
    assert.match(html, /data-queue-join/);
    assert.match(html, /data-queue-cancel[^>]*hidden/);
  });

  it("replaces the nine-stat matrix with a compact readiness summary", async () => {
    const html = await renderEntry();

    for (const gone of ["strength", "dexterity", "intelligence", "wisdom", "speed"]) {
      assert.doesNotMatch(html, new RegExp(`data-character-stat="${gone}"`), `${gone} belongs on My Profile`);
    }
    assert.doesNotMatch(html, /Core attributes|Combat profile|battle-stat-grid/);

    for (const [stat, label, value] of [
      ["rating", "Combat rating", "310"],
      ["health", "Health", "132"],
      ["damage", "Damage", "16"],
      ["mana", "Mana", "35"],
      ["spells", "Spells", "2"],
    ]) {
      const cell = html.slice(html.indexOf(`data-character-stat="${stat}"`));
      assert.match(cell.slice(0, 200), new RegExp(`<dt[^>]*>\\s*${label}\\s*</dt>\\s*<dd[^>]*>\\s*${value}\\s*</dd>`));
    }

    assert.match(html, /<a class="battle-readiness-link" href="\/profile">View full loadout<\/a>/);
  });

  it("keeps the base-points requirement ahead of every battle action", async () => {
    const html = await renderEntry({ confirmed: false });

    assert.ok(html.indexOf("battle-setup") < html.indexOf('data-region="trials"'), "the requirement comes first");
    assert.doesNotMatch(html, /data-pve-start/, "no trial can be started before base points are set");
    assert.doesNotMatch(html, /data-queue-join/, "no match can be joined before base points are set");
    assert.match(html, /href="\/profile"/);
    assert.match(html, /data-queue-panel/, "the queue panel and its live region survive");
  });

  it("keeps readable entry content off glass and full-scene imagery", () => {
    assert.doesNotMatch(styles, /--glass|backdrop-filter|box-shadow/);

    // The whole battle page carries data-ambient="scene", which strips the paper
    // for the immersive scene. The entry screen gets the shared book surface
    // back from the material layer that owns it — this sheet no longer mixes a
    // second sky-to-paper ramp of its own.
    assert.doesNotMatch(styles, /var\(--horizon-fade\)/, "the battle sheet owns no paper ramp");
    assert.match(
      read("public/styles/components/material.css"),
      /data-battle-focus="false"[^}]*background:\s*var\(--paper-field\)/s,
      "the entry screen still reads on paper, not on the scene",
    );
  });

  it("gives Trials the wider column, then stacks the choices at mobile", () => {
    assert.match(
      styles,
      /\.battle-choice-grid\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.55fr\)\s+minmax\(/s,
      "Trials is the dominant region on a wide screen",
    );
    assert.match(styles, /@media\s*\(max-width:\s*880px\)[\s\S]*\.battle-choice-grid\s*{[^}]*grid-template-columns:\s*1fr/s);
    assert.match(styles, /\.battle-readiness\s*{[^}]*background:\s*var\(--paper-muted\)/s);
    assert.doesNotMatch(styles, /\.battle-readiness\s*{[^}]*border:\s*1px/s, "readiness is a strip, not a competing card");
  });

  it("never reorders the stacked column away from its DOM order", async () => {
    const html = await renderEntry();

    assert.doesNotMatch(styles, /(^|[^-\w])order:\s*-?\d/m, "mobile order is DOM order: Trials, Friendly spar, readiness");
    assert.ok(
      html.indexOf('data-region="trials"') < html.indexOf('data-region="spar"'),
      "no loadout detail may sit between the two battle choices",
    );
    assert.ok(html.indexOf("battle-readiness-values") > html.indexOf('data-region="spar"'));
  });

  it("marks the course the way the rest of Achimari marks a course", () => {
    assert.match(
      styles,
      /\[data-state="completed"\]\s\.battle-encounter-marker\s*{[^}]*background:\s*var\(--ink\)/s,
      "a finished trial is a filled waypoint",
    );
    assert.match(
      styles,
      /\[data-next="true"\]\s\.battle-encounter-marker\s*{[^}]*border:\s*2px solid var\(--ink\)/s,
      "the trial you are on is the open waypoint",
    );
    assert.doesNotMatch(
      styles,
      /\[data-next="true"\]\s\.battle-encounter-marker\s*{[^}]*background:\s*var\(--ink\)/s,
      "filled and open must not be the same mark",
    );
  });

  it("never dims a locked trial's prerequisite below the contrast floor", () => {
    assert.doesNotMatch(styles, /\[data-state="locked"\][^{]*{[^}]*opacity:/s);
    assert.match(styles, /\[data-state="locked"\]\s\.battle-encounter-name\s*{[^}]*color:\s*var\(--ink-muted\)/s);
  });

  it("lets long encounter names, states and actions wrap instead of clipping", () => {
    assert.match(styles, /\.battle-encounter-head\s*{[^}]*flex-wrap:\s*wrap/s);
    assert.match(styles, /\.battle-encounter-name\s*{[^}]*overflow-wrap:\s*break-word/s);
    assert.doesNotMatch(styles, /\.battle-encounter-state\s*{[^}]*flex:\s*none/s, "the state must not squeeze the name");
    assert.match(styles, /\.battle-readiness-link\s*{[^}]*min-height:\s*var\(--tap-min\)/s);
  });
});
