import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const readRaw = (relative) => readFileSync(path.join(appRoot, relative), "utf8");
/** Comments are stripped, so a rule scan never reads a preceding comment as part of the selector. */
const read = (relative) => readRaw(relative).replace(/\/\*[\s\S]*?\*\//g, "");

function allSourceStyles() {
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

function allViews() {
  const files = [];
  const pending = [path.join(appRoot, "src", "views")];
  while (pending.length) {
    const dir = pending.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) pending.push(full);
      else if (entry.name.endsWith(".ejs")) files.push(path.relative(appRoot, full));
    }
  }
  return files.sort();
}

function luminance(hex) {
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Composites `rgb(r g b / a%)` over an opaque hex background. */
function over(alphaColor, backgroundHex) {
  const parsed = alphaColor.match(/rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+)%\s*\)/);
  assert.ok(parsed, `${alphaColor} is not an rgb(r g b / a%) value`);
  const [, r, g, b, a] = parsed;
  const alpha = Number(a) / 100;
  const mixed = [r, g, b].map((channel, index) => {
    const base = parseInt(backgroundHex.slice(1 + index * 2, 3 + index * 2), 16);
    return Math.round(alpha * Number(channel) + (1 - alpha) * base);
  });
  return `#${mixed.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

const token = (name) => {
  const match = read("public/styles/variables.css").match(new RegExp(`${name}:\\s*([^;]+);`));
  return match ? match[1].trim() : null;
};

/**
 * The grounds text is actually set on.
 *
 * There are two, not three. `--paper-raised` is an alias of `--paper` now, and
 * the system no longer separates regions by elevation — it separates them with
 * space and rules — so the old "three distinct paper luminances" contract is
 * superseded rather than weakened: a raised surface is held to *being* the
 * page, which is a stricter statement than being merely lighter than it.
 */
const PAPERS = ["--paper", "--paper-muted"];

/** Every channel of a hex colour. */
const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/**
 * Achimari Monochrome Press (CONSTRAINTS.md, 2026-09-12).
 *
 * The mineral-beige ground, the warm graphite ink and the single vermilion
 * accent are superseded. The sheet is white, the ink is black, and everything
 * between them is a neutral grey. Every assertion below is computed from the
 * shipped token values rather than trusting a comment, and the state-
 * distinction guards that replace the old hue assertions live in
 * `test/monochrome-states.test.js`.
 */
describe("Achimari neutral surfaces and semantic accents", () => {
  it("defines paper, ink, rule and accent as the structural roles", () => {
    assert.equal(token("--paper"), "#ffffff");
    assert.equal(token("--paper-raised"), "var(--paper)");
    assert.equal(token("--paper-muted"), "#f2f2f2");
    assert.equal(token("--field"), "#000000");
    assert.equal(token("--field-raised"), "#1a1a1a");
    assert.equal(token("--ink"), "#000000");
    assert.equal(token("--ink-raised"), "#1a1a1a");
    assert.equal(token("--ink-secondary-strong"), "#333333");
    assert.equal(token("--ink-muted"), "#525252");
    assert.equal(token("--ink-quiet"), "#8a8a8a");
    assert.equal(token("--rule"), "rgb(0 0 0 / 18%)");
    assert.equal(token("--rule-strong"), "#767676");

    assert.equal(token("--accent"), "var(--ink)");
    assert.equal(token("--accent-hover"), "var(--ink-raised)");
  });

  it("makes every structural colour a true neutral, with no channel drift at all", () => {
    const named = [
      "--paper", "--paper-muted", "--field", "--field-raised", "--ink", "--ink-raised",
      "--ink-secondary-strong", "--ink-muted", "--ink-quiet", "--rule-strong",
      "--white",
    ];
    for (const name of named) {
      const value = token(name);
      assert.match(value, /^#[0-9a-f]{6}$/, `${name} is ${value}; expected a literal hex`);
      const [r, g, b] = channels(value);
      assert.ok(
        r === g && g === b,
        `${name} is ${value}: the press has one ink and every token must be a true neutral`,
      );
    }
  });

  it("makes paper white and the field black, with one recessed step between them", () => {
    assert.equal(channels(token("--paper"))[0], 0xff, "the sheet is white, not an off-white");
    assert.equal(channels(token("--field"))[0], 0x00, "the field is black, not a dark grey");

    // The one tonal fill: deep enough to be seen as a region on white, shallow
    // enough that it never reads as a second paper.
    assert.ok(luminance(token("--paper-muted")) < luminance(token("--paper")), "the recessed step sits into the sheet");
    assert.ok(
      contrast(token("--paper"), token("--paper-muted")) >= 1.05,
      "the recessed step must be visible as a region without needing a border too",
    );
    assert.ok(
      contrast(token("--paper"), token("--paper-muted")) < 1.4,
      "and it must still read as the same sheet, pressed",
    );

    // A raised surface is the page. Separation is space and rules, not lift.
    assert.equal(token("--paper-raised"), "var(--paper)", "nothing is elevated above white");
    assert.equal(token("--shadow-float"), "none", "and nothing floats off the sheet to fake it");
  });

  it("holds every ink role above its WCAG 2.2 AA floor on every paper step", () => {
    for (const paper of PAPERS) {
      const background = token(paper);
      for (const ink of ["--ink", "--ink-muted", "--ink-secondary-strong"]) {
        const ratio = contrast(token(ink), background);
        assert.ok(ratio >= 4.5, `${ink} on ${paper} is ${ratio.toFixed(2)}:1, under the 4.5:1 text floor`);
      }
      for (const semantic of ["--success", "--danger"]) {
        const ratio = contrast(token(semantic), background);
        assert.ok(ratio >= 4.4, `${semantic} on ${paper} is ${ratio.toFixed(2)}:1`);
      }
    }
  });

  it("holds every structural rule above the 3:1 component floor where it bounds a control", () => {
    for (const paper of PAPERS) {
      // --rule-strong is a solid colour now rather than a translucent ink: over
      // the recessed step a 62% black would have dropped under the floor, and
      // an essential control boundary may not depend on which ground it lands
      // on. Both grounds are measured here, not assumed.
      const ratio = contrast(token("--rule-strong"), token(paper));
      assert.ok(ratio >= 3, `--rule-strong on ${paper} is ${ratio.toFixed(2)}:1, under the control-boundary floor`);
    }
  });

  it("keeps the decorative rule decorative, and never the only edge of a control", () => {
    for (const paper of PAPERS) {
      const composited = over(token("--rule"), token(paper));
      const ratio = contrast(composited, token(paper));
      assert.ok(
        ratio < 3,
        `--rule reaches ${ratio.toFixed(2)}:1 on ${paper}; if it clears the component floor it will start being used as one`,
      );
    }
    assert.equal(token("--border-control"), "var(--rule-strong)", "a control's boundary takes the strong rule");
    assert.equal(token("--border-strong"), "var(--rule-strong)");
  });

  it("keeps the quiet ink a rule colour, never a text colour", () => {
    assert.ok(
      contrast(token("--ink-quiet"), token("--paper")) < 4.5,
      "--ink-quiet is deliberately below the text floor, which is why the guard below exists",
    );

    const offenders = [];
    for (const relative of allSourceStyles()) {
      for (const [, value] of read(relative).matchAll(/(?:^|[;{]\s*)color:\s*([^;}]+)/g)) {
        if (/var\(--ink-quiet\)/.test(value)) offenders.push(`${relative} — color: ${value.trim()}`);
      }
    }
    assert.deepEqual(offenders, [], "--ink-quiet is a rule and divider colour only");
  });

  it("keeps black actions and colored state notices readable at every state", () => {
    assert.equal(token("--accent"), "var(--ink)");
    assert.equal(token("--accent-hover"), "var(--ink-raised)");
    assert.equal(token("--accent-ink"), "var(--ink)");
    assert.equal(token("--action"), "var(--ink)");
    assert.equal(token("--action-hover"), "var(--ink-raised)");
    for (const fill of ["--ink", "--ink-raised", "--success", "--danger"]) {
      assert.ok(contrast("#ffffff", token(fill)) >= 4.5, `white labels on ${fill} must clear AA`);
    }
    for (const state of ["success", "danger"]) {
      assert.ok(contrast(token(`--${state}`), token(`--${state}-soft`)) >= 4.5, `${state} text on its tint must clear AA`);
    }
    const [r, g, b] = channels(token("--success"));
    assert.ok(g > r && g > b, "success is green");
    const [red, green, blue] = channels(token("--danger"));
    assert.ok(red > green && red > blue, "danger is red");
  });

  it("keeps success and danger separate roles, and never distinguished by colour alone", () => {
    // The two roles stay separate names because their meanings are separate.
    // In a monochrome system their colours legitimately coincide, so what is
    // held here is that they differ where it matters — in the rule that closes
    // them, which is what a reader actually sees.
    assert.match(token("--success"), /^#/);
    assert.match(token("--danger"), /^#/);
    assert.notEqual(
      token("--success-line"),
      token("--danger-line"),
      "the two states must differ by rule weight, since they no longer differ by hue",
    );
    assert.equal(token("--danger-line"), "var(--danger)");
    assert.equal(token("--success-line"), "var(--success)");

    for (const relative of allSourceStyles()) {
      assert.doesNotMatch(
        read(relative),
        /(?:body|html|\.page-shell|main)\s*\{[^}]*background[^;}]*var\(--(?:success|danger)\)/,
        `${relative} paints a page in a semantic colour`,
      );
    }
  });

  it("confines chromatic colors to the shared green and red palette", () => {
    // The real guard: not what the tokens say, but what every sheet actually
    // paints. Any literal hex, rgb() or hsl() whose channels are not equal is a
    // colour leak, wherever it came from.
    const named = /\b(?:red|green|blue|orange|yellow|purple|teal|crimson|gold|tomato|navy|olive|maroon|aqua|fuchsia|lime|silver)\b/;
    const offenders = [];
    for (const relative of allSourceStyles()) {
      const sheet = read(relative);

      for (const [match, hex] of sheet.matchAll(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g)) {
        const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
        const [r, g, b] = channels(`#${full}`);
        if (relative === "public/styles/variables.css" && ["1d704e", "edf7f0", "b73535", "fff0ee"].includes(full.toLowerCase())) continue;
        if (!(r === g && g === b)) offenders.push(`${relative} — ${match}`);
      }

      for (const [match, r, g, b] of sheet.matchAll(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/g)) {
        if (!(r === g && g === b)) offenders.push(`${relative} — ${match})`);
      }

      for (const [match] of sheet.matchAll(/hsla?\(/g)) offenders.push(`${relative} — ${match}`);

      for (const [, value] of sheet.matchAll(/:\s*([^;{}]*)/g)) {
        const hit = value.match(named);
        if (hit && !/url\(|content:|font|--/.test(value)) offenders.push(`${relative} — ${hit[0]}`);
      }
    }
    assert.deepEqual(offenders, [], "surfaces stay neutral and accent colors come from shared tokens");
  });

  it("routes the legacy surface names onto the new roles rather than forking them", () => {
    for (const [alias, role] of [
      ["--surface", "--paper"],
      ["--surface-subtle", "--paper-muted"],
      ["--separator", "--rule"],
      ["--canvas", "--paper"],
    ]) {
      assert.equal(token(alias), `var(${role})`, `${alias} must alias ${role}, not restate a colour`);
    }
  });

  it("reads white on the black field, so an inverse region stays legible", () => {
    assert.ok(contrast("#ffffff", token("--field")) >= 7);
    assert.ok(contrast(token("--paper"), token("--field")) >= 7, "paper-on-field is the inverse body colour");
  });
});

describe("the page is not ruled", () => {
  it("publishes no ruling token", () => {
    for (const name of ["--paper-line-step", "--paper-line-width", "--paper-rule"]) {
      assert.equal(token(name), null, `${name} belongs to the superseded notebook ruling`);
    }
  });

  it("paints no repeating horizontal rule anywhere", () => {
    const offenders = [];

    // Scoped to the page ground. A repeating gradient behind a chart is a
    // ledger grid and belongs to the data; one behind the document is the
    // exercise book coming back.
    const PAGE_GROUND = /^(?:html|body|main|\.page-shell|\.dashboard-page)(?:::(?:before|after))?$/;

    for (const relative of allSourceStyles()) {
      for (const [rule] of read(relative).matchAll(/[^{}]*\{[^}]*\}/g)) {
        if (!/repeating-linear-gradient/.test(rule)) continue;
        const selectors = rule.slice(0, rule.indexOf("{")).split(",").map((part) => part.trim());
        if (!selectors.some((part) => PAGE_GROUND.test(part))) continue;
        offenders.push(`${relative} — ${selectors.join(", ").slice(0, 60)}`);
      }
    }

    assert.deepEqual(offenders, [], "the full-page exercise-book ruling is retired");
  });

  it("keeps a rule only where it organises real content", () => {
    // Every rule left in the system is a border on a region or an explicit
    // .press-rule element; none of them tile the background.
    const material = read("public/styles/components/material.css");

    assert.match(
      material,
      /\.press-region\s*\{[^}]*border:\s*1px solid var\(--rule\)/s,
      "a rule bounds a group of real content",
    );
    assert.doesNotMatch(material, /repeating-linear-gradient/, "the material layer draws no tiled rule");
  });
});

describe("the fibre has exactly one owner", () => {
  it("declares the texture layer once, in the shared material sheet", () => {
    const owners = [];
    for (const relative of allSourceStyles()) {
      for (const [rule] of read(relative).matchAll(/[^{}]*\{[^}]*\}/g)) {
        if (/background-image:\s*var\(--paper-texture\)/.test(rule)) {
          owners.push(`${relative} — ${rule.slice(0, rule.indexOf("{")).trim().replace(/\s+/g, " ")}`);
        }
      }
    }

    assert.equal(owners.length, 1, `the fibre must have one owner, found:\n${owners.join("\n")}`);
    assert.match(owners[0], /components\/material\.css/);
    assert.match(owners[0], /body::before/, "and it is a pseudo-element on the document, not on a region");
  });

  it("fixes the fibre to the viewport, so scrolling never repaints it", () => {
    const rule = read("public/styles/components/material.css").match(/body::before\s*\{[^}]*\}/s)[0];

    assert.match(rule, /position:\s*fixed/, "a fixed layer does not move with the scroll");
    assert.match(rule, /pointer-events:\s*none/, "it is decorative and must never take a click");
    assert.match(rule, /z-index:\s*var\(--z-page-texture\)/);
    assert.doesNotMatch(rule, /filter|mix-blend-mode|animation|transition/, "no per-frame work behind the page");
  });

  it("keeps the fibre off every scrolling container", () => {
    // The layer belongs to the document. A texture on `main`, a section or any
    // element that scrolls is what forces a repaint on every frame.
    for (const relative of allSourceStyles()) {
      for (const [rule] of read(relative).matchAll(/[^{}]*\{[^}]*\}/g)) {
        if (!/background(?:-image)?:[^;}]*var\(--paper-texture\)/.test(rule)) continue;
        const selector = rule.slice(0, rule.indexOf("{")).trim();
        assert.match(selector, /^body::before$/, `${relative} paints the fibre on ${selector}`);
      }
    }
  });

  it("serves the texture from this repository, never another origin", () => {
    const url = token("--paper-texture").match(/url\("([^"]+)"\)/)[1];

    assert.ok(url.startsWith("/textures/"), `the fibre must be local, got ${url}`);
    const onDisk = path.join(appRoot, "public", url.replace(/^\//, ""));
    assert.ok(existsSync(onDisk), `${url} is not in the repository`);
    assert.ok(statSync(onDisk).size < 80 * 1024, "a decorative tile must stay small");
  });

  it("keeps the fibre faint enough to read under and present enough to feel", () => {
    const opacity = Number(token("--paper-texture-opacity"));

    assert.ok(opacity > 0.2, "an invisible texture is a wasted request");
    assert.ok(opacity <= 0.6, "body copy must never have to fight the grain");
  });

  it("runs no animated texture or noise loop behind the page", () => {
    for (const relative of allSourceStyles()) {
      const css = read(relative);
      for (const [rule] of css.matchAll(/[^{}]*\{[^}]*\}/g)) {
        if (!/background(?:-image)?:[^;}]*var\(--paper-texture\)/.test(rule)) continue;
        assert.doesNotMatch(rule, /animation|transition/, `${relative} animates the decorative paper layer`);
      }
      assert.doesNotMatch(css, /@keyframes\s+[\w-]*(?:grain|noise|texture)/i, `${relative} loops a grain animation`);
    }
  });
});

describe("the sheet yields to the reader's preferences", () => {
  const material = () => read("public/styles/components/material.css");

  it("drops the grain wherever the reader asked for a plainer surface", () => {
    for (const query of [
      /@media \(prefers-reduced-transparency: reduce\)/,
      /@media \(prefers-contrast: more\)/,
      /@media \(forced-colors: active\)/,
      /@media \(prefers-reduced-data: reduce\)/,
      /@media print/,
    ]) {
      const block = material().match(new RegExp(`${query.source}\\s*\\{[\\s\\S]*?\\n\\}`));
      assert.ok(block, `the material layer must answer ${query.source}`);
      assert.match(block[0], /body::before\s*\{[^}]*display:\s*none/s, `${query.source} must drop the fibre`);
    }
  });

  it("keeps a solid, opaque ground underneath, so removing the grain loses nothing", () => {
    assert.match(material(), /main\s*\{[^}]*background:\s*var\(--paper\)/s, "the field is a flat opaque colour");
    assert.doesNotMatch(
      material().match(/main\s*\{[^}]*\}/s)[0],
      /gradient|url\(/,
      "no photograph or ramp washes up behind the content",
    );
  });

  it("keeps a forced-colors answer for every printed primitive", () => {
    const block = material().match(/@media \(forced-colors: active\)\s*\{[\s\S]*?\n\}/)[0];

    for (const primitive of [".press-region", ".press-plate", ".ui-icon"]) {
      assert.ok(block.includes(primitive), `${primitive} must state its forced-colors behaviour`);
    }
    assert.match(block, /CanvasText/, "forced colours must use the system palette, not the brand one");
  });
});

describe("one sheet, not a set of separately papered pages", () => {
  it("lets no page stylesheet restate the document's ground", () => {
    for (const relative of allSourceStyles()) {
      if (relative.endsWith("components/material.css")) continue;
      const css = read(relative);
      for (const [rule] of css.matchAll(/(?:^|\n)\s*(?:body|html|main)\s*\{[^}]*\}/g)) {
        assert.doesNotMatch(
          rule,
          /background(?:-image|-color)?:\s*(?!transparent|none|inherit)[^;}]*(?:gradient|url\(|var\(--paper)/,
          `${relative} paints its own page ground`,
        );
      }
    }
  });

  it("keeps the retired sky out of every stylesheet, view and script", () => {
    for (const relative of allSourceStyles()) {
      assert.doesNotMatch(read(relative), /\.app-sky|ambient-video|--sky-scrim|--horizon-fade/, `${relative} still mounts the sky`);
    }
    for (const relative of allViews()) {
      assert.doesNotMatch(read(relative), /app-sky|ambient-video|ambient-sky/, `${relative} still mounts the sky`);
    }
    assert.doesNotMatch(read("public/scripts/app.js"), /data-app-sky|initAmbientArt/);
  });
});

describe("no new cascade hazards", () => {
  const OUT_OF_SCOPE = ["public/styles/game/battle-arena.css"];

  it("adds no !important, no transition: all and no raw z-index", () => {
    for (const relative of allSourceStyles()) {
      if (OUT_OF_SCOPE.includes(relative)) continue;
      const css = read(relative);
      assert.doesNotMatch(css, /transition:\s*all/, `${relative} transitions everything`);

      for (const [, value] of css.matchAll(/(?:^|[;{]\s*)z-index:\s*([^;}]+)/g)) {
        const trimmed = value.trim();
        if (/^(auto|inherit|0|-1|1|2|var\(|calc\()/.test(trimmed)) continue;
        assert.fail(`${relative} uses the raw z-index ${trimmed} instead of the scale`);
      }
    }
  });
});
