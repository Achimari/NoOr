import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const readRaw = (relative) => readFileSync(path.join(appRoot, relative), "utf8");
const read = (relative) => readRaw(relative).replace(/\/\*[\s\S]*?\*\//g, "");
const style = (name) => read(path.join("public", "styles", name));

function allSheets() {
  const files = [];
  const pending = [path.join(appRoot, "public", "styles")];
  while (pending.length) {
    const dir = pending.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) pending.push(full);
      else if (entry.name.endsWith(".css")) files.push(path.relative(appRoot, full));
    }
  }
  return files.sort();
}

/** Every declaration block whose selector matches. */
const blocks = (css, selector) => [...css.matchAll(new RegExp(`${selector}[^{}]*\\{([^}]*)\\}`, "g"))].map(([, b]) => b);

/**
 * Monochrome state distinction (CONSTRAINTS.md, 2026-09-12).
 *
 * The wave that made this product black and white removed every colour a state
 * used to be recognised by. This suite exists so "success is green, failure is
 * red" cannot quietly become "success is grey, failure is the same grey": a
 * state must be recognisable by shape, weight, fill or word, and never by which
 * of two identical neutrals it happens to be.
 */
describe("states are distinguished without hue", () => {
  it("gives a failure a heavier rule than a confirmation, at every scale it appears", () => {
    const status = style("components/status.css");

    // A notice, a message and a destructive control all belong to the same
    // vocabulary: a failure is closed with the ink, a confirmation with a
    // hairline. If those two ever resolve to the same value, the whole
    // distinction is gone.
    const variables = read("public/styles/variables.css");
    const line = (name) => variables.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim();
    assert.notEqual(line("--danger-line"), line("--success-line"), "the two state rules must differ");

    assert.match(
      blocks(status, "\\.notice--danger")[0] || "",
      /border-inline-start:\s*3px solid var\(--danger-line\)/,
      "a failure notice is closed with the heavy rule",
    );
    assert.match(
      blocks(status, "\\.status-text--danger")[0] || "",
      /border-inline-start:\s*3px solid var\(--danger-line\)/,
      "and so is a failure message",
    );
  });

  it("marks a failure with a shape, not only with a fill", () => {
    // The error message carries a real icon from the shared registry, and it is
    // decorative, so the announced text is unchanged.
    for (const view of ["auth-login", "auth-onboarding"]) {
      const html = readRaw(`src/views/pages/partials/${view}.ejs`);
      const errors = [...html.matchAll(/<p class="field-error"[^>]*>([\s\S]*?)<\/p>/g)];
      assert.ok(errors.length, `${view} renders no field error`);
      for (const [, body] of errors) {
        assert.match(body, /name: "warning-circle"/, `${view}: every field error must carry the warning mark`);
      }
    }

    // And the field itself thickens rather than merely changing which black it
    // draws with.
    assert.match(
      blocks(style("components/fields.css"), '\\.field-input\\[aria-invalid="true"\\]')[0] || "",
      /border-width:\s*2px/,
      "an invalid field must differ in weight, not only in colour",
    );
  });

  it("never lets a hover tint impersonate a selection", () => {
    // A selected control is marked by something a hover cannot produce: a check,
    // a persistent dot, a solid inset ring, or the reversed ink field.
    const selected = [
      ["pages/daily-check-in.css", '\\.dashboard-action-yes\\[aria-pressed="true"\\]'],
      ["pages/daily-check-in.css", '\\.dashboard-action-no\\[aria-pressed="true"\\]'],
      ["pages/settings.css", '\\.settings-answer-yes\\[aria-pressed="true"\\]'],
      ["pages/settings.css", '\\.settings-answer-no\\[aria-pressed="true"\\]'],
      ["home/dashboard.css", '\\.prayer-reaction-choice\\[aria-pressed="true"\\]'],
      ["components/feed.css", "\\.prayer-reaction-button\\.selected"],
      ["game/explore.css", '\\.explore-loadout-toggle\\[aria-pressed="true"\\]'],
      ["game/achievements.css", '\\.achievements-filter\\[aria-pressed="true"\\]'],
    ];

    for (const [file, selector] of selected) {
      const css = style(file);
      const all = blocks(css, selector).join("\n");
      assert.ok(all, `${file}: ${selector} is not styled at all`);

      const marked =
        /border-inline-end:[^;]*currentColor/.test(all)       // a drawn check
        || /box-shadow:\s*inset 0 0 0 1px var\(--ink\)/.test(all)  // a solid ring
        || /background:\s*var\(--(?:ink|action|state-fill)\)/.test(all); // the reversed field
      assert.ok(marked, `${file}: ${selector} is marked only by a tint a hover could also produce`);
    }
  });

  it("keeps every hover a wash, so no hover can paint a selection's ground", () => {
    const offenders = [];
    for (const relative of allSheets()) {
      for (const [, body] of read(relative).matchAll(/:hover[^{}]*\{([^}]*)\}/g)) {
        if (/background(?:-color)?:\s*var\(--(?:ink|field|action)\)\s*;/.test(body)) {
          offenders.push(`${relative} — a hover paints the selected field`);
        }
      }
    }
    assert.deepEqual(offenders, [], "hover darkens; selection reverses. The two must not meet.");
  });

  it("keeps a disabled control visibly different from an unselected and a selected one", () => {
    const buttons = style("components/buttons.css");
    const disabled = blocks(buttons, "\\.ui-button:disabled")[0] || "";

    assert.match(disabled, /opacity:\s*0?\.\d+/, "a disabled control is faded");
    assert.match(disabled, /cursor:\s*not-allowed/, "and says so to a pointer");
    assert.match(disabled, /transform:\s*none/, "and does not answer a press");
  });

  it("labels every meter it draws, so a bar is never the only statement of a value", () => {
    const hud = readRaw("src/views/components/game/battle-hud.ejs");
    for (const label of ["HP", "Mana", "Resolve"]) {
      assert.ok(hud.includes(`>${label}<`), `${label} must be named beside its own meter`);
    }
    assert.match(hud, /battle-meter-value/, "and every meter must print its own figures");
  });

  it("gives each chart series a mark of its own rather than a second tone", () => {
    // Where two series used to be a green and a red, they are now a solid fill
    // and a hatch — and the legend states both in words.
    const statistics = style("pages/statistics.css");

    const yes = blocks(statistics, "\\.ledger-legend-item--yes::before").join("\n");
    const no = blocks(statistics, "\\.ledger-legend-item--no::before").join("\n");
    assert.ok(yes && no, "both answer series must have a legend swatch");

    assert.doesNotMatch(yes, /gradient/, "Yes is the solid fill");
    assert.match(no, /background-image:\s*var\(--ledger-hatch\)/, "No is the same ink under a hatch");
    assert.match(statistics, /--ledger-hatch:\s*repeating-linear-gradient/, "and the hatch is a real screen");

    // The tracks themselves, not only the legend key. The No segment carries a
    // hatch child, and that child undoes the segment's own horizontal squeeze
    // so the stripe pitch is constant however small the share is.
    assert.match(
      blocks(statistics, "\\.ledger-track-hatch").join("\n"),
      /background-image:\s*var\(--ledger-hatch\)/,
      "the No bar must carry the same screen its legend key promises",
    );
    const rows = readRaw("src/views/pages/partials/statistics-content.ejs");
    assert.match(rows, /ledger-track-segment--no/, "the No segment must be rendered");
    assert.match(rows, /ledger-track-hatch/, "and it must carry its hatch");

    // And both are named in words, so the screen is never the only statement.
    const html = readRaw("src/views/pages/partials/statistics-content.ejs");
    assert.match(html, /ledger-legend-item--yes/);
    assert.match(html, /ledger-legend-item--no/);
  });

  it("keeps a focus ring visible on the black field as well as on the sheet", () => {
    const variables = read("public/styles/variables.css");
    assert.match(variables, /--focus-ring-color:\s*var\(--ink\)/, "the ring is ink on paper");
    assert.match(variables, /--focus-ring-on-deep:\s*var\(--white\)/, "and white on the field");

    // Every inverse surface has to say which ring it takes. A black ring on a
    // black field is not a ring.
    const offenders = [];
    for (const relative of allSheets()) {
      const css = read(relative);
      for (const [, selector, body] of css.matchAll(/([^{};]*):focus-visible([^{}]*\{[^}]*\})/g)) {
        const full = `${selector}${body}`;
        if (/background:\s*var\(--(?:ink|field|action)\)/.test(full) && !/outline-color/.test(full)) {
          offenders.push(`${relative} — ${selector.trim()} fills with ink but names no ring colour`);
        }
      }
    }
    assert.deepEqual(offenders, [], "a control that fills with ink on focus must also say which ring it takes");
  });
});
