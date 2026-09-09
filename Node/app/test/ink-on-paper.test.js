import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
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
    assert.equal(token("--paper"), "#ffffff");
    assert.equal(token("--paper-muted"), "#f2f2ef");
    assert.equal(token("--ink"), "#111111");
    assert.equal(token("--ink-raised"), "#242424");
    assert.equal(token("--ink-muted"), "#5c5c58");
    assert.equal(token("--rule"), "#d2d2cc");
    assert.equal(token("--rule-strong"), "#8a8a84");
  });

  it("keeps the page field white paper rather than a grey wash", () => {
    const canvas = token("--canvas");

    assert.match(canvas, /^#f[cdef]/i, `the canvas must be near-white paper, got ${canvas}`);
    assert.ok(contrast(canvas, token("--ink")) > 15, "ink on paper must be decisively dark");
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
