import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFileSync(path.join(appRoot, relative), "utf8");

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
  return files;
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

const token = (name) => {
  const match = read("public/styles/variables.css").match(new RegExp(`${name}:\\s*([^;]+);`));
  return match ? match[1].trim() : null;
};

describe("Course Ledger palette", () => {
  it("defines paper, ink and rule as the structural roles", () => {
    // Warm ivory, not white: the sky washes down into this surface, and the
    // handwritten face is meant to read as ink on a page rather than on a screen.
    assert.equal(token("--paper"), "#f8f4e8");
    assert.equal(token("--paper-raised"), "#fcfaf4");
    assert.equal(token("--paper-muted"), "#efe9dc");
    assert.equal(token("--ink"), "#111111");
    assert.equal(token("--ink-raised"), "#242424");
    assert.equal(token("--ink-muted"), "#5c5c58");
    assert.equal(token("--rule"), "#cec5b4");
    assert.equal(token("--rule-strong"), "#837a6d");
  });

  it("keeps the page field light paper rather than a grey or kraft wash", () => {
    const canvas = token("--canvas");
    const paper = token("--paper");

    // Light enough to stay paper, warm enough to stop being a screen. Anything
    // darker than this band starts reading as parchment or kraft.
    for (const [name, value] of [["--canvas", canvas], ["--paper", paper]]) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
      assert.ok(r >= 0xf0, `${name} must stay light paper, got ${value}`);
      assert.ok(r > b, `${name} must be warm, not cool, got ${value}`);
      assert.ok(r - b <= 0x20, `${name} must not tip into kraft or parchment, got ${value}`);
    }
    assert.ok(contrast(canvas, token("--ink")) > 15, "ink on paper must be decisively dark");
  });

  it("keeps the three paper steps distinct but close", () => {
    // Raised above the field, muted below it — and no third beige.
    const raised = luminance(token("--paper-raised"));
    const paper = luminance(token("--paper"));
    const muted = luminance(token("--paper-muted"));

    assert.ok(raised > paper, "a raised panel must sit above the field");
    assert.ok(muted < paper, "a muted row must sit below the field");
    assert.ok(contrast(token("--paper-raised"), token("--paper-muted")) < 1.35,
      "the paper steps must stay a family, not become separate colours");
  });

  it("holds every ink role above its WCAG 2.2 floor on paper", () => {
    const paper = token("--paper");

    assert.ok(contrast(token("--ink"), paper) >= 4.5);
    assert.ok(contrast(token("--ink-muted"), paper) >= 4.5, "secondary copy must clear AA");
    assert.ok(contrast(token("--ink-quiet"), paper) >= 3);
    assert.ok(contrast(token("--brand"), paper) >= 3);
  });

  it("routes the legacy surface names onto the new roles rather than forking them", () => {
    for (const [alias, role] of [
      ["--surface", "--paper"],
      ["--surface-subtle", "--paper-muted"],
      ["--separator", "--rule"],
    ]) {
      assert.equal(token(alias), `var(${role})`, `${alias} must alias ${role}, not restate a colour`);
    }
  });

  it("keeps semantic colour for genuine state only", () => {
    assert.match(token("--success"), /^#/);
    assert.match(token("--danger"), /^#/);

    for (const relative of allSourceStyles()) {
      const css = read(relative);
      assert.doesNotMatch(
        css,
        /(?:body|html|\.page-shell|main)\s*\{[^}]*background[^;}]*var\(--(?:success|danger)\)/,
        `${relative} paints a page in a semantic colour`,
      );
    }
  });
});

describe("the working field is opaque paper", () => {
  it("stops the sky behind forms, tables and long prose", () => {
    const material = read("public/styles/components/material.css");
    const mainRule = material.match(/body:has\(\.app-sky\) > main \{[^}]*\}/)[0];

    assert.doesNotMatch(mainRule, /background:\s*transparent/, "content must not sit on the sky");
    assert.match(mainRule, /var\(--paper\)/, "the working field is paper");
    assert.match(mainRule, /var\(--horizon-height\)/, "the sky survives only as the intro horizon");
  });

  it("keeps exactly one shared sky element and no page-specific mount", () => {
    const shell = read("src/views/components/layout/ambient-sky.ejs");
    assert.equal((shell.match(/data-app-sky/g) || []).length, 1);

    for (const relative of allSourceStyles()) {
      if (relative.endsWith("components/material.css")) continue;
      assert.doesNotMatch(read(relative), /position:\s*fixed;[^}]*ambient-sky\.jpg/, `${relative} builds a second sky`);
    }
  });

  it("restrains the horizon instead of brightening the whole page", () => {
    const scrim = token("--sky-scrim");
    const opacity = Number(scrim.match(/([\d.]+)\s*\)$/)[1]);

    assert.ok(opacity < 0.84, `the full-page fog scrim must be gone, got ${opacity}`);
  });
});

describe("the sky becomes paper", () => {
  const material = () => read("public/styles/components/material.css");

  it("washes the sky into paper over a long non-linear ramp", () => {
    const rule = material().match(/body:has\(\.app-sky\) > main \{[^}]*\}/)[0];

    assert.match(rule, /var\(--horizon-height\)/, "the transition is still anchored to the horizon");
    assert.match(rule, /var\(--horizon-fade\)/, "the transition still spans the fade token");

    // More than one intermediate stop is what stops the wash reading as an edge.
    const stops = rule.match(/color-mix\(in srgb, var\(--paper\)/g) || [];
    assert.ok(stops.length >= 3, `the ramp needs intermediate stops, found ${stops.length}`);

    // The last stop is opaque paper, so the gradient holds paper forever below.
    assert.match(rule, /var\(--paper\) var\(--horizon-height\)/,
      "paper must reach full opacity at the horizon and stay there");
  });

  it("gives the desktop a long fade and narrow screens a shorter one", () => {
    const fade = read("public/styles/variables.css").match(/--horizon-fade:\s*(\d+)px/);
    assert.ok(fade, "--horizon-fade must be a pixel length");
    assert.equal(Number(fade[1]), 112, "the desktop wash is 112px");

    const narrow = material().match(/@media \(max-width: 760px\) \{[^}]*\{[^}]*--horizon-fade:\s*(\d+)px/);
    assert.ok(narrow, "narrow screens must shorten the wash");
    const value = Number(narrow[1]);
    assert.ok(value >= 80 && value <= 88, `the narrow wash must sit at 80-88px, got ${value}`);
  });

  it("owns exactly one paper-texture layer, in the shared material sheet", () => {
    for (const relative of allSourceStyles()) {
      // variables.css declares the token; material.css is the only sheet
      // allowed to paint with it.
      // variables.css declares the token; material.css is the only sheet
      // allowed to paint with it. Everything else must stay out.
      if (relative.endsWith("components/material.css")) continue;
      if (relative.endsWith("styles/variables.css")) continue;
      const css = read(relative);
      assert.doesNotMatch(css, /paper-fiber|var\(--paper-texture\)/,
        `${relative} builds a second paper texture layer; the material layer owns it`);
    }

    const layers = material().match(/background-image:\s*var\(--paper-texture\)/g) || [];
    assert.equal(layers.length, 1, "the texture is declared once");
  });

  it("keeps the texture decorative, local and out of the way", () => {
    const rule = material().match(/body:has\(\.app-sky\) > main::before \{[^}]*\}/)[0];

    assert.match(rule, /pointer-events:\s*none/, "decoration must never take a pointer");
    assert.match(rule, /z-index:\s*var\(--z-page-texture\)/, "the texture uses the z-index scale");
    assert.match(rule, /-webkit-mask-image/, "Safari needs the prefixed mask");
    assert.match(rule, /mask-image:\s*linear-gradient/, "the grain fades in with the paper");
    assert.doesNotMatch(rule, /background-attachment:\s*fixed/,
      "a fixed attachment costs a full repaint on every mobile scroll");

    // Negative, so it paints under every child of the working field.
    const z = read("public/styles/variables.css").match(/--z-page-texture:\s*(-?\d+)/);
    assert.ok(z && Number(z[1]) < 0, "the texture must sit below content, not above it");
  });

  it("serves the texture from this repository, never another origin", () => {
    const variables = read("public/styles/variables.css");
    const reference = variables.match(/--paper-texture:\s*url\("([^"]+)"\)/);

    assert.ok(reference, "--paper-texture must point at a local file");
    const href = reference[1];
    assert.ok(href.startsWith("/"), `the texture must be same-origin, got ${href}`);
    assert.doesNotMatch(href, /^https?:|^\/\//, "the texture must never be hotlinked");

    const file = path.join(appRoot, "public", href.replace(/^\//, ""));
    assert.ok(existsSync(file), `${href} is not present in the repository`);
    assert.ok(statSync(file).size <= 40 * 1024,
      `the texture must stay inside its 40KB budget, got ${(statSync(file).size / 1024).toFixed(1)}KB`);
  });

  it("drops the decorative grain where the reader asked for a plainer surface", () => {
    const css = material();

    for (const query of [
      "@media \\(prefers-contrast: more\\)",
      "@media \\(prefers-reduced-transparency: reduce\\)",
      "@media print",
    ]) {
      const block = css.match(new RegExp(`${query} \\{[\\s\\S]*?\\n\\}`));
      assert.ok(block, `${query} must exist`);
      assert.match(block[0], /main::before \{\s*content:\s*none/,
        `${query} must switch the texture off`);
    }
  });

  it("holds text above AA against the real composited texture, not just flat paper", () => {
    // The grain darkens the paper by a few levels. Contrast has to be measured
    // against what actually composites on screen — the darkest and the lightest
    // fibre sample over every paper step — not against the flat token.
    const fibre = { r: 104, g: 96, b: 82 };      // FIBRE_RGB in build-paper-texture.py
    const peakAlpha = 11 / 255;                   // PEAK_ALPHA in the same script

    const mix = (paperHex, alpha) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(paperHex.slice(i, i + 2), 16));
      const blend = (p, f) => Math.round(p + (f - p) * alpha);
      return `#${[blend(r, fibre.r), blend(g, fibre.g), blend(b, fibre.b)]
        .map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    };

    const papers = ["--paper", "--paper-raised", "--paper-muted", "--canvas"].map(token);
    const inks = ["--ink", "--ink-muted", "--ink-secondary-strong", "--brand", "--success", "--danger"];

    for (const paper of papers) {
      for (const alpha of [0, peakAlpha]) {
        const surface = mix(paper, alpha);
        for (const ink of inks) {
          const ratio = contrast(token(ink), surface);
          assert.ok(ratio >= 4.5,
            `${ink} on ${surface} (${paper} + fibre) is ${ratio.toFixed(2)}:1`);
        }
        const boundary = contrast(token("--rule-strong"), surface);
        assert.ok(boundary >= 3,
          `--rule-strong on ${surface} is ${boundary.toFixed(2)}:1, below the 3:1 control floor`);
      }
    }
  });

  it("leaves the active battle scene fully transparent and untextured", () => {
    const css = material();

    assert.match(css, /body\[data-ambient="scene"\]:has\(\.app-sky\) > main \{\s*background:\s*transparent/,
      "the active scene keeps no paper");
    assert.match(css, /body\[data-ambient="scene"\]:has\(\.app-sky\) > main::before \{\s*content:\s*none/,
      "the active scene keeps no grain either");
  });
});

const OUT_OF_SCOPE = ["public/styles/game/battle-arena.css"];

describe("no new cascade hazards", () => {
  it("adds no !important, no transition: all and no raw z-index", () => {
    for (const relative of allSourceStyles()) {
      if (OUT_OF_SCOPE.includes(relative)) continue;
      const css = read(relative);
      assert.doesNotMatch(css, /transition:\s*all/, `${relative} transitions everything`);

      for (const [declaration, value] of css.matchAll(/z-index:\s*([^;]+);/g)) {
        assert.match(
          value,
          /^(?:(?:calc\()?var\(--z-|-?\d\s*$|auto\s*$)/,
          `${relative} invents a z-index outside the scale: ${declaration.trim()}`,
        );
      }
    }
  });
});
