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
    // Clean white journal paper, not ivory. What makes it read as a sheet is
    // light and fibre, not warmth — an ivory field under a grey sky reads as
    // aged parchment, and the whole product is meant to feel fresh, not vintage.
    assert.equal(token("--paper"), "#ffffff");
    assert.equal(token("--paper-raised"), "#ffffff");
    assert.equal(token("--paper-muted"), "#f3f3f0");
    assert.equal(token("--ink"), "#111111");
    assert.equal(token("--ink-raised"), "#242424");
    assert.equal(token("--ink-muted"), "#5c5c58");
    assert.equal(token("--rule"), "#d2d4d2");
    assert.equal(token("--rule-strong"), "#808080");
  });

  it("keeps every paper surface white and untinted", () => {
    // No cast in any direction: a yellow one is parchment, a blue one is a
    // screen. The channels have to stay within a couple of levels of each other.
    for (const name of ["--paper", "--paper-raised", "--paper-muted", "--canvas"]) {
      const value = token(name);
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
      assert.ok(r >= 0xf3, `${name} must stay white paper, got ${value}`);
      assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 3,
        `${name} carries a colour cast, got ${value}`);
    }
    assert.ok(contrast(token("--canvas"), token("--ink")) > 15,
      "ink on paper must be decisively dark");
  });

  it("draws no tinted block: a raised panel is separated by border and space, not colour", () => {
    // The previous palette lifted panels with a warmer white, which turned every
    // structural region into a faintly different beige rectangle. White paper
    // has nowhere lighter to go, and that is the point.
    assert.equal(token("--paper-raised"), token("--paper"),
      "a raised panel must not be a different shade of paper");

    const muted = luminance(token("--paper-muted"));
    assert.ok(muted < luminance(token("--paper")), "a recessed row still sits into the field");
    assert.ok(contrast(token("--paper"), token("--paper-muted")) < 1.12,
      "and only just — a recessed row must not read as a separate sheet");
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
    const field = material.match(/body:has\(\.app-sky\) \{[^}]*\}/)[0];

    assert.doesNotMatch(mainRule, /background:\s*transparent/, "content must not sit on the sky");
    assert.match(mainRule, /background:\s*var\(--paper-field\)/, "the working field is paper");
    assert.match(field, /var\(--paper\) var\(--horizon-height\)/,
      "the sky survives only as the intro horizon");
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

describe("the page is ruled", () => {
  it("centralises the rule interval, width and colour as tokens", () => {
    // 20px body at 1.65 leading is a 33px line. The ruling is the body rhythm
    // drawn, so the interval is derived from the type scale, not chosen.
    const step = token("--paper-line-step");
    assert.equal(step, "2.0625rem", "the interval is the body line-height, in rem");
    assert.equal(Number(step.replace("rem", "")) * 16, 33);

    assert.equal(token("--paper-line-width"), "1px");
    assert.ok(token("--paper-rule"), "--paper-rule must exist");
  });

  it("paints the ruling once, in the shared material layer and nowhere else", () => {
    const material = read("public/styles/components/material.css");
    const layers = material.match(/background-image:\s*repeating-linear-gradient/g) || [];
    assert.equal(layers.length, 1, "the ruling is drawn once");
    assert.equal((material.match(/var\(--paper-rule\)/g) || []).length, 2,
      "the rule colour appears only as the two stops of that one gradient");

    for (const relative of allSourceStyles()) {
      if (relative.endsWith("components/material.css")) continue;
      if (relative.endsWith("styles/variables.css")) continue;
      assert.doesNotMatch(read(relative), /var\(--paper-rule\)|var\(--paper-line-step\)/,
        `${relative} rules its own page; the material layer owns the ruling`);
    }
  });

  it("keeps the ruling decorative, below content and off the pointer", () => {
    const material = read("public/styles/components/material.css");
    const rule = material.match(/body:has\(\.app-sky\) > main::after \{[^}]*\}/);
    assert.ok(rule, "the ruling needs its own layer, so it can arrive after the paper");

    assert.match(rule[0], /pointer-events:\s*none/);
    assert.match(rule[0], /z-index:\s*var\(--z-page-texture\)/, "no raw z-index");
    assert.match(rule[0], /var\(--paper-line-step\)/, "the interval comes from the token");
    assert.match(rule[0], /var\(--paper-line-width\)/, "the width comes from the token");
    assert.doesNotMatch(rule[0], /background-attachment:\s*fixed/,
      "a fixed attachment costs a full repaint on every mobile scroll");
  });

  it("brings the lines in on the horizon band, later than the paper itself", () => {
    const material = read("public/styles/components/material.css");
    const rule = material.match(/body:has\(\.app-sky\) > main::after \{[^}]*\}/)[0];

    assert.match(rule, /-webkit-mask-image/, "Safari needs the prefixed mask");
    assert.match(rule, /mask-image:\s*linear-gradient/, "the lines fade in, never switch on");
    assert.match(rule, /var\(--horizon-height\)/, "the ruling shares the horizon transition");
    assert.match(rule, /var\(--horizon-fade\)/, "the ruling shares the fade band");

    // The fibre starts at the top of the band; the lines must start below that,
    // so the paper reads as warming before it is ruled.
    const start = rule.match(/mask-image:\s*linear-gradient\(\s*to bottom,\s*transparent calc\(var\(--horizon-height\) - var\(--horizon-fade\) \* ([\d.]+)\)/);
    assert.ok(start, "the ruling must start part-way down the fade, not at its top");
    assert.ok(Number(start[1]) <= 0.6,
      `the lines must appear in the lower part of the fade, got ${start[1]} of it remaining`);
  });

  it("draws the rule from the sky's own blue, faintly enough to stay decorative", () => {
    const rule = token("--paper-rule");
    const parsed = rule.match(/rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+)%\s*\)/);
    assert.ok(parsed, `--paper-rule must be an rgb() with an alpha, got ${rule}`);

    const [, r, g, b, alpha] = parsed;
    const brand = token("--brand");
    assert.equal(
      `#${[r, g, b].map((c) => Number(c).toString(16).padStart(2, "0")).join("")}`,
      brand,
      "the rule is the brand blue-teal — the bridge from cool sky to warm paper",
    );

    // Faint enough that it never competes with a handwritten stroke.
    assert.ok(Number(alpha) <= 12, `the rule must stay decorative, got ${alpha}%`);
  });
});

describe("the sheet is continuous", () => {
  const material = () => read("public/styles/components/material.css");

  const STRUCTURAL = [
    "battle-encounters",
    "weekday-chart",
    "prayer-world-regions",
    "explore-list",
    "achievements-next-list",
  ];

  const everyView = () => {
    const views = [];
    const roots = [path.join(appRoot, "src", "views")];
    while (roots.length) {
      const dir = roots.pop();
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) roots.push(full);
        else if (entry.name.endsWith(".ejs")) views.push(full);
      }
    }
    return views;
  };

  it("paints no opaque rectangle over the ruling to hide it", () => {
    // A big opaque block over a ruled page does not read as "no lines here", it
    // reads as a separate sheet laid on top — which is exactly what it is.
    for (const relative of allSourceStyles()) {
      assert.doesNotMatch(read(relative), /\.is-unruled/,
        `${relative} still masks a region out of the ruling`);
    }
    for (const file of everyView()) {
      assert.doesNotMatch(readFileSync(file, "utf8"), /\bis-unruled\b/,
        `${path.relative(appRoot, file)} still masks a region out of the ruling`);
    }
  });

  it("leaves every structural container transparent, so the page stays one sheet", () => {
    // Lists, grids and wrappers are structure, not objects. Only something that
    // behaves like an object — a control, a card, a dialog — may take a surface.
    for (const relative of allSourceStyles()) {
      const css = read(relative);
      for (const cls of STRUCTURAL) {
        for (const [rule] of css.matchAll(new RegExp(`[^{}]*\\.${cls}\\b[^{}]*\\{[^}]*\\}`, "g"))) {
          assert.doesNotMatch(rule, /background(?:-color)?:\s*(?!none|transparent)/,
            `${relative} gives the structural container .${cls} a surface of its own`);
        }
      }
    }
  });

  it("still keeps one shared owner of the ruling", () => {
    const layers = material().match(/background-image:\s*repeating-linear-gradient/g) || [];
    assert.equal(layers.length, 1, "the ruling is drawn once");

    for (const relative of allSourceStyles()) {
      if (relative.endsWith("components/material.css")) continue;
      if (relative.endsWith("styles/variables.css")) continue;
      assert.doesNotMatch(read(relative), /--paper-rule|paper-line-step/,
        `${relative} reaches into the ruling`);
    }
  });

  it("keeps the ruling strong enough to be seen and faint enough to read under", () => {
    const alpha = Number(token("--paper-rule").match(/([\d.]+)%\s*\)/)[1]);
    assert.ok(alpha <= 8, `the ruling must not exceed 8%, got ${alpha}%`);
    assert.ok(alpha >= 6, `under 6% the page stopped reading as paper at all, got ${alpha}%`);
  });

  it("gives the fibre enough presence to be felt on white", () => {
    const script = read("scripts/build-paper-texture.py");
    const peak = Number(script.match(/PEAK_ALPHA\s*=\s*(\d+)/)[1]);
    assert.ok(peak >= 8, `the fibre was invisible on white at 6, got ${peak}`);
    assert.ok(peak <= 10, `above 10 the white starts reading as grey, got ${peak}`);
  });
});

describe("the ruled page yields to the reader's preferences", () => {
  const material = () => read("public/styles/components/material.css");

  it("drops grain and ruling wherever the reader asked for a plainer surface", () => {
    for (const query of [
      "@media \\(prefers-contrast: more\\)",
      "@media \\(prefers-reduced-transparency: reduce\\)",
      "@media print",
    ]) {
      const block = material().match(new RegExp(`${query} \\{[\\s\\S]*?\\n\\}`))[0];
      assert.match(block, /main::before,\s*\n\s*body:has\(\.app-sky\) > main::after \{\s*content:\s*none/,
        `${query} must switch off both the grain and the ruling`);
    }
  });

  it("gives a reduced-transparency reader solid paper rather than a wash over the sky", () => {
    const block = material().match(/@media \(prefers-reduced-transparency: reduce\) \{[\s\S]*?\n\}/)[0];
    const field = block.match(/body:has\(\.app-sky\) > main \{[^}]*\}/);

    assert.ok(field, "the working field must be restated as opaque");
    assert.match(field[0], /background:\s*var\(--paper\)/,
      "a reader who asked for less transparency gets the page, not the sky through it");
    assert.doesNotMatch(field[0], /transparent/, "no wash survives the preference");
  });

  it("leaves the active battle scene unpapered, ungrained and unruled", () => {
    const css = material();

    assert.match(css, /body\[data-ambient="scene"\]:has\(\.app-sky\) > main \{\s*background:\s*transparent/,
      "the active scene keeps no paper");
    assert.match(css, /body\[data-ambient="scene"\]:has\(\.app-sky\) > main::before,\s*\n\s*body\[data-ambient="scene"\]:has\(\.app-sky\) > main::after \{\s*content:\s*none/,
      "no decorative layer may cover the battle artwork");
  });
});

describe("the sky becomes paper", () => {
  const material = () => read("public/styles/components/material.css");

  it("washes the sky into paper over a long non-linear ramp", () => {
    // The ramp is named once, on the sky-owning body, so the battle entry screen
    // can re-point at it instead of mixing a second one.
    const rule = material().match(/body:has\(\.app-sky\) \{[^}]*\}/)[0];
    assert.match(rule, /--paper-field:\s*linear-gradient/, "the ramp has exactly one owner");

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

  it("mixes the fibre neutral, so white paper never picks up a cast", () => {
    const script = read("scripts/build-paper-texture.py");
    const fibre = script.match(/FIBRE_RGB\s*=\s*\((\d+),\s*(\d+),\s*(\d+)\)/);
    assert.ok(fibre, "the generator must declare its fibre colour");

    const [r, g, b] = fibre.slice(1, 4).map(Number);
    assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 2,
      `the fibre must be neutral grey on white paper, got rgb(${r}, ${g}, ${b})`);
    assert.ok(r > 0x40 && r < 0xc0,
      `the fibre must be a mid grey — black reads as dirt, light as nothing — got ${r}`);
  });

  it("reports the texture against the white it actually composites on", () => {
    const script = read("scripts/build-paper-texture.py");
    const paper = script.match(/paper\s*=\s*np\.array\(\[(\d+),\s*(\d+),\s*(\d+)\]/);
    assert.ok(paper, "the report must state the paper it composites against");
    assert.deepEqual(paper.slice(1, 4).map(Number), [255, 255, 255],
      "the generator must measure its swing against white, not the retired ivory");
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

  it("holds text above AA against the real composited texture, not just flat paper", () => {
    // The grain darkens the paper by a few levels. Contrast has to be measured
    // against what actually composites on screen — the darkest and the lightest
    // fibre sample over every paper step — not against the flat token.
    // Read from the generator, so this can never drift from what actually ships.
    const script = read("scripts/build-paper-texture.py");
    const [fr, fg, fb] = script.match(/FIBRE_RGB\s*=\s*\((\d+),\s*(\d+),\s*(\d+)\)/)
      .slice(1, 4).map(Number);
    const fibre = { r: fr, g: fg, b: fb };
    const peakAlpha = Number(script.match(/PEAK_ALPHA\s*=\s*(\d+)/)[1]) / 255;

    const mix = (paperHex, alpha) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(paperHex.slice(i, i + 2), 16));
      const blend = (p, f) => Math.round(p + (f - p) * alpha);
      return `#${[blend(r, fibre.r), blend(g, fibre.g), blend(b, fibre.b)]
        .map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    };

    // The ruling darkens it further where a line crosses a glyph, so the worst
    // case a reader ever sees is paper + fibre + rule, not paper alone.
    const ruleMatch = token("--paper-rule").match(/rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+)%\s*\)/);
    const ruleRgb = { r: Number(ruleMatch[1]), g: Number(ruleMatch[2]), b: Number(ruleMatch[3]) };
    const ruleAlpha = Number(ruleMatch[4]) / 100;

    const overRule = (hex) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      const blend = (p, f) => Math.round(p + (f - p) * ruleAlpha);
      return `#${[blend(r, ruleRgb.r), blend(g, ruleRgb.g), blend(b, ruleRgb.b)]
        .map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    };

    const papers = ["--paper", "--paper-raised", "--paper-muted", "--canvas"].map(token);
    const inks = ["--ink", "--ink-muted", "--ink-secondary-strong", "--brand", "--success", "--danger"];

    for (const paper of papers) {
      for (const alpha of [0, peakAlpha]) {
        // The ruling paints under every child of the working field, so it can
        // only ever composite on the field's own paper — an opaque raised,
        // muted or canvas surface sits above it and hides it.
        const surfaces = [mix(paper, alpha)];
        if (paper === token("--paper")) surfaces.push(overRule(mix(paper, alpha)));

        for (const surface of surfaces) {
          for (const ink of inks) {
            const ratio = contrast(token(ink), surface);
            assert.ok(ratio >= 4.5,
              `${ink} on ${surface} (${paper} + fibre + rule) is ${ratio.toFixed(2)}:1`);
          }
          const boundary = contrast(token("--rule-strong"), surface);
          assert.ok(boundary >= 3,
            `--rule-strong on ${surface} is ${boundary.toFixed(2)}:1, below the 3:1 control floor`);
        }
      }
    }
  });

});

describe("one book, not a set of separately papered pages", () => {
  it("lets no page sheet restate the sky-to-paper ramp for itself", () => {
    for (const relative of allSourceStyles()) {
      if (relative.endsWith("components/material.css")) continue;
      const css = read(relative);
      assert.doesNotMatch(css, /linear-gradient\([^;]*var\(--horizon-height\)/s,
        `${relative} mixes its own sky-to-paper wash; the material layer owns the ramp`);
      assert.doesNotMatch(css, /var\(--horizon-fade\)/,
        `${relative} reaches into the shared horizon transition`);
    }
  });

  it("keeps the battle entry screen on the same book surface as every other page", () => {
    const material = read("public/styles/components/material.css");

    // The whole battle page carries data-ambient="scene", so the scene switch
    // above strips the paper from the entry screen too. The restoration belongs
    // here, beside the rule it excepts — not in the battle sheet.
    const restore = material.match(
      /body\[data-ambient="scene"\]:has\(\.app-sky\):has\(\[data-battle-focus="false"\]\) > main \{[^}]*\}/,
    );
    assert.ok(restore, "the battle entry screen must get the shared field back");
    assert.doesNotMatch(restore[0], /linear-gradient/,
      "it must re-point at the shared ramp, not mix a second one");

    assert.match(
      material,
      /body\[data-ambient="scene"\]:has\(\.app-sky\):has\(\[data-battle-focus="false"\]\) > main::before,\s*\n[^{]*::after \{\s*content:\s*""/,
      "the entry screen keeps its grain and ruling too",
    );
  });

  it("runs no animated texture or noise loop behind the page", () => {
    for (const relative of allSourceStyles()) {
      const css = read(relative);
      for (const [rule] of css.matchAll(/[^}]*::(?:before|after)\s*\{[^}]*\}/g)) {
        if (!/var\(--paper-texture\)|var\(--paper-rule\)/.test(rule)) continue;
        assert.doesNotMatch(rule, /animation|@keyframes|transition/,
          `${relative} animates a decorative paper layer`);
      }
    }
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
