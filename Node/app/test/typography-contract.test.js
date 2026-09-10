import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { allRules, parseRules, relative, smallestPx, styleFiles } from "./helpers/cssRules.js";
import { readFont } from "./helpers/otf.js";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const fontsDir = path.join(appRoot, "public", "fonts");
const read = (relativePath) => readFileSync(path.join(appRoot, relativePath), "utf8");

/**
 * The product is set in one visible family: Achimari Hand. It ships a single
 * 400-weight face, so hierarchy has to come from size, space, colour, casing and
 * grouping — never from a weight or a slant the face cannot draw, and never from
 * a second family standing in as a "readable" companion.
 *
 * A handwritten face also needs more room than a grotesque, which is why the
 * floors below sit a step above conventional UI minimums.
 */
const TEXT_FLOOR_PX = 16;
const CONTROL_FLOOR_PX = 18;
// Critical HUD readings and statistics sit one step under the control floor.
const DATA_FLOOR_PX = 17;

const BRAND_FAMILY = /var\(--font-(?:brand|display|ui|body|reading|data)\)|"Achimari Hand"/;
const FONT_ROLES = ["--font-display", "--font-ui", "--font-body", "--font-reading", "--font-data"];

/** Families that would be a second visible typeface if any role selected one. */
const FOREIGN_FAMILY =
  /-apple-system|BlinkMacSystemFont|"?SF Pro|"?Segoe UI|Helvetica|Arial|Roboto|Inter\b|Manrope|Atkinson|system-ui|sans-serif|serif(?!\s*$)|monospace/i;

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
/** The shipped face, parsed once from the binary that actually ships. */
const readFontTables = () =>
  readFont(path.join(fontsDir, "achimari-hand", "AchimariHand-Regular.otf"));

const findRule = (file, selector) =>
  parseRules(read(file), file).find((rule) => rule.selector.split(",").some((part) => part.trim() === selector));

describe("one visible family", () => {
  it("names Achimari Hand once, at --font-brand", () => {
    const variables = read("public/styles/variables.css");

    assert.match(variables, /--font-brand:\s*"Achimari Hand",\s*cursive/);
  });

  it("resolves every type role to that same family", () => {
    const variables = read("public/styles/variables.css");

    for (const role of FONT_ROLES) {
      assert.match(
        variables,
        new RegExp(`${role}:\\s*var\\(--font-brand\\)`),
        `${role} must follow --font-brand; the product shows one typeface`,
      );
      assert.match(
        resolve(`var(${role})`, tokens),
        /"Achimari Hand"/,
        `${role} must resolve to Achimari Hand`,
      );
    }
  });

  it("keeps only a generic fallback behind it, never a companion stack", () => {
    const brand = resolve("var(--font-brand)", tokens);
    const behind = brand.split(",").slice(1).join(",");

    assert.match(behind, /cursive/, "a generic family must remain for a failed load or a missing glyph");
    assert.doesNotMatch(
      behind,
      /-apple-system|Segoe UI|Helvetica|Arial|system-ui/i,
      "a real system stack behind the hand becomes a second visible font",
    );
  });

  it("retires --font-system as a selectable role", () => {
    assert.doesNotMatch(
      read("public/styles/variables.css"),
      /--font-system:/,
      "the system stack is no longer a typography role",
    );

    const offenders = [];
    for (const rule of allRules()) {
      const family = declaration(rule, "font-family");
      if (family && /var\(--font-system\)/.test(family.value)) {
        offenders.push(`${rule.file}:${rule.line} ${rule.selector}`);
      }
    }
    assert.deepEqual(offenders, []);
  });

  it("lets no selector choose a second visible typeface", () => {
    const offenders = [];

    for (const rule of allRules()) {
      if (rule.selector.startsWith("@")) continue;
      const family = declaration(rule, "font-family");
      if (!family) continue;
      const value = family.value.trim();
      if (/^(inherit|initial|unset|revert)$/.test(value)) continue;
      if (!BRAND_FAMILY.test(value)) {
        offenders.push(`${rule.file}:${rule.line} ${rule.selector} — ${value}`);
      }
      // A role token may resolve through --font-brand, but a literal stack may not.
      if (FOREIGN_FAMILY.test(value)) {
        offenders.push(`${rule.file}:${rule.line} ${rule.selector} names a foreign family — ${value}`);
      }
    }

    assert.deepEqual(offenders, [], "every component draws from the one family");
  });

  it("sets the document itself in the Achimari-backed UI role", () => {
    const body = parseRules(read("public/styles/globals.css")).find((rule) => rule.selector.trim() === "body");

    assert.ok(body, "globals.css must still style body");
    assert.equal(declaration(body, "font-family").value, "var(--font-ui)");
    assert.match(resolve("var(--font-ui)", tokens), /"Achimari Hand"/);
  });

  it("sets the active battle interface in the same UI role", () => {
    const arena = parseRules(read("public/styles/globals.css")).find(
      (rule) => rule.selector.trim() === ".battle-active",
    );

    assert.ok(arena, "the arena must still scope its own type");
    assert.equal(declaration(arena, "font-family").value, "var(--font-ui)");

    // The arena must not reintroduce a second family through a scoped override.
    for (const decl of arena.declarations) {
      if (!decl.property.startsWith("--font")) continue;
      assert.doesNotMatch(decl.value, FOREIGN_FAMILY, `${decl.property} reintroduces a foreign family in the arena`);
    }
  });
});

describe("one real weight", () => {
  it("publishes a single weight token, set to 400", () => {
    const variables = read("public/styles/variables.css");

    assert.match(variables, /--weight-body:\s*400/);
    for (const retired of ["--weight-medium", "--weight-semibold", "--weight-strong"]) {
      assert.doesNotMatch(
        variables,
        new RegExp(`${retired}:`),
        `${retired} promises a weight the face does not ship`,
      );
    }
  });

  it("requests no weight above 400 anywhere", () => {
    const offenders = [];

    for (const rule of allRules()) {
      for (const decl of rule.declarations) {
        if (decl.property !== "font-weight") continue;
        const resolved = resolve(decl.value, tokens).trim();
        // `inherit` cannot introduce a heavier weight: nothing in the product
        // sets one, and this same loop is what guarantees that.
        if (/^(400|normal|inherit|initial|unset|revert)$/.test(resolved)) continue;
        offenders.push(`${rule.file}:${rule.line} ${rule.selector.replace(/\s+/g, " ")} — ${decl.value}`);
      }
    }

    assert.deepEqual(offenders, [], "Achimari Hand ships Regular only; a heavier request is a synthesised guess");
  });

  it("disables synthetic bold and italic globally", () => {
    const body = parseRules(read("public/styles/globals.css")).find((rule) => rule.selector.trim() === "body");

    assert.equal(
      declaration(body, "font-synthesis").value.trim(),
      "none",
      "one face means the browser must never invent a second",
    );
  });

  it("leaves text rasterisation to the platform", () => {
    // `-webkit-font-smoothing: antialiased` switches macOS from subpixel to
    // grayscale rendering, which thins every stroke — the one thing a monoline
    // handwritten face cannot spare. Stroke weight is solved in the outline.
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
    // ~600ms. Its halo lifts a coloured number off a photograph; it is transient
    // combat feedback, not weight simulation, and the same value is stated
    // durably in the health meter and the battle log.
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

    assert.deepEqual(offenders, [], "a thickened outline is not a weight; use size, colour and space");
  });
});

describe("the readable floor", () => {
  it(`declares no font-size below ${TEXT_FLOOR_PX}px anywhere in the styles`, () => {
    const offenders = [];

    for (const rule of allRules()) {
      for (const decl of rule.declarations) {
        if (decl.property !== "font-size") continue;
        const px = pxOf(decl.value);
        if (px !== null && px < TEXT_FLOOR_PX) {
          offenders.push(`${rule.file}:${rule.line} ${rule.selector.replace(/\s+/g, " ")} — ${px}px (${decl.value})`);
        }
      }
    }

    assert.deepEqual(offenders, [], "a handwritten face stops resolving before a grotesque does");
  });

  it("audits real declarations, not only the token definitions", () => {
    // Guards the test above: a literal size written straight into a component
    // must be caught, so the floor cannot be dodged by skipping the token scale.
    const probe = parseRules(".probe { font-size: 0.75rem; }", "probe.css");

    assert.equal(probe.length, 1);
    assert.equal(pxOf(probe[0].declarations[0].value), 12);

    const literals = allRules().flatMap((rule) =>
      rule.declarations.filter((d) => d.property === "font-size" && /\d/.test(d.value) && !d.value.includes("var(")),
    );
    assert.ok(literals.length > 0, "the audit must be exercising literal sizes, not just var() lookups");
  });

  it("holds the whole token scale at or above the floor", () => {
    for (const [name, value] of Object.entries(tokens)) {
      if (!/^--text-/.test(name)) continue;
      const px = pxOf(value);
      if (px === null) continue;
      assert.ok(px >= TEXT_FLOOR_PX, `${name} resolves to ${px}px, below the ${TEXT_FLOOR_PX}px floor`);
    }
  });

  it("sets long-form copy at 20px with generous leading", () => {
    const body = pxOf("var(--text-body)");
    assert.equal(body, 20, `--text-body must be 20px, got ${body}px`);

    const leading = Number(resolve("var(--leading-body)", tokens));
    assert.ok(leading >= 1.6 && leading <= 1.7, `--leading-body must sit at 1.6–1.7, got ${leading}`);
  });

  it("keeps the scale's steps in their intended bands", () => {
    assert.equal(pxOf("var(--text-control)"), 18, "ordinary copy, inputs and controls sit at 18px");
    assert.equal(pxOf("var(--text-label)"), 17, "labels and critical data sit at 17px");
    assert.equal(pxOf("var(--text-micro)"), 16, "secondary text bottoms out at 16px");
    assert.ok(pxOf("var(--text-component)") >= 20 && pxOf("var(--text-component)") <= 24,
      "a component title sits at 20–24px");
  });

  it(`keeps navigation, inputs and primary controls at ${CONTROL_FLOOR_PX}px or more`, () => {
    const controls = [
      ["public/styles/header/base.css", ".header-link"],
      ["public/styles/components/buttons.css", ".ui-button"],
      ["public/styles/components/fields.css", ".field-input"],
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

  it(`keeps form labels at ${DATA_FLOOR_PX}px or more`, () => {
    // A label is not a control: it sits one step down, but never below the
    // data floor, because it is what tells the reader what the control is for.
    for (const selector of [".field-label", ".field-hint"]) {
      const rule = findRule("public/styles/components/fields.css", selector);
      assert.ok(rule, `fields.css must still style ${selector}`);
      const size = pxOf(declaration(rule, "font-size").value);
      assert.ok(size >= DATA_FLOOR_PX, `${selector} is ${size}px`);
    }
  });

  it(`keeps every reading in an active fight at ${DATA_FLOOR_PX}px or more`, () => {
    const offenders = [];

    for (const file of ["public/styles/game/battle-arena.css", "public/styles/game/battle.css"]) {
      for (const rule of parseRules(read(file), file)) {
        for (const decl of rule.declarations) {
          if (decl.property !== "font-size") continue;
          const px = pxOf(decl.value);
          if (px !== null && px < DATA_FLOOR_PX) {
            offenders.push(`${rule.file}:${rule.line} ${rule.selector.replace(/\s+/g, " ")} — ${px}px`);
          }
        }
      }
    }

    assert.deepEqual(offenders, [], "HUD text drives the next move and must be legible at a glance");
  });

  it("caps long-form prose at a real 60–68 character measure", () => {
    // Not expressed in `ch`: the CSS `ch` unit is the advance of "0", and this
    // face's zero is far wider than its lowercase, so a `68ch` cap let prose run
    // to ~91 measured characters per line. The token is calibrated instead.
    const variables = read("public/styles/variables.css");
    const prose = pxOf("var(--measure-prose)");

    assert.ok(prose, "--measure-prose must exist");
    assert.ok(prose >= 480 && prose <= 580, `--measure-prose is ${prose}px, outside the calibrated band`);
    assert.match(variables, /--measure-reading:\s*680px/, "the wider form/reading container is unchanged");

    const lede = findRule("public/styles/shell.css", ".page-head-lede");
    assert.equal(declaration(lede, "max-width").value, "var(--measure-prose)");

    const helpProse = findRule("public/styles/game/help.css", ".help-section p");
    assert.equal(declaration(helpProse, "max-width").value, "var(--measure-prose)");
    assert.equal(pxOf(declaration(helpProse, "font-size").value), 20, "long-form prose is set at 20px");
  });
});

describe("casing and tracking", () => {
  it("forces no heading to uppercase from the global sheet", () => {
    assert.doesNotMatch(
      read("public/styles/globals.css"),
      /:where\([^)]*h2[^)]*\)\s*\{[^}]*text-transform:\s*uppercase/s,
      "all-caps costs a handwritten face its word shapes",
    );
  });

  it("limits uppercase to short, large, explicitly approved actions", () => {
    // Yes/No are written uppercase in the markup, which is the approved case.
    // No stylesheet may impose caps on labels, headings, metadata or HUD text.
    const APPROVED = new Set([".dashboard-action-label"]);
    const offenders = [];

    for (const rule of allRules()) {
      const transform = declaration(rule, "text-transform");
      if (!transform || !/uppercase/i.test(transform.value)) continue;
      const selectors = rule.selector.split(",").map((part) => part.trim());
      if (selectors.every((part) => APPROVED.has(part))) continue;
      offenders.push(`${rule.file}:${rule.line} ${rule.selector.replace(/\s+/g, " ")}`);
    }

    assert.deepEqual(offenders, []);
  });

  it("writes the Today heading in sentence case", () => {
    const title = findRule("public/styles/pages/daily-check-in.css", ".today-title");

    assert.ok(title, ".today-title must still be styled");
    assert.equal(declaration(title, "text-transform").value.trim(), "none");
    assert.match(
      read("src/views/pages/partials/home-content.ejs"),
      /class="page-head-title today-title">Today</,
      "the visible title reads Today, not TODAY",
    );
  });

  it("pairs the Today heading and its date as one dateline", () => {
    const css = read("public/styles/pages/daily-check-in.css");
    const dateline = findRule("public/styles/pages/daily-check-in.css", ".today-dateline");
    const date = findRule("public/styles/pages/daily-check-in.css", ".today-date");

    assert.equal(declaration(dateline, "align-items").value, "baseline", "the two sit on one baseline");
    assert.equal(declaration(dateline, "flex-wrap").value, "wrap", "the date wraps below on narrow screens");

    // Same family, same weight: they must read as one piece of typography.
    assert.equal(declaration(date, "font-family").value, "var(--font-ui)");
    assert.equal(declaration(date, "font-weight").value, "var(--weight-body)");
    assert.ok(pxOf(declaration(date, "font-size").value) >= CONTROL_FLOOR_PX);
    assert.match(css, /--font-display/, "the title keeps the display role");
  });

  it("keeps the Today heading a contextual heading, not a branding statement", () => {
    const title = findRule("public/styles/pages/daily-check-in.css", ".today-title");
    const date = findRule("public/styles/pages/daily-check-in.css", ".today-date");

    const size = pxOf(declaration(title, "font-size").value);
    assert.ok(size >= 26 && size <= 30, `.today-title must sit near 28px, got ${size}px`);
    assert.ok(
      Number(declaration(title, "line-height").value) <= 1.2,
      "a contextual heading keeps a compact line height",
    );
    // The daily practices are the primary content: the heading must not tower
    // over its own date.
    const dateSize = pxOf(declaration(date, "font-size").value);
    assert.ok(dateSize >= 18, `.today-date must be at least 18px, got ${dateSize}px`);
    assert.ok(size / dateSize <= 1.8, "the heading and its date must read as one dateline");
  });

  it("sets no negative tracking, and keeps small-label tracking restrained", () => {
    const offenders = [];

    for (const rule of allRules()) {
      for (const decl of rule.declarations) {
        if (decl.property !== "letter-spacing") continue;
        const value = decl.value.trim();
        const em = value.match(/^(-?[\d.]+)em$/);
        if (value.startsWith("-")) {
          offenders.push(`${rule.file}:${rule.line} ${rule.selector} — ${value} collides the strokes`);
        } else if (em && Number(em[1]) > 0.04) {
          offenders.push(`${rule.file}:${rule.line} ${rule.selector} — ${value} exceeds 0.04em`);
        }
      }
    }

    assert.deepEqual(offenders, []);
  });

  it("keeps body copy at zero tracking", () => {
    const body = parseRules(read("public/styles/globals.css")).find((rule) => rule.selector.trim() === "body");

    assert.equal(declaration(body, "letter-spacing").value.trim(), "0");
  });
});

describe("numbers read by alignment, not by a second font", () => {
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

  it(`sets table and statistics text at ${DATA_FLOOR_PX}px or more`, () => {
    const cells = findRule("public/styles/components/tables.css", ".data-table tbody td");
    const head = findRule("public/styles/components/tables.css", ".data-table thead th");

    assert.ok(pxOf(declaration(cells, "font-size").value) >= DATA_FLOOR_PX);
    assert.ok(pxOf(declaration(head, "font-size").value) >= DATA_FLOOR_PX);
  });

  it("keeps numeric surfaces in the one family", () => {
    const table = findRule("public/styles/components/tables.css", ".data-table");

    assert.match(resolve(declaration(table, "font-family").value, tokens), /"Achimari Hand"/);
  });

  it("claims no tabular-numeral support the face does not have", () => {
    // Achimari Hand ships no `tnum` feature and draws proportional digits.
    // The declaration may stay as harmless progressive enhancement, but no
    // suite may assert that it is what aligns the columns. The pattern is built
    // from parts so this guard does not match its own source.
    const feature = ["tabular", "nums"].join("-");
    const claim = new RegExp(`assert\\.(?:match|equal|ok)\\([^\\n]*${feature}`);

    for (const suite of ["typography-contract", "design-foundations", "copy-quality-contract"]) {
      assert.doesNotMatch(
        read(`test/${suite}.test.js`),
        claim,
        `${suite} must not require tabular figures from a face that has none`,
      );
    }

    const tables = read("public/styles/components/tables.css");
    if (/font-variant-numeric:\s*tabular-nums/.test(tables)) {
      assert.match(
        tables,
        /proportional digits|no `tnum`|progressive enhancement/i,
        "if the declaration stays, the sheet must record that it is not load-bearing",
      );
    }
  });
});

describe("contrast and surfaces", () => {
  it("keeps the quiet ink off text", () => {
    const offenders = [];

    for (const rule of allRules()) {
      for (const decl of rule.declarations) {
        if (decl.property !== "color") continue;
        if (/var\(--ink-quiet\)/.test(decl.value)) {
          offenders.push(`${rule.file}:${rule.line} ${rule.selector} — ${decl.value}`);
        }
      }
    }

    assert.deepEqual(offenders, [], "--ink-quiet is 3.5:1 on white; it is a rule colour, not a text colour");
  });

  it("keeps the accessible secondary ink", () => {
    const variables = read("public/styles/variables.css");

    assert.match(variables, /--ink-secondary-strong:\s*#4f4f4a/i);
    assert.match(variables, /--ink-muted:\s*#5c5c58/i);
  });

  it("writes the text that floats on the horizon in full ink", () => {
    // Measured against the real composite (poster, grayscale/contrast/brightness
    // filter, 62% white scrim, 10% vignette): the darkest backdrop under the page
    // head is rgb(158,158,158). There --ink-muted is 2.5:1 and the darker
    // secondary 3.1:1; only full ink clears the target, at 7.05:1.
    const shell = parseRules(read("public/styles/shell.css"), "shell.css");

    for (const selector of [".page-head-eyebrow", ".page-head-lede"]) {
      const rule = shell.find((candidate) => candidate.selector.trim() === selector);
      assert.ok(rule, `${selector} must still be styled`);
      assert.equal(declaration(rule, "color").value, "var(--ink-on-sky)");
    }

    assert.match(read("public/styles/variables.css"), /--ink-on-sky:\s*var\(--ink\)/);

    const date = findRule("public/styles/pages/daily-check-in.css", ".today-date");
    assert.equal(declaration(date, "color").value, "var(--ink-on-sky)");
  });

  it("keeps shared statistics off the bare sky", () => {
    const strip = findRule("public/styles/components/lists.css", ".stat-line");
    assert.match(declaration(strip, "background").value, /var\(--paper\)|var\(--surface\)|#fff/i);
  });
});

describe("webfont delivery gate", () => {
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

  it("self-hosts the generated Achimari Hand CFF/OpenType face", () => {
    const variables = read("public/styles/variables.css");
    const fontPath = path.join(fontsDir, "achimari-hand", "AchimariHand-Regular.otf");

    assert.match(
      variables,
      /@font-face\s*\{[^}]*font-family:\s*"Achimari Hand";[^}]*src:\s*url\("\/fonts\/achimari-hand\/AchimariHand-Regular\.otf"\)\s*format\("opentype"\);[^}]*font-weight:\s*400;[^}]*font-style:\s*normal;[^}]*font-display:\s*swap;[^}]*\}/s,
    );
    assert.ok(existsSync(fontPath));
    assert.equal(readFileSync(fontPath).subarray(0, 4).toString("ascii"), "OTTO");
    assert.doesNotMatch(variables, /font-family:\s*"(?:Kitaro Road|Sagfield)"/);
  });

  it("ships the screen-optimised revision, with real vertical metrics", () => {
    // Req 14. The first build left OS/2 sxHeight and sCapHeight at zero and
    // shipped no CFF Private hints at all; a rasteriser had nothing to snap to.
    const font = readFontTables();

    assert.equal(font.version, "2.000", "the revision must carry its own version");
    assert.ok(font.xHeight > 0, "OS/2 sxHeight must be measured, not zero");
    assert.ok(font.capHeight > font.xHeight, "OS/2 sCapHeight must be measured and above the x-height");
    assert.ok(font.winAscent > 0 && font.winDescent > 0, "Windows ascent/descent must be set");
    assert.ok(font.typoAscender > 0 && font.typoDescender < 0, "typographic ascent/descent must be set");
    assert.equal(font.weightClass, 400, "one regular face");
    assert.equal(font.widthClass, 5, "the face is built at normal width, not condensed");
    assert.equal(font.familyName, "Achimari Hand", "the family identity never changes");
  });

  it("carries the CFF alignment zones and stem widths a rasteriser needs", () => {
    // v1.000 shipped none of this: no BlueValues, no StdHW/StdVW, no stem snap.
    // These Private values are what a CFF rasteriser reads to snap the baseline,
    // x-height and cap-height at small ppem.
    const font = readFontTables();

    assert.ok(Array.isArray(font.blueValues) && font.blueValues.length >= 8,
      "the face must declare baseline, x-height, cap-height and ascender zones");
    assert.ok(font.stdHW > 0 && font.stdVW > 0, "standard stem widths must be present");
    assert.ok(font.stemSnapH.length > 0 && font.stemSnapV.length > 0, "stem snap lists must be present");

    // The zones must actually match the measured face, not be boilerplate.
    assert.ok(font.blueValues.includes(font.xHeight), "an alignment zone must sit on the real x-height");
    assert.ok(font.blueValues.includes(font.capHeight), "an alignment zone must sit on the real cap-height");
  });

  it("keeps per-glyph autohinting available as an explicit, pinned stage", () => {
    // Honest state: the shipped face carries Private-dict hinting but no
    // per-glyph charstring hints. otfautohint's path analysis is pathologically
    // slow on the dilated outlines (candidate A, undilated, hints in ~13
    // minutes; the shipped outlines did not finish five glyphs in ten), so the
    // stage is opt-in behind `--autohint` pending an overlap-removal pass.
    // This test pins that decision so it is revisited deliberately.
    const script = read("scripts/build-achimari-font.py");

    assert.match(script, /--autohint/, "the autohint stage must remain available");
    assert.match(script, /afdko\.otfautohint/, "invoked as a module, not a global binary");
    assert.match(script, /pathologically slow/, "the reason it is opt-in must stay recorded in the build");
    assert.match(read("public/fonts/achimari-hand/SOURCE.md"), /autohint/i,
      "SOURCE.md must document the autohinting position");
  });

  it("keeps the build reproducible and pinned", () => {
    // Req 13. The build must be runnable from documented, pinned dependencies,
    // and must not reach for a globally installed binary.
    const requirements = read("scripts/font-requirements.txt");
    const script = read("scripts/build-achimari-font.py");

    assert.match(requirements, /fonttools==\d+\.\d+/, "fontTools must be pinned to an exact version");
    assert.match(requirements, /afdko==\d+\.\d+/, "the autohinter must be pinned to an exact version");
    assert.match(script, /afdko\.otfautohint/, "the autohinter is invoked as a module, not a global binary");
    assert.match(script, /sys\.executable/, "the autohinter runs under the same pinned interpreter");
    assert.match(script, /BUILD_TIMESTAMP/,
      "head.created/modified must be pinned, or two builds of one source differ byte-for-byte");
    assert.match(read("public/fonts/achimari-hand/SOURCE.md"), /font-requirements\.txt/,
      "SOURCE.md must document the reproducible build command");
  });

  it("declares exactly one face, so no unshipped weight can be requested", () => {
    assert.equal(allFontFaceBlocks().length, 1, "Achimari Hand is a one-weight family");
  });

  it("installs no second typeface", () => {
    for (const file of styleFiles()) {
      assert.doesNotMatch(
        readFileSync(file, "utf8"),
        /Atkinson\s*Hyperlegible/i,
        `${relative(file)} installs a font this product does not license or ship`,
      );
    }
    assert.ok(!existsSync(path.join(fontsDir, "atkinson-hyperlegible")));

    const families = new Set(
      allFontFaceBlocks().map(({ block }) => (block.match(/font-family:\s*["']([^"']+)["']/) || [])[1]),
    );
    assert.deepEqual([...families], ["Achimari Hand"]);
  });

  it("ships no @font-face that points at a file the repository does not have", () => {
    for (const { file, block } of allFontFaceBlocks()) {
      for (const [, url] of block.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
        assert.ok(url.startsWith("/fonts/"), `${file} must self-host from /fonts/, got ${url}`);
        assert.ok(
          existsSync(path.join(appRoot, "public", url.replace(/^\//, "").split("?")[0])),
          `${file} declares ${url}, which is not present in the repository`,
        );
      }
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

  it("preloads only a face that actually exists", () => {
    for (const file of allViews()) {
      const markup = readFileSync(file, "utf8");
      for (const [, href] of markup.matchAll(/<link[^>]+as="font"[^>]*href="([^"]+)"/g)) {
        assert.ok(
          existsSync(path.join(appRoot, "public", href.replace(/^\//, ""))),
          `${relative(file)} preloads ${href}, which does not exist`,
        );
      }
    }
  });

  it("preloads Achimari Hand in both document shells", () => {
    const preload = /<link\s+rel="preload"\s+href="\/fonts\/achimari-hand\/AchimariHand-Regular\.otf"\s+as="font"\s+type="font\/otf"\s+crossorigin\s*\/>/;

    assert.match(read("src/views/components/layout/document.ejs"), preload);
    assert.match(read("src/views/components/layout/auth-document.ejs"), preload);
  });

  it("records provenance beside the font directory", () => {
    const readmePath = path.join(fontsDir, "README.md");
    assert.ok(existsSync(readmePath), "public/fonts must carry a provenance note");

    const readme = readFileSync(readmePath, "utf8");
    assert.match(readme, /Achimari Hand/);
    assert.match(readme, /supplied specimen/i);
    assert.match(readme, /SIL Open Font License/i, "the derivative's licence must be recorded");

    assert.doesNotMatch(readme, /receipt|order\s*#|serial|licen[cs]e\s*key/i);
  });

  it("keeps the generated-file state of the branded family honest", () => {
    const readme = readFileSync(path.join(fontsDir, "README.md"), "utf8");
    const declared = allFontFaceBlocks()
      .map(({ block }) => (block.match(/font-family:\s*["']([^"']+)["']/) || [])[1])
      .filter(Boolean);

    const family = "Achimari Hand";
    const supplied = declared.includes(family);
    const dir = path.join(fontsDir, "achimari-hand");
    assert.equal(supplied, existsSync(dir) && readdirSync(dir).includes("AchimariHand-Regular.otf"));
    assert.match(readme, /Achimari Hand[\s\S]{0,400}?Generated/i);
  });
});
