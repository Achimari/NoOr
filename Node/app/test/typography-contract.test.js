import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { allRules, parseRules, relative, smallestPx, styleFiles } from "./helpers/cssRules.js";
import { readWoff2 } from "./helpers/woff2.js";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const fontsDir = path.join(appRoot, "public", "fonts");
const read = (relativePath) => readFileSync(path.join(appRoot, relativePath), "utf8");

/**
 * Sacred Press sets the product in four semantic roles drawn from three
 * self-hosted OFL families. The role a piece of text has decides its family:
 * display for the page opening, condensed UI for the interface, body for prose,
 * mono for data. Nothing picks a font by taste, and the expressive face never
 * touches a label, a control or a table.
 *
 * This supersedes the single-Achimari-Hand contract recorded in CONSTRAINTS.md
 * on 2026-09-11. Because the faces are now drawn for screen interfaces rather
 * than being a handwritten specimen, the size floors return to conventional UI
 * minimums instead of sitting a step above them.
 */
const TEXT_FLOOR_PX = 16; // prose and anything read in quantity
const CONTROL_FLOOR_PX = 15; // navigation, inputs, buttons, compact labels
const ABSOLUTE_FLOOR_PX = 13; // the mono margin marks, and nothing else

const ROLE_FAMILY = {
  "--font-display": "Unbounded",
  "--font-ui": "IBM Plex Sans Condensed",
  "--font-body": "IBM Plex Sans",
  "--font-data": "IBM Plex Mono",
  "--font-reading": "IBM Plex Sans",
};

/**
 * The display face is the loudest object in the system, so its use is a closed
 * list rather than a convention. Adding a selector here is a deliberate design
 * decision: a page opening, a selected section opening, the wordmark, or a
 * major editorial numeral. A label, a button, a form or a table never appears.
 */
const DISPLAY_ROLE_SELECTORS = new Set([
  ".brand-wordmark",
  ".brand-lockup--masthead .brand-wordmark",
  ".t-page-title",
  ".section-title",
  ".page-head-title",
  ".section-head-title",
  ".hero-title",
  ".auth-title",
  ".today-title",
  ".practice-title",
  ".explore-title",
  ".profile-name",
  ".profile-stat-value",
  ".battle-choice-title",
  ".battle-outcome-title",
  ".battle-stage-title",
  ".today-page .dashboard-action-label",
  ".stat-line-value",
  ".press-figure-value",
]);

/**
 * Text below the 16px prose floor is confined to the mono marks that run beside
 * a composition and to compact metadata. Everything here is short, set in the
 * data role, and never the only place a fact appears.
 */
const SMALL_TEXT_ALLOWED = /(-mark|-micro|-meta|-eyebrow|-caption|-unit|-legend|-tick|-axis|-stamp|-note)\b/;

/** Families a stack may fall back to. None of them is a chosen typeface. */
const APPROVED_FALLBACKS =
  /^(system-ui|sans-serif|serif|monospace|cursive|ui-monospace|SFMono-Regular|Menlo|"Arial Narrow"|"?Segoe UI"?|-apple-system|BlinkMacSystemFont)$/;

const SHIPPED_FACES = [
  { file: "unbounded/Unbounded-Variable.woff2", family: "Unbounded", weight: "400 900", variable: true },
  {
    file: "ibm-plex-sans-condensed/IBMPlexSansCondensed-Regular.woff2",
    family: "IBM Plex Sans Condensed",
    weight: "400",
  },
  {
    file: "ibm-plex-sans-condensed/IBMPlexSansCondensed-SemiBold.woff2",
    family: "IBM Plex Sans Condensed",
    weight: "600",
  },
  { file: "ibm-plex-sans/IBMPlexSans-Regular.woff2", family: "IBM Plex Sans", weight: "400" },
  { file: "ibm-plex-sans/IBMPlexSans-SemiBold.woff2", family: "IBM Plex Sans", weight: "600" },
  { file: "ibm-plex-mono/IBMPlexMono-Regular.woff2", family: "IBM Plex Mono", weight: "400" },
  { file: "ibm-plex-mono/IBMPlexMono-SemiBold.woff2", family: "IBM Plex Mono", weight: "600" },
];

/** Russian and English, the two languages the interface is written in. */
const CYRILLIC = [..."АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя"];
const LATIN = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"];
const DIGITS = [..."0123456789"];
const PUNCTUATION = [...".,:;!?'\"()[]{}-–—…«»/%№+="];

function tokenTable() {
  const tokens = {};
  for (const [, name, value] of read("public/styles/variables.css").matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    tokens[name] = value.trim();
  }
  return tokens;
}

function resolve(value, tokens, depth = 0) {
  if (depth > 8) return value;
  return value.replace(/var\((--[\w-]+)(?:,[^)]*)?\)/g, (whole, name) =>
    tokens[name] === undefined ? whole : resolve(tokens[name], tokens, depth + 1),
  );
}

const tokens = tokenTable();
const pxOf = (value) => smallestPx(resolve(value, tokens));
const declaration = (rule, property) => rule.declarations.findLast((d) => d.property === property);

const matches = (rule, selector) => rule.selector.split(",").some((part) => part.trim() === selector);

/**
 * The rule that actually carries `property` for `selector`. A bare `find` picks
 * the first block naming the selector, which in globals.css is the reset
 * (`html, body, #root`) rather than the block that styles the document.
 */
const findRule = (file, selector, property) => {
  const candidates = parseRules(read(file), file).filter((rule) => matches(rule, selector));
  if (!property) return candidates[0];
  return candidates.findLast((rule) => rule.declarations.some((d) => d.property === property)) ?? candidates[0];
};

const faceOf = (relPath) => readWoff2(path.join(fontsDir, relPath));

function allFontFaceBlocks() {
  const blocks = [];
  for (const file of styleFiles()) {
    const css = readFileSync(file, "utf8");
    for (const [block] of css.matchAll(/@font-face\s*\{[^}]*\}/g)) {
      blocks.push({ file: relative(file), block });
    }
  }
  return blocks;
}

function allViews() {
  const views = [];
  const pending = [path.join(appRoot, "src", "views")];
  while (pending.length) {
    const dir = pending.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) pending.push(full);
      else if (entry.name.endsWith(".ejs")) views.push(full);
    }
  }
  return views;
}

describe("four roles, three families", () => {
  it("resolves every type role to the family that role is for", () => {
    for (const [role, family] of Object.entries(ROLE_FAMILY)) {
      const resolved = resolve(`var(${role})`, tokens);
      assert.ok(
        resolved.startsWith(`"${family}"`),
        `${role} must lead with "${family}", got ${resolved}`,
      );
    }
  });

  it("leaves the handwritten face in no role, no stylesheet and no served path", () => {
    for (const file of styleFiles()) {
      assert.doesNotMatch(
        readFileSync(file, "utf8"),
        /Achimari Hand|achimari-hand/i,
        `${relative(file)} still references the superseded handwritten face`,
      );
    }
    for (const file of allViews()) {
      assert.doesNotMatch(readFileSync(file, "utf8"), /achimari-hand/i, `${relative(file)} still requests it`);
    }
    assert.ok(
      !existsSync(path.join(fontsDir, "achimari-hand", "AchimariHand-Regular.otf")),
      "a generated font with no consumer must not sit in the served font path",
    );
    assert.doesNotMatch(read("public/styles/variables.css"), /--font-brand:/, "--font-brand is retired");
  });

  it("ends every role in a real fallback, so a failed request still reads", () => {
    for (const role of Object.keys(ROLE_FAMILY)) {
      const stack = resolve(`var(${role})`, tokens).split(",").map((part) => part.trim());
      assert.ok(stack.length >= 2, `${role} must declare a fallback behind its face`);
      const last = stack.at(-1);
      assert.match(last, APPROVED_FALLBACKS, `${role} ends in ${last}, which is not a generic fallback`);
      for (const entry of stack.slice(1)) {
        assert.match(entry, APPROVED_FALLBACKS, `${role} falls back to ${entry}, a typeface this product does not ship`);
      }
    }
  });

  it("lets no selector name a typeface outside the three shipped families", () => {
    const shipped = new Set(Object.values(ROLE_FAMILY));
    const offenders = [];

    for (const rule of allRules()) {
      if (rule.selector.startsWith("@")) continue;
      const family = declaration(rule, "font-family");
      if (!family) continue;
      const value = family.value.trim();
      if (/^(inherit|initial|unset|revert)$/.test(value)) continue;

      for (const entry of resolve(value, tokens).split(",").map((part) => part.trim())) {
        const bare = entry.replace(/^["']|["']$/g, "");
        if (shipped.has(bare) || APPROVED_FALLBACKS.test(entry) || APPROVED_FALLBACKS.test(bare)) continue;
        offenders.push(`${rule.file}:${rule.line} ${rule.selector.replace(/\s+/g, " ")} — ${entry}`);
      }
    }

    assert.deepEqual(offenders, [], "every component draws from the three vendored families");
  });

  it("keeps the display face on page openings and off the interface", () => {
    const offenders = [];

    for (const rule of allRules()) {
      const family = declaration(rule, "font-family");
      if (!family || !/var\(--font-display\)/.test(family.value)) continue;
      for (const part of rule.selector.split(",").map((s) => s.trim())) {
        if (!DISPLAY_ROLE_SELECTORS.has(part)) {
          offenders.push(`${rule.file}:${rule.line} ${part}`);
        }
      }
    }

    assert.deepEqual(
      offenders,
      [],
      "the display face is a closed list: openings, the wordmark and major numerals only",
    );
  });

  it("never sets a control, field, table or menu in the display face", () => {
    const interfaceShapes = /(button|input|field|label|menu|nav|link|table|row|cell|option|filter|tab|chip|badge|hint|toggle)/i;
    const offenders = [...DISPLAY_ROLE_SELECTORS].filter(
      (selector) => interfaceShapes.test(selector) && !selector.includes("dashboard-action-label"),
    );

    // `.dashboard-action-label` is the single approved exception: YES / NO is
    // the page's one-word answer, set at editorial scale, not a control label.
    assert.deepEqual(offenders, [], "an interface element never takes the display face");
  });

  it("sets the document and the active arena in the condensed UI role", () => {
    for (const [file, selector] of [
      ["public/styles/globals.css", "body"],
      ["public/styles/globals.css", ".battle-active"],
    ]) {
      const rule = findRule(file, selector, "font-family");
      assert.ok(rule, `${file} must still style ${selector}`);
      assert.equal(declaration(rule, "font-family").value, "var(--font-ui)");
    }
    assert.match(resolve("var(--font-ui)", tokens), /^"IBM Plex Sans Condensed"/);
  });

  it("sets prose in the body role and data in the mono role", () => {
    assert.match(resolve("var(--font-body)", tokens), /^"IBM Plex Sans"/);
    assert.match(resolve("var(--font-data)", tokens), /^"IBM Plex Mono"/);

    const table = findRule("public/styles/components/tables.css", ".data-table");
    assert.equal(declaration(table, "font-family").value, "var(--font-data)", "a table of figures is data");
  });
});

describe("real weights only", () => {
  it("publishes the weight tokens the shipped faces can actually draw", () => {
    const variables = read("public/styles/variables.css");

    assert.match(variables, /--weight-body:\s*400/);
    assert.match(variables, /--weight-strong:\s*600/);
    assert.match(variables, /--weight-display:\s*700/);
    assert.match(variables, /--weight-display-heavy:\s*800/);
  });

  it("asks the static Plex faces for 400 or 600 and nothing between", () => {
    const displayOnly = new Set(["700", "800", "900"]);
    const offenders = [];

    for (const rule of allRules()) {
      if (rule.selector.startsWith("@font-face")) continue;
      for (const decl of rule.declarations) {
        if (decl.property !== "font-weight") continue;
        const resolved = resolve(decl.value, tokens).trim();
        if (/^(400|600|normal|inherit|initial|unset|revert)$/.test(resolved)) continue;

        // A heavier weight is legal only where the display face is also set,
        // because only Unbounded ships an axis that reaches it.
        const family = declaration(rule, "font-family");
        const isDisplay = family && /var\(--font-display\)/.test(family.value);
        if (isDisplay && displayOnly.has(resolved)) continue;

        offenders.push(`${rule.file}:${rule.line} ${rule.selector.replace(/\s+/g, " ")} — ${decl.value} (${resolved})`);
      }
    }

    assert.deepEqual(offenders, [], "a weight the repository does not ship is a synthesised guess");
  });

  it("keeps every display weight inside the axis the variable file actually carries", () => {
    const axis = faceOf("unbounded/Unbounded-Variable.woff2").axes.find((a) => a.tag === "wght");
    assert.ok(axis, "the display face must expose a weight axis");

    for (const name of ["--weight-display", "--weight-display-heavy"]) {
      const weight = Number(resolve(`var(${name})`, tokens));
      assert.ok(
        weight >= axis.min && weight <= axis.max,
        `${name} is ${weight}, outside the shipped ${axis.min}–${axis.max} axis`,
      );
    }
  });

  it("disables synthetic bold and italic globally", () => {
    const body = findRule("public/styles/globals.css", "body", "font-synthesis");

    assert.equal(
      declaration(body, "font-synthesis").value.trim(),
      "none",
      "the browser must never invent a weight or a slant the repository does not ship",
    );
  });

  it("leaves text rasterisation to the platform", () => {
    const offenders = [];

    for (const rule of allRules()) {
      for (const decl of rule.declarations) {
        if (/^(-webkit-font-smoothing|-moz-osx-font-smoothing)$/.test(decl.property)) {
          offenders.push(`${rule.file}:${rule.line} ${rule.selector} — ${decl.property}: ${decl.value}`);
        }
        if (decl.property === "text-rendering" && /optimizeLegibility/i.test(decl.value)) {
          offenders.push(`${rule.file}:${rule.line} ${rule.selector} — text-rendering: ${decl.value}`);
        }
      }
    }

    assert.deepEqual(offenders, [], "no global override of the browser's own rasterisation");
  });

  it("fakes no bold with shadows, strokes or duplicated glyphs", () => {
    // `.battle-hit` is the damage number that flies over the arena artwork for
    // ~600ms. Its halo lifts a coloured number off a printed plate; it is
    // transient combat feedback, not weight simulation, and the same value is
    // stated durably in the health meter and the battle log.
    const allowed = new Set([".battle-hit"]);
    const offenders = [];

    for (const rule of allRules()) {
      const selectors = rule.selector.split(",").map((part) => part.trim());
      if (selectors.every((part) => allowed.has(part))) continue;

      const shadow = declaration(rule, "text-shadow");
      if (shadow && !/^none$/i.test(shadow.value.trim())) {
        offenders.push(`${rule.file}:${rule.line} ${rule.selector} — text-shadow: ${shadow.value}`);
      }
      const stroke = declaration(rule, "-webkit-text-stroke");
      if (stroke && !/^(0|none)/.test(stroke.value.trim())) {
        offenders.push(`${rule.file}:${rule.line} ${rule.selector} — text-stroke: ${stroke.value}`);
      }
    }

    assert.deepEqual(offenders, [], "a thickened outline is not a weight; use the real 600 or the display axis");
  });
});

describe("the readable floor", () => {
  it(`declares no font-size below ${ABSOLUTE_FLOOR_PX}px anywhere in the styles`, () => {
    const offenders = [];

    for (const rule of allRules()) {
      for (const decl of rule.declarations) {
        if (decl.property !== "font-size") continue;
        const px = pxOf(decl.value);
        if (px !== null && px < ABSOLUTE_FLOOR_PX) {
          offenders.push(`${rule.file}:${rule.line} ${rule.selector.replace(/\s+/g, " ")} — ${px}px (${decl.value})`);
        }
      }
    }

    assert.deepEqual(offenders, [], "nothing in the product is set smaller than the mono margin marks");
  });

  it(`confines the ${ABSOLUTE_FLOOR_PX}px step to margin marks a reader can ignore`, () => {
    const offenders = [];

    for (const rule of allRules()) {
      for (const decl of rule.declarations) {
        if (decl.property !== "font-size") continue;
        const px = pxOf(decl.value);
        if (px === null || px >= 14) continue;
        for (const part of rule.selector.split(",").map((s) => s.trim())) {
          if (!SMALL_TEXT_ALLOWED.test(part)) {
            offenders.push(`${rule.file}:${rule.line} ${part} — ${px}px`);
          }
        }
      }
    }

    assert.deepEqual(offenders, [], "the smallest step is for margin marks, never for content");
  });

  it(`sets every long-form prose surface at ${TEXT_FLOOR_PX}px or more`, () => {
    const prose = [
      ["public/styles/shell.css", ".page-head-lede"],
      ["public/styles/game/help.css", ".help-section p"],
    ];

    for (const [file, selector] of prose) {
      const rule = findRule(file, selector, "font-size");
      assert.ok(rule, `${file} must still style ${selector}`);
      const size = declaration(rule, "font-size");
      if (!size) continue;
      assert.ok(
        pxOf(size.value) >= TEXT_FLOOR_PX,
        `${selector} is ${pxOf(size.value)}px; prose starts at ${TEXT_FLOOR_PX}px`,
      );
    }
  });

  it("audits real declarations, not only the token definitions", () => {
    // Guards the tests above: a literal size written straight into a component
    // must be caught, so the floor cannot be dodged by skipping the token scale.
    const probe = parseRules(".probe { font-size: 0.625rem; }", "probe.css");

    assert.equal(probe.length, 1);
    assert.equal(pxOf(probe[0].declarations[0].value), 10);

    const literals = allRules().flatMap((rule) =>
      rule.declarations.filter((d) => d.property === "font-size" && /\d/.test(d.value) && !d.value.includes("var(")),
    );
    assert.ok(literals.length > 0, "the audit must be exercising literal sizes, not just var() lookups");
  });

  it("holds the whole token scale at or above the absolute floor", () => {
    for (const [name, value] of Object.entries(tokens)) {
      if (!/^--text-/.test(name)) continue;
      const px = pxOf(value);
      if (px === null) continue;
      assert.ok(px >= ABSOLUTE_FLOOR_PX, `${name} resolves to ${px}px, below the ${ABSOLUTE_FLOOR_PX}px floor`);
    }
  });

  it("sets long-form copy at 17px with generous leading", () => {
    const body = pxOf("var(--text-body)");
    assert.equal(body, 17, `--text-body must be 17px, got ${body}px`);

    const leading = Number(resolve("var(--leading-body)", tokens));
    assert.ok(leading >= 1.5 && leading <= 1.65, `--leading-body must sit at 1.5–1.65, got ${leading}`);
  });

  it("keeps the scale's steps in their intended bands", () => {
    assert.equal(pxOf("var(--text-control)"), 16, "interface copy, inputs and controls sit at 16px");
    assert.equal(pxOf("var(--text-label)"), 15, "labels sit at 15px");
    assert.equal(pxOf("var(--text-meta)"), 14, "dates, timers and metadata sit at 14px");
    assert.equal(pxOf("var(--text-mark)"), 13, "the mono margin mark is the floor");
    assert.equal(tokens["--text-micro"], undefined, "--text-micro is retired; metadata is --text-meta");

    const display = pxOf("var(--text-display)");
    assert.ok(display >= 40, `--text-display floors at ${display}px; a page opening must still read as display type`);
    assert.ok(
      /clamp\(/.test(tokens["--text-display"]),
      "the page opening is fluid, so a long word cannot clip a narrow screen",
    );
  });

  it("caps the page opening under the 96px display ceiling", () => {
    const max = Math.max(
      ...[...resolve(tokens["--text-display"], tokens).matchAll(/([\d.]+)rem/g)].map(([, n]) => Number(n) * 16),
    );

    assert.ok(max <= 96, `--text-display reaches ${max}px; above 96px the page is shouting`);
  });

  it("keeps the shared title floor narrow enough for Achievements on a 320px shell", () => {
    const variables = read("public/styles/variables.css");
    const floor = variables.match(/--text-page-title:\s*clamp\(([\d.]+)rem,/);

    assert.ok(floor, "the shared page title must keep a fluid clamp");
    assert.ok(Number(floor[1]) * 16 <= 28, "the longest main-page title must not clip the narrowest supported viewport");
  });

  it(`keeps navigation, inputs and primary controls at ${CONTROL_FLOOR_PX}px or more`, () => {
    const controls = [
      ["public/styles/header/base.css", ".header-link"],
      ["public/styles/components/buttons.css", ".ui-button"],
      ["public/styles/components/fields.css", ".field-input"],
      ["public/styles/components/fields.css", ".field-label"],
    ];

    for (const [file, selector] of controls) {
      const rule = findRule(file, selector);
      assert.ok(rule, `${file} must still style ${selector}`);
      const size = declaration(rule, "font-size");
      assert.ok(size, `${selector} must state its size`);
      assert.ok(
        pxOf(size.value) >= CONTROL_FLOOR_PX,
        `${selector} is ${pxOf(size.value)}px; controls start at ${CONTROL_FLOOR_PX}px`,
      );
    }
  });

  it("keeps every reading in an active fight legible at a glance", () => {
    const offenders = [];

    for (const file of ["public/styles/game/battle-arena.css", "public/styles/game/battle.css"]) {
      for (const rule of parseRules(read(file), file)) {
        for (const decl of rule.declarations) {
          if (decl.property !== "font-size") continue;
          const px = pxOf(decl.value);
          if (px === null || px >= 14) continue;
          for (const part of rule.selector.split(",").map((s) => s.trim())) {
            if (!SMALL_TEXT_ALLOWED.test(part)) offenders.push(`${rule.file}:${rule.line} ${part} — ${px}px`);
          }
        }
      }
    }

    assert.deepEqual(offenders, [], "HUD text drives the next move and must be legible at a glance");
  });

  it("caps long-form prose at a real 65–75 character measure", () => {
    // `ch` is the advance of "0". IBM Plex Sans draws a normal-width zero, so
    // the unit now means what it says; the handwritten face this replaced had a
    // very wide zero, which is why the old token was calibrated in rem instead.
    const prose = resolve("var(--measure-prose)", tokens).trim();
    const ch = Number((prose.match(/^([\d.]+)ch$/) || [])[1]);

    assert.ok(ch >= 65 && ch <= 75, `--measure-prose is ${prose}, outside the 65–75ch band`);

    const lede = findRule("public/styles/shell.css", ".page-head-lede");
    assert.equal(declaration(lede, "max-width").value, "var(--measure-prose)");

    const helpProse = findRule("public/styles/game/help.css", ".help-section p");
    assert.equal(declaration(helpProse, "max-width").value, "var(--measure-prose)");
  });
});

describe("casing and tracking", () => {
  it("forces no heading to uppercase from the global sheet", () => {
    assert.doesNotMatch(
      read("public/styles/globals.css"),
      /:where\([^)]*h2[^)]*\)\s*\{[^}]*text-transform:\s*uppercase/s,
      "a heading keeps its word shapes",
    );
  });

  it("tracks every uppercase run, because capitals collide at default spacing", () => {
    const offenders = [];

    for (const rule of allRules()) {
      const transform = declaration(rule, "text-transform");
      if (!transform || !/uppercase/i.test(transform.value)) continue;

      const tracking = declaration(rule, "letter-spacing");
      const size = declaration(rule, "font-size");
      const px = size ? pxOf(size.value) : null;
      // Display-scale capitals are large enough to read without added tracking.
      if (px !== null && px >= 32) continue;
      if (!tracking) {
        offenders.push(`${rule.file}:${rule.line} ${rule.selector.replace(/\s+/g, " ")} — uppercase with no tracking`);
      }
    }

    assert.deepEqual(offenders, [], "short all-caps labels need 5–12% tracking to stay readable");
  });

  it("keeps display tracking off the collision floor and small-label tracking restrained", () => {
    const offenders = [];

    for (const rule of allRules()) {
      for (const decl of rule.declarations) {
        if (decl.property !== "letter-spacing") continue;
        const resolved = resolve(decl.value, tokens).trim();
        const em = resolved.match(/^(-?[\d.]+)em$/);
        if (!em) continue;
        const value = Number(em[1]);
        if (value < -0.04) {
          offenders.push(`${rule.file}:${rule.line} ${rule.selector} — ${resolved} collides the letterforms`);
        }
        if (value > 0.12) {
          offenders.push(`${rule.file}:${rule.line} ${rule.selector} — ${resolved} exceeds 0.12em`);
        }
      }
    }

    assert.deepEqual(offenders, []);
  });

  it("keeps body copy at zero tracking", () => {
    const body = findRule("public/styles/globals.css", "body", "letter-spacing");

    assert.equal(declaration(body, "letter-spacing").value.trim(), "0");
  });

  it("writes the Today heading in sentence case in the markup it ships", () => {
    assert.match(
      read("src/views/pages/partials/home-content.ejs"),
      /class="page-head-title today-title">Today</,
      "the visible title reads Today; capitals are a typographic treatment, not a rewrite",
    );
  });
});

describe("numbers read by alignment and a fixed advance", () => {
  const NUMERIC = [
    ["public/styles/components/tables.css", ".data-table .data-table-rank"],
    ["public/styles/components/tables.css", ".data-table .data-table-figure"],
  ];

  it("right-aligns numeric table columns at a specificity that actually wins", () => {
    for (const [file, selector] of NUMERIC) {
      const rule = findRule(file, selector);
      assert.ok(rule, `${file} must style ${selector}`);
      assert.equal(
        declaration(rule, "text-align").value.trim(),
        "end",
        `${selector} must beat the base "text-align: start" on .data-table th/td`,
      );
    }
  });

  it("reserves a stable width for comparable columns", () => {
    const figure = findRule("public/styles/components/tables.css", ".data-table .data-table-figure");
    const rank = findRule("public/styles/components/tables.css", ".data-table .data-table-rank");

    assert.ok(declaration(figure, "min-width"), "the figure column must reserve its width");
    assert.ok(declaration(rank, "width"), "the rank column must reserve its width");
    assert.equal(declaration(figure, "white-space").value, "nowrap", "a figure and its unit stay together");
  });

  it("sets table and statistics text at or above the control floor", () => {
    const cells = findRule("public/styles/components/tables.css", ".data-table tbody td");
    const head = findRule("public/styles/components/tables.css", ".data-table thead th");

    assert.ok(pxOf(declaration(cells, "font-size").value) >= CONTROL_FLOOR_PX);
    assert.ok(pxOf(declaration(head, "font-size").value) >= CONTROL_FLOOR_PX);
  });

  it("backs the tabular-numeral declaration with a face that really has one advance", () => {
    const tables = read("public/styles/components/tables.css");
    if (!/font-variant-numeric:\s*tabular-nums/.test(tables)) return;

    const mono = faceOf("ibm-plex-mono/IBMPlexMono-Regular.woff2");
    assert.equal(mono.familyName, "IBM Plex Mono", "the data role must be the monospaced face");
    assert.equal(
      declaration(findRule("public/styles/components/tables.css", ".data-table"), "font-family").value,
      "var(--font-data)",
      "the declaration only means something on the mono role",
    );
  });
});

describe("webfont delivery gate", () => {
  it("ships every declared face as a real, same-origin WOFF2 file", () => {
    const blocks = allFontFaceBlocks();
    assert.equal(blocks.length, SHIPPED_FACES.length, "one @font-face per shipped file, and no more");

    for (const { file, block } of blocks) {
      assert.equal(file, "public/styles/variables.css", "every face is declared in one place");
      for (const [, url] of block.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
        assert.ok(url.startsWith("/fonts/"), `${file} must self-host from /fonts/, got ${url}`);
        assert.match(url, /\.woff2$/, `${url} must be WOFF2`);
        const onDisk = path.join(appRoot, "public", url.replace(/^\//, "").split("?")[0]);
        assert.ok(existsSync(onDisk), `${file} declares ${url}, which is not present in the repository`);
        assert.equal(readFileSync(onDisk).subarray(0, 4).toString("ascii"), "wOF2", `${url} is not a WOFF2 binary`);
      }
    }
  });

  it("matches every weight descriptor to the weight the binary really carries", () => {
    for (const face of SHIPPED_FACES) {
      const shipped = faceOf(face.file);
      const declared = new RegExp(
        `@font-face\\s*\\{[^}]*font-family:\\s*"${face.family}";[^}]*${face.file.split("/").pop().replace(/\./g, "\\.")}[^}]*font-weight:\\s*${face.weight};`,
        "s",
      );
      assert.match(read("public/styles/variables.css"), declared, `${face.file} must declare font-weight: ${face.weight}`);

      if (face.variable) {
        const axis = shipped.axes.find((a) => a.tag === "wght");
        assert.ok(axis, `${face.file} is declared as a range but carries no weight axis`);
        assert.equal(`${axis.min} ${axis.max}`, face.weight, "the declared range must be the axis the file has");
      } else {
        assert.equal(
          String(shipped.weightClass),
          face.weight,
          `${face.file} declares ${face.weight} but the binary is ${shipped.weightClass}`,
        );
        assert.equal(shipped.axes, null, `${face.file} is declared static; it must not be a variable file`);
      }
    }
  });

  it("covers both interface languages in every shipped face", () => {
    for (const face of SHIPPED_FACES) {
      const shipped = faceOf(face.file);
      assert.equal(shipped.coverage(LATIN), LATIN.length, `${face.file} is missing Latin letters`);
      assert.equal(shipped.coverage(CYRILLIC), CYRILLIC.length, `${face.file} is missing Cyrillic letters`);
      assert.equal(shipped.coverage(DIGITS), DIGITS.length, `${face.file} is missing digits`);
      assert.ok(
        shipped.coverage(PUNCTUATION) >= PUNCTUATION.length - 1,
        `${face.file} is missing punctuation the interface uses`,
      );
    }
  });

  it("names each shipped family as the family its stylesheet declares", () => {
    for (const face of SHIPPED_FACES) {
      const shipped = faceOf(face.file);
      // IBM abbreviates the family in the name table for the non-regular
      // weights ("IBM Plex Sans SmBld"), which is why this compares the root.
      const root = face.family.replace("IBM Plex Sans Condensed", "IBM Plex Sans Cond");
      assert.ok(
        shipped.familyName.startsWith(root),
        `${face.file} is named ${shipped.familyName}, not a ${face.family} face`,
      );
    }
  });

  it("uses font-display: swap on every declared face", () => {
    for (const { file, block } of allFontFaceBlocks()) {
      assert.match(block, /font-display:\s*swap/, `${file} must not block first paint`);
    }
  });

  it("requests no font from a third-party origin", () => {
    const hosts = /fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit|fontspace|cdnjs|jsdelivr|unpkg/i;

    for (const file of styleFiles()) {
      assert.doesNotMatch(readFileSync(file, "utf8"), hosts, `${relative(file)} loads a remote font`);
    }
    for (const file of allViews()) {
      assert.doesNotMatch(readFileSync(file, "utf8"), hosts, `${relative(file)} loads a remote font`);
    }
  });

  it("preloads the two faces the first screen is actually set in, and no others", () => {
    const expected = [
      "/fonts/ibm-plex-sans-condensed/IBMPlexSansCondensed-Regular.woff2",
      "/fonts/unbounded/Unbounded-Variable.woff2",
    ];

    for (const shell of [
      "src/views/components/layout/document.ejs",
      "src/views/components/layout/auth-document.ejs",
    ]) {
      const preloaded = [...read(shell).matchAll(/<link[^>]+href="([^"]+)"[^>]*as="font"/g)].map(([, href]) => href);
      assert.deepEqual(preloaded, expected, `${shell} must preload exactly the first-paint faces`);
      for (const href of preloaded) {
        assert.match(read(shell), new RegExp(`href="${href}"[^>]*type="font/woff2"`), `${href} must declare its type`);
        assert.match(read(shell), new RegExp(`href="${href}"[^>]*crossorigin`), `${href} must be preloaded anonymously`);
      }
    }
  });

  it("preloads nothing that is not a file the repository ships and declares", () => {
    const declared = new Set(
      allFontFaceBlocks().flatMap(({ block }) =>
        [...block.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map(([, url]) => url),
      ),
    );

    for (const file of allViews()) {
      for (const [, href] of readFileSync(file, "utf8").matchAll(/<link[^>]+href="([^"]+)"[^>]*as="font"/g)) {
        assert.ok(existsSync(path.join(appRoot, "public", href.replace(/^\//, ""))), `${href} does not exist`);
        assert.ok(declared.has(href), `${relative(file)} preloads ${href}, which no @font-face declares`);
      }
    }
  });

  it("leaves no font in the served path that nothing declares", () => {
    const declared = new Set(
      allFontFaceBlocks().flatMap(({ block }) =>
        [...block.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map(([, url]) =>
          url.replace(/^\/fonts\//, "").split("?")[0],
        ),
      ),
    );

    const shipped = [];
    const walk = (dir, prefix) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, `${prefix}${entry.name}/`);
        else if (/\.(woff2?|otf|ttf|eot)$/i.test(entry.name)) shipped.push(`${prefix}${entry.name}`);
      }
    };
    walk(fontsDir, "");

    assert.deepEqual(
      shipped.sort(),
      [...declared].sort(),
      "every font binary in the served path must be one the stylesheet declares",
    );
  });

  it("keeps the whole type payload inside a budget a page opening can afford", () => {
    const total = SHIPPED_FACES.reduce(
      (sum, face) => sum + statSync(path.join(fontsDir, face.file)).size,
      0,
    );

    assert.ok(total <= 420 * 1024, `the shipped faces total ${Math.round(total / 1024)}KB`);
    assert.ok(
      statSync(path.join(fontsDir, "unbounded/Unbounded-Variable.woff2")).size <= 120 * 1024,
      "the display face is used sparingly and must not be the heaviest request on the page",
    );
  });

  it("retains the licence and provenance beside every family", () => {
    for (const directory of ["unbounded", "ibm-plex-sans", "ibm-plex-sans-condensed", "ibm-plex-mono"]) {
      const licence = readdirSync(path.join(fontsDir, directory)).find((name) => /^(OFL|LICENSE)/i.test(name));
      assert.ok(licence, `${directory} must keep its licence file`);
      assert.match(
        readFileSync(path.join(fontsDir, directory, licence), "utf8"),
        /SIL OPEN FONT LICENSE/i,
        `${directory}/${licence} must be the real OFL text`,
      );
    }

    const readme = read("public/fonts/README.md");
    assert.match(readme, /SIL Open Font License/i);
    for (const face of SHIPPED_FACES) {
      assert.ok(readme.includes(face.file), `README must record provenance for ${face.file}`);
    }
    assert.match(readme, /vendor-sacred-press-fonts\.py/, "the reproducible build command must be recorded");
    assert.doesNotMatch(readme, /receipt|order\s*#|serial|licen[cs]e\s*key/i);
  });

  it("records the SHA-256 of every vendored binary, so provenance is checkable", () => {
    const readme = read("public/fonts/README.md");

    for (const face of SHIPPED_FACES) {
      const digest = createHash("sha256").update(readFileSync(path.join(fontsDir, face.file))).digest("hex");
      assert.ok(
        readme.includes(digest),
        `README must record the SHA-256 of ${face.file} (${digest})`,
      );
    }
  });
});
