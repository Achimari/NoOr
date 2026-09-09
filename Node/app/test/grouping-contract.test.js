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

function rule(relative, selector) {
  const css = read(relative);
  const match = css.match(new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
  return match ? match[2] : null;
}

function px(name) {
  const variables = read("public/styles/variables.css");
  const raw = variables.match(new RegExp(`${name}:\\s*([^;]+);`))[1].trim();
  const direct = raw.match(/^(\d+)px$/);
  if (direct) return Number(direct[1]);
  const alias = raw.match(/^var\((--[a-z0-9-]+)\)$/);
  if (alias) return px(alias[1]);
  throw new Error(`${name} must be a single spacing step, got ${raw}`);
}

describe("spacing expresses relationship, not a single separator", () => {
  it("names the three relationship bands", () => {
    assert.ok(px("--gap-related") >= 8 && px("--gap-related") <= 16, "related content sits 8-16px apart");
    assert.ok(px("--gap-sibling") >= 24 && px("--gap-sibling") <= 32, "siblings sit 24-32px apart");
    assert.ok(px("--gap-region") >= 48 && px("--gap-region") <= 56, "regions sit 48-56px apart");
  });

  it("keeps the bands in ascending order so the hierarchy is legible", () => {
    assert.ok(px("--gap-related") < px("--gap-sibling"));
    assert.ok(px("--gap-sibling") < px("--gap-region"));
  });

  it("separates sibling sections by the sibling band, not the old 64px token", () => {
    const section = rule("public/styles/shell.css", ".page-section");

    assert.match(section, /margin-block-end:\s*var\(--gap-sibling\)/);
    assert.doesNotMatch(section, /--section-gap/, "one token must not drive every boundary");
  });

  it("gives a genuine region break its own owner", () => {
    assert.match(
      rule("public/styles/shell.css", ".page-section--region"),
      /margin-block-end:\s*var\(--gap-region\)/,
      "a real change of mode gets the wider band",
    );
  });

  it("attaches every section heading to the body it names", () => {
    for (const [file, selector] of [
      ["public/styles/shell.css", ".section-head"],
      ["public/styles/pages/daily-check-in.css", ".practice-lede"],
    ]) {
      const declarations = rule(file, selector);
      assert.ok(declarations, `${selector} must exist in ${file}`);
      assert.doesNotMatch(
        declarations,
        /margin-block-end:\s*var\(--(?:gap-region|section-gap|space-[789])\)/,
        `${selector} must not float away from its body`,
      );
    }
  });

  it("keeps the Today chapters in one rhythm, separated by their rule", () => {
    const practice = rule("public/styles/pages/daily-check-in.css", ".practice");

    assert.match(practice, /margin-block-end:\s*var\(--space-5\)/);
    assert.ok(px("--space-5") >= 24 && px("--space-5") <= 40, "sibling chapters sit 24-40px apart");
  });

  it("leaves no owner separating related content by the widest band", () => {
    const offenders = [];
    for (const relative of allSourceStyles()) {
      const css = read(relative);
      for (const [, selector, body] of css.matchAll(/(^|\n)([^{}\n@][^{}]*)\{([^}]*)\}/g)) {
        if (!/margin-block-end:\s*var\(--gap-region\)/.test(body)) continue;
        if (/(title|lede|label|head-eyebrow|button|field|row)\b/.test(selector)) {
          offenders.push(`${relative}: ${selector.trim()}`);
        }
      }
    }
    assert.deepEqual(offenders, [], "the region band is for regions only");
  });
});

describe("grouping uses one method per region", () => {
  it("does not nest a bordered panel directly inside a bordered panel", () => {
    for (const relative of allSourceStyles()) {
      const css = read(relative);
      assert.doesNotMatch(
        css,
        /\.surface-panel\s+\.surface-panel\s*\{[^}]*border:\s*1px/,
        `${relative} nests bordered cards`,
      );
    }
  });

  it("forces no panel to match a taller neighbour's height", () => {
    const offenders = [];
    for (const relative of allSourceStyles()) {
      const css = read(relative);
      for (const [, selector, body] of css.matchAll(/(^|\n)([^{}\n@][^{}]*)\{([^}]*)\}/g)) {
        if (/\bmin-height:\s*(?:3[2-9][0-9]|[4-9][0-9]{2})px/.test(body)) {
          offenders.push(`${relative}: ${selector.trim()}`);
        }
      }
    }
    assert.deepEqual(offenders, [], "blank space must not be reserved by a fixed height");
  });
});
