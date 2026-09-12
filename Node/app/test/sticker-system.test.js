import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFileSync(path.join(appRoot, relative), "utf8");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const material_ = () => read("public/styles/components/material.css");
const variables = () => read("public/styles/variables.css");
const token = (name) => {
  const match = variables().match(new RegExp(`${name}:\\s*([^;]+);`));
  return match ? match[1].trim() : null;
};
const ruleFor = (selector) => {
  const match = material_().match(new RegExp(`(^|\\n)${selector}\\s*\\{[^}]*\\}`));
  return match ? match[0] : null;
};

function allStyles() {
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
      else if (entry.name.endsWith(".ejs")) files.push(full);
    }
  }
  return files;
}

const markup = () => allViews().map((f) => readFileSync(f, "utf8")).join("\n");

/**
 * The sticker system is superseded (CONSTRAINTS.md, 2026-09-11). Grouping is no
 * longer done by lifting a rotated, shadowed white label off a ruled page; it is
 * done by spacing, one thin rule, a tonal fill, or a black field.
 *
 * This file is the replacement contract, not a weakened version of the old one.
 * Every rule the sticker system enforced — one primitive, one owner, one
 * boundary, never nested, no runtime randomness, no decoration without a reason
 * — is re-asserted against the printed region that replaces it, plus the new
 * prohibitions the sticker system could not express.
 */
describe("the sticker system is gone, not renamed", () => {
  it("publishes no sticker token anywhere", () => {
    for (const name of [
      "--sticker-bg",
      "--sticker-edge",
      "--sticker-edge-strong",
      "--sticker-shadow",
      "--sticker-shadow-hover",
      "--sticker-radius",
      "--sticker-tilt-a",
      "--sticker-tilt-b",
    ]) {
      assert.equal(token(name), null, `${name} belongs to the superseded sticker system`);
    }
  });

  it("defines no sticker class in any stylesheet", () => {
    for (const file of allStyles()) {
      assert.doesNotMatch(read(file), /\.sticker-/, `${file} still defines a sticker primitive`);
    }
  });

  it("renders no sticker class in any view", () => {
    assert.doesNotMatch(markup(), /sticker-surface|sticker-status/, "a view still asks for a sticker");
  });

  it("tilts nothing: the scrapbook angle cannot come back under another name", () => {
    // Rotation itself is legitimate — a chevron, a close cross, a spinner and
    // the battle poses all draw with it. The scrapbook tilt has a signature
    // those do not: a small angle, under five degrees, applied to a surface so
    // it reads as "placed by hand". No such angle exists anywhere.
    const offenders = [];

    for (const file of allStyles()) {
      const css = stripComments(read(file));
      // `--pose-transform` is the battle figure's pose channel: a fighter
      // leaning into a swing is choreography tied to a resolved action, and it
      // is read by the arena script, never applied to a page region. Every
      // other small angle in the product is the scrapbook tilt.
      const scanned = css.replace(/--pose-transform:[^;]+;/g, "");
      for (const [, angle, unit] of scanned.matchAll(/rotate[XYZ]?\(\s*(-?[\d.]+)(deg|turn|rad)\s*\)/g)) {
        const degrees = Math.abs(
          unit === "deg" ? Number(angle) : unit === "turn" ? Number(angle) * 360 : (Number(angle) * 180) / Math.PI,
        );
        if (degrees > 0 && degrees < 5) offenders.push(`${file} — rotate(${angle}${unit})`);
      }
      assert.doesNotMatch(css, /--[\w-]*tilt[\w-]*\s*:/, `${file} publishes a tilt token`);
    }

    assert.deepEqual(offenders, [], "a region sits square on the page");
  });

  it("floats nothing: every page-surface shadow token is neutralised", () => {
    // These are the tokens a page region used to lift itself with. They are
    // kept as names because components still ask for them, and every one of
    // them now resolves to nothing, so an old caller degrades to flat.
    for (const name of ["--shadow-float", "--shadow-panel", "--shadow-soft", "--shadow-card-hover", "--edge-light"]) {
      const value = token(name);
      assert.ok(value, `${name} must remain defined so existing callers resolve`);
      const resolved = /^var\(/.test(value) ? token(value.replace(/var\(|\)/g, "")) : value;
      assert.equal(resolved, "none", `${name} still lifts a region off the sheet`);
    }
  });

  it("keeps the one real shadow on things that genuinely sit above the document", () => {
    // A modal, a menu and the loader overlay are above the sheet, not printed
    // on it, so they may cast. Nothing else may use those two tokens, and no
    // literal drop shadow may be written anywhere.
    const OVERLAY = /dialog|modal|menu|panel|popover|toast|tooltip|loader|dropdown|backdrop|tray|timer-card|skip-link/i;
    const offenders = [];

    for (const file of allStyles()) {
      const css = stripComments(read(file));
      for (const [rule] of css.matchAll(/[^{}]+\{[^}]*\}/g)) {
        const shadow = rule.match(/(?:^|[;{]\s*)box-shadow:\s*([^;}]+)/);
        if (!shadow) continue;
        const value = shadow[1].trim();
        if (/^(none|inherit|initial|unset)$/i.test(value)) continue;
        if (/\binset\b/.test(value)) continue; // an inset edge is printing, not lift
        const selector = rule.slice(0, rule.indexOf("{")).trim().replace(/\s+/g, " ");

        const viaOverlayToken = /var\(--shadow-(?:pop|dialog)\)/.test(value);
        const viaNeutralToken = /var\(--(?:shadow-(?:float|panel|soft|card-hover)|edge-light)\)/.test(value);
        if (viaNeutralToken && !/\d/.test(value.replace(/var\([^)]*\)/g, ""))) continue;
        if (viaOverlayToken && OVERLAY.test(selector)) continue;
        if (/^0 0 0 [\d.]+px/.test(value)) continue; // a ring, not a drop shadow

        offenders.push(`${file} — ${selector.slice(0, 70)}: ${value.slice(0, 50)}`);
      }
    }

    assert.deepEqual(offenders, [], "a page region groups by rule, tone or field — never by being lifted");
  });

  it("keeps the float shadow token itself neutralised, so an old caller cannot lift a region", () => {
    assert.equal(token("--shadow-float"), "none");
  });

  it("puts no glass anywhere: a blurred pane is not a printed surface", () => {
    // A modal backdrop may blur what is behind it — that is a scrim, and the
    // thing behind it is the page, not the surface itself. A region that blurs
    // its own background is glassmorphism, which the printed page has no use
    // for, so the token that did it is retired.
    const SCRIM = /backdrop|overlay|scrim|::backdrop/i;
    const offenders = [];

    assert.equal(token("--glass-blur"), null, "--glass-blur is the glass-surface token and is retired");

    for (const file of allStyles()) {
      const css = stripComments(read(file));
      for (const [rule] of css.matchAll(/[^{}]+\{[^}]*\}/g)) {
        const blur = rule.match(/(?:^|[;{]\s*)(?:-webkit-)?backdrop-filter:\s*([^;}]+)/);
        if (!blur || /^none$/i.test(blur[1].trim())) continue;
        const selector = rule.slice(0, rule.indexOf("{")).trim().replace(/\s+/g, " ");
        if (SCRIM.test(selector)) continue;
        offenders.push(`${file} — ${selector.slice(0, 70)}`);
      }
    }

    assert.deepEqual(offenders, [], "only a scrim behind an overlay may blur; a region never does");
  });
});

describe("one region primitive, in the shared material layer", () => {
  it("defines the region exactly once, and only there", () => {
    assert.ok(ruleFor("\\.press-region"), ".press-region must exist in material.css");

    for (const file of allStyles()) {
      if (file.endsWith("components/material.css")) continue;
      assert.doesNotMatch(
        stripComments(read(file)),
        /(^|\n|,)\s*\.press-region\s*\{/,
        `${file} restates the region primitive the material layer owns`,
      );
    }
  });

  it("draws one boundary, and the sheet shows through it", () => {
    const rule = stripComments(ruleFor("\\.press-region"));

    assert.match(rule, /border:\s*1px solid var\(--rule\)/, "the boundary is one printed hairline");
    assert.match(rule, /border-radius:\s*var\(--radius-panel\)/, "regions share the panel corner size");
    assert.match(rule, /background:\s*transparent/, "a region is an area of the page, not an object on it");
    assert.doesNotMatch(rule, /box-shadow/, "and it is not lifted off the sheet");
    assert.doesNotMatch(rule, /transform/, "and it is not tilted");
  });

  it("ships no region variant that nothing renders", () => {
    // A variant nobody uses is dead weight in every page that loads the shared
    // layer, and it is how a primitive set quietly becomes a framework. Only
    // `--feature` survived the build, because only `--feature` is rendered.
    const material = stripComments(material_());
    const variants = [...new Set([...material.matchAll(/\.press-region--([\w-]+)/g)].map(([, name]) => name))];
    const html = markup();

    for (const variant of variants) {
      assert.ok(html.includes(`press-region--${variant}`), `.press-region--${variant} is styled but never rendered`);
    }
  });

  it("keeps every printed primitive in the material layer used by real markup", () => {
    const material = stripComments(material_());
    const html = markup();
    const declared = [...new Set([...material.matchAll(/\.(press-[\w-]+)/g)].map(([, name]) => name))];
    const orphans = declared.filter(
      (name) => !html.includes(name) && !material.includes(`.${name} .`) && !new RegExp(`\\.${name}[:\\[]`).test(material),
    );

    assert.deepEqual(orphans, [], "a primitive nothing renders is dead weight on every page");
  });

  it("never nests: an inner boundary gives up its own edge", () => {
    const material = stripComments(read("public/styles/components/material.css"));
    const block = material.match(/((?:\.[\w-]+ \.[\w-]+,\s*)*\.press-region \.press-region,[\s\S]*?)\{([^}]*)\}/);

    assert.ok(block, "the nesting rule must exist, so a mistake degrades to the right answer");
    assert.match(block[2], /border-color:\s*transparent/);
    assert.match(block[2], /background:\s*transparent/);

    // Three primitives draw a boundary in this system, and every combination of
    // one inside another must be absorbed — otherwise a box inside a box comes
    // back through whichever pair was left out.
    const selectors = block[1];
    for (const pair of [
      ".press-region .press-region",
      ".press-region .surface-panel",
      ".press-region .data-table-wrap",
      ".surface-panel .surface-panel",
      ".surface-panel .press-region",
    ]) {
      assert.ok(selectors.includes(pair), `${pair} must be absorbed too`);
    }
  });

  it("never turns a whole element type into a region", () => {
    // The class is opt-in. No selector may make every section, list or card a
    // bounded region on its own — that is how a page becomes a grid of boxes.
    for (const file of allStyles()) {
      const css = stripComments(read(file));
      for (const [, selector] of css.matchAll(/(^|\n)\s*((?:[a-z][\w-]*\s*,\s*)*[a-z][\w-]*)\s*\{[^}]*border:\s*1px solid var\(--rule\)/g)) {
        assert.fail(`${file} makes the bare element ${selector.trim()} a bounded region`);
      }
    }
  });
});

describe("regions are applied only where a group exists", () => {
  // Audited in the templates: each is a single group a person put on the page.
  const GROUPS = [
    "dashboard-actions", // today's answer — the reason the page exists
    "settings-group", // a compact group of related controls
    "battle-setup", // the one thing standing between you and a battle
    "empty-state", // a page not yet written
    "auth-card", // the login or registration form owns its single boundary
  ];

  // Audited and deliberately NOT regions, with the reason, so the list cannot
  // quietly grow back: each already sits inside a boundary of its own, and a
  // region inside a region is the nested-card habit.
  const NOT_GROUPS = [
    "daily-goals-empty",
    // The feed wrap carries the one boundary for the whole list; an entry
    // inside it is divided from its neighbours by a rule.
    "prayer-item",
  ];

  it("puts a region on every audited group", () => {
    const html = markup();
    for (const group of GROUPS) {
      const el = html.match(new RegExp(`class="(?:[^"]*\\s)?${group}(?:\\s[^"]*)?"`));
      assert.ok(el, `${group} is no longer rendered`);
      assert.match(el[0], /\bpress-region\b/, `${group} is a group but carries no boundary`);
    }
  });

  it("keeps a region out of anything that already has a boundary", () => {
    const html = markup();
    for (const name of NOT_GROUPS) {
      const el = html.match(new RegExp(`class="(?:[^"]*\\s)?${name}(?:\\s[^"]*)?"`));
      assert.ok(el, `${name} is no longer rendered`);
      assert.doesNotMatch(el[0], /\bpress-region\b/, `${name} already sits inside a boundary`);
    }
  });

  it("never nests one region directly inside another in the markup", () => {
    for (const file of allViews()) {
      const html = readFileSync(file, "utf8");
      // A region opening while another is still open, with no closing tag in
      // between, is the nesting the cascade rule above exists to absorb.
      const opens = [...html.matchAll(/<(\w+)[^>]*class="[^"]*\bpress-region\b[^"]*"/g)];
      for (const open of opens) {
        const rest = html.slice(open.index + open[0].length);
        const nextOpen = rest.search(/class="[^"]*\bpress-region\b/);
        const nextClose = rest.search(new RegExp(`</${open[1]}>`));
        if (nextOpen === -1) continue;
        assert.ok(
          nextClose !== -1 && nextClose < nextOpen,
          `${path.relative(appRoot, file)} nests one region inside another`,
        );
      }
    }
  });
});

describe("corners follow the surface scale", () => {
  it("uses restrained rounding for rows, controls, panels and large surfaces", () => {
    assert.equal(token("--radius-row"), "6px");
    assert.equal(token("--radius-panel"), "12px");
    assert.equal(token("--radius-feature"), "16px");
    assert.equal(token("--radius-control"), "8px");
  });

  it("resolves every radius to the shared scale or deliberate shape geometry", () => {
    // Circles are reserved for seals, progress rings, meters and true emblem
    // geometry; organic percentage shapes are drawings, not corners. Anything
    // else asking for a soft corner is the rounded-card habit.
    const CIRCLE =
      /seal|ring|emblem|avatar|identity|dot|overprint|loader|marker|meter|track|token|chip|banner|globe|swatch|ember|impact|shadow|spinner|thumb|menu-button|roadmap-grid|section-frame|answer-status|data-loading|aria-current/i;
    const SHAPE = /globe|emblem|ward|land|figure|ember/i;
    const offenders = [];

    const resolve = (value, depth = 0) => {
      if (depth > 6) return value;
      return value.replace(/var\((--[\w-]+)(?:,[^)]*)?\)/g, (whole, name) => {
        const next = token(name);
        return next === null ? whole : resolve(next, depth + 1);
      });
    };

    for (const file of allStyles()) {
      const css = stripComments(read(file));
      for (const [rule] of css.matchAll(/[^{}]+\{[^}]*\}/g)) {
        const radius = rule.match(/(?:^|[;{]\s*)border(?:-\w+)?-radius:\s*([^;}]+)/);
        if (!radius) continue;
        const value = resolve(radius[1].trim());
        if (/^(0|0px|0%|inherit|initial|unset)$/.test(value)) continue;
        const selector = rule.slice(0, rule.indexOf("{")).trim().replace(/\s+/g, " ");

        // A multi-value radius is drawing a shape — an arch, a dome, a blob —
        // not softening a corner.
        if (value.split(/\s+/).length > 1) {
          if (!SHAPE.test(selector)) offenders.push(`${file} — ${selector.slice(0, 70)} draws a blob but is not a shape`);
          continue;
        }
        if (/^(50%|999px)$/.test(value)) {
          if (!CIRCLE.test(selector)) offenders.push(`${file} — ${selector.slice(0, 70)} is circular but is not a seal`);
          continue;
        }
        if (/^[12]px$/.test(value)) continue;
        if (/var\(--radius(?:-[\w-]+)?\)/.test(radius[1]) && /^(6|8|12|16)px$/.test(value)) continue;
        offenders.push(`${file} — ${selector.slice(0, 70)}: ${value.slice(0, 40)}`);
      }
    }

    assert.deepEqual(offenders, [], "rounded surfaces must use the shared radius scale; circles remain intentional");
  });

});

describe("a region actually wins the cascade", () => {
  it("lets no component restate the surface the region owns", () => {
    const html = markup();
    const regioned = [...html.matchAll(/class="([^"]*\bpress-region\b[^"]*)"/g)]
      .flatMap(([, list]) => list.split(/\s+/))
      .filter((name) => name && !name.startsWith("press-region"));

    assert.ok(regioned.length > 0, "no regioned components found");

    for (const file of allStyles()) {
      if (file.endsWith("components/material.css")) continue;
      const css = stripComments(read(file));
      for (const name of new Set(regioned)) {
        const rule = css.match(new RegExp(`(^|\\n|,)\\s*\\.${name}\\s*\\{([^}]*)\\}`));
        if (!rule) continue;
        assert.doesNotMatch(
          rule[2],
          /(?:^|;)\s*(?:border|background|box-shadow):/,
          `${file} restates the surface .press-region already owns on .${name}`,
        );
      }
    }
  });
});
