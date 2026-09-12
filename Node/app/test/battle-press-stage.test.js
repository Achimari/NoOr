import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFileSync(path.join(appRoot, relative), "utf8");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const arena = () => stripComments(read("public/styles/game/battle-arena.css"));
const entry = () => stripComments(read("public/styles/game/battle.css"));
const view = () => read("src/views/pages/partials/battle-content.ejs");
const script = () => read("public/scripts/pages/battle.js");

const rule = (selector, css = arena()) =>
  (css.match(new RegExp(`(?:^|\\n|,)\\s*${selector}\\s*\\{([^}]*)\\}`)) || [])[1] || "";

const mediaBlock = (query, css = arena()) =>
  (css.match(new RegExp(`@media \\(${query}\\)\\s*\\{([\\s\\S]*?)\\n\\}`)) || [])[1] || "";

/**
 * Battle is the one place the system is allowed to be dramatic, and the one
 * place the server is most completely in charge. Sacred Press changes the
 * arena's art direction — a printed stage, one vermilion impact, ink tones
 * instead of a second and third brand hue — and changes nothing about what the
 * arena does.
 *
 * Every simulation, domain and choreography contract in
 * `test/battle-arena.test.js`, `test/battle-v2.test.js`, `test/battle-v3.test.js`,
 * `test/combat.test.js` and `test/boss-phases.test.js` is untouched by this
 * file; this one covers the presentation layer only.
 */
describe("the arena is a printed stage", () => {
  it("stands the stage on paper, not on a white wash", () => {
    const active = rule("\\.battle-active");

    assert.match(active, /background:\s*var\(--paper\)/, "the stage is the sheet, at full strength");
    assert.doesNotMatch(active, /radial-gradient/, "no soft glow stands in for a printed ground");
  });

  it("keeps decorative artwork out of the live stage", () => {
    assert.doesNotMatch(view(), /battle-plate-art|press-plate|\/images\/plates\/arena/);
    assert.equal(rule("\\.battle-plate-art"), "", "no unused plate slot remains in the stage stylesheet");
  });

  it("prints the ground as a halftone band rather than a soft radial shadow", () => {
    const ground = rule("\\.battle-ground");

    assert.match(ground, /repeating-linear-gradient/, "the ground is screened, like everything else printed here");
    assert.doesNotMatch(ground, /radial-gradient/);
  });

  it("runs every meter on ink, and tells them apart by printed fill rather than hue", () => {
    const active = rule("\\.battle-active");
    const css = arena();

    // Health was the semantic green until 2026-09-12. Every meter on the stage
    // is the one ink now, so none of them may be recognised by its colour —
    // which means each has to carry its own printed fill instead.
    for (const resource of ["hp", "hp-danger", "mana", "resolve"]) {
      assert.match(
        active,
        new RegExp(`--${resource}:\\s*var\\(--ink`),
        `${resource} must resolve to an ink tone, not a hue`,
      );
    }
    assert.doesNotMatch(active, /#2f5d9e|#b07d28|#8a5f18|var\(--success\)|var\(--danger\)/, "no hue survives on the stage");

    // Each track is screened differently, so a reader never has to tell two
    // identical black bars apart by which row they are in.
    const fills = {
      "battle-track-health\\[data-danger=\"true\"\\] \\.battle-track-fill": /repeating-linear-gradient\(-45deg/,
      "battle-track-mana \\.battle-track-fill": /radial-gradient\(/,
      "battle-track-resolve \\.battle-track-fill": /repeating-linear-gradient\(0deg/,
    };
    for (const [selector, screen] of Object.entries(fills)) {
      assert.match(rule(`\\.${selector}`), screen, `.${selector} must carry its own printed screen`);
    }

    // And plain health stays the solid field, so "full" is the one unscreened
    // bar on the stage.
    assert.doesNotMatch(rule("\\.battle-track-health \\.battle-track-fill"), /gradient/, "health at rest is solid ink");
    assert.match(css, /--hp-lag:\s*rgb\(0 0 0/, "the lag bar behind health is the same ink, not a second colour");
  });

  it("keeps every resource labelled, so tone is never the only signal", () => {
    const html = view();

    const hud = read("src/views/components/game/battle-hud.ejs");

    for (const label of ["HP", "Mana", "Resolve"]) {
      assert.match(
        hud,
        new RegExp(`class="battle-meter-label">${label}<`),
        `${label} must still be named beside its meter`,
      );
    }
    assert.ok(html.includes("battle-hud"), "the HUD is still composed into the arena");
  });

  it("puts no glass or gloss anywhere on the stage", () => {
    const css = arena();

    assert.doesNotMatch(css, /backdrop-filter:\s*(?!none)/, "a printed plate is not a pane of glass");
    assert.doesNotMatch(css, /--glass/, "and the glass token is retired");
    assert.doesNotMatch(rule("\\.battle-plate"), /rgba\(255,\s*255,\s*255/, "a plate is opaque paper");
  });
});

describe("impact is one vermilion frame on a resolved action", () => {
  it("prints the impact in the accent, not as a cream glow", () => {
    // `.battle-impact` is styled by two blocks — a shared positioning rule it
    // sits in with the other stage effects, and its own appearance rule — so
    // this reads every block that names it.
    const blocks = arena()
      .match(/[^{}]*\{[^}]*\}/g)
      .filter((block) => /\.battle-impact\b/.test(block.slice(0, block.indexOf("{"))))
      .join("\n");

    assert.ok(blocks, ".battle-impact must be styled");
    assert.match(blocks, /var\(--accent\)/, "the overprint is the impact");
    assert.doesNotMatch(blocks, /rgba\(255,\s*25[04]/, "no cream halo");
    assert.equal(
      (arena().match(/var\(--accent\)/g) || []).length >= 1,
      true,
      "the accent appears on the stage",
    );
  });

  it("ties hit-stop and the impact frame to a beat the server resolved", () => {
    const js = script();

    // The presentation compiler turns the server's resolved turn into beats;
    // the impact and the hit-stop are driven from those, never from a timer
    // the client invented.
    assert.match(js, /stage\.dataset\.hitStop = "true"/, "hit-stop is a state the choreography sets");
    assert.match(js, /stage\.dataset\.hitStop = "false"/, "and one it always clears again");
    assert.match(js, /TIMING\.hitStop\[plan\.tier\]/, "its length comes from the beat's own importance tier");
    assert.doesNotMatch(js, /setInterval\([^)]*impact/i, "impact never runs on a loop of its own");
  });

  it("returns to rest: the impact is transient, never a new resting state", () => {
    const impact = rule("\\.battle-impact");

    assert.match(impact, /opacity:\s*0/, "at rest the impact is not on screen");
    assert.match(impact, /transition:\s*opacity/, "and it leaves the way it arrived");
  });

  it("pauses the idle loop during hit-stop instead of stalling the simulation", () => {
    // game-feel: hit-stop freezes the *visual*, never the logic. The idle
    // animation is what pauses; the turn resolution has already happened on the
    // server by the time any of this runs.
    assert.match(arena(), /\[data-hit-stop="true"\] \.battle-figure-idle \{ animation-play-state: paused; \}/);
  });

  it("removes the wipe, the settle and the hit-stop for a reduced-motion reader", () => {
    const reduced = mediaBlock("prefers-reduced-motion: reduce");

    assert.ok(reduced, "the arena must answer prefers-reduced-motion");
    assert.match(reduced, /animation:\s*none|animation-play-state|transition:\s*none/);
  });
});

describe("the arena stays readable and reachable", () => {
  it("keeps every action target at or above the touch floor", () => {
    for (const selector of ["\\.battle-action", "\\.battle-spell", "\\.battle-end-turn"]) {
      const block = rule(selector);
      if (!block) continue;
      assert.match(
        block,
        /min-height:\s*(?:var\(--tap-min\)|4[4-9]px|[5-9]\dpx|clamp\(4[4-9]px|clamp\([5-9]\dpx)/,
        `${selector} must stay a real target`,
      );
    }
  });

  it("keeps the stage inside the safe area on a notched phone", () => {
    const stage = rule("\\.battle-stage");

    assert.match(stage, /env\(safe-area-inset-top\)/);
    assert.match(stage, /env\(safe-area-inset-left\)/);
    assert.match(stage, /env\(safe-area-inset-right\)/);
  });

  it("keeps the turn log and every action reason in readable text", () => {
    const html = view();

    assert.match(html, /data-battle-log|battle-log/, "the log is still rendered");
    assert.match(html, /aria-live/, "and it still announces itself");
  });

  it("states every reading as text, so a bar's length is never the only signal", () => {
    const hud = read("src/views/components/game/battle-hud.ejs");

    // Each meter prints "now / max" in the data role, and the bar beside it is
    // decorative. That is why the ink tones below can tell mana from resolve
    // without a second brand hue: the numbers are already there.
    assert.match(hud, /class="battle-meter-value">[\s\S]{0,200}?data-<%= side %>-health/);
    assert.equal(
      (hud.match(/class="battle-track[^"]*" [^>]*aria-hidden="true"/g) || []).length,
      3,
      "every track is decorative and hidden from assistive technology",
    );
  });

  it("drives the HUD from the server's own state, never from a poll of the DOM", () => {
    const js = script();

    assert.doesNotMatch(js, /setInterval\([^)]*renderHud|setInterval\([^)]*updateMeters/i);
    assert.match(js, /applySnapshot|renderState|function render/i, "the HUD renders from a snapshot the server sent");
  });

  it("leaves the entry screen and the active arena as two different states", () => {
    assert.match(view(), /data-battle-focus/, "the page still switches between entry and arena");
    assert.ok(entry().length > 0, "and the entry screen keeps its own sheet");
    assert.match(arena(), /\.battle-active\[hidden\] \{ display: none; \}/, "the arena is hidden until it is live");
  });
});
