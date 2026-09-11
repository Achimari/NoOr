import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFileSync(path.join(appRoot, relative), "utf8");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const material = () => read("public/styles/components/material.css");
const variables = () => read("public/styles/variables.css");
const token = (name) => {
  const match = variables().match(new RegExp(`${name}:\\s*([^;]+);`));
  return match ? match[1].trim() : null;
};
const ruleFor = (selector) => {
  const match = material().match(new RegExp(`(^|\\n)${selector}\\s*\\{[^}]*\\}`));
  return match ? match[0] : null;
};

describe("the sticker is a label applied to the page", () => {
  it("publishes the sticker material as shared tokens", () => {
    for (const name of [
      "--sticker-bg",
      "--sticker-edge",
      "--sticker-edge-strong",
      "--sticker-shadow",
      "--sticker-shadow-hover",
      "--sticker-radius",
    ]) {
      assert.ok(token(name), `${name} must be a shared token`);
    }

    // A sticker is white paper on white paper. It is read by its edge and the
    // shadow under it, never by being a different colour.
    assert.equal(token("--sticker-bg"), "#ffffff");

    const radius = Number(token("--sticker-radius").replace("px", ""));
    assert.ok(radius >= 8 && radius <= 12,
      `a label has a small radius; a SaaS card has a big one, got ${radius}px`);
  });

  it("keeps the contact shadow close to the page rather than floating the card", () => {
    // Every blur radius in the resting shadow stays small: a wide soft shadow
    // is a floating dashboard card, not a label lying on a sheet.
    const blurs = [...token("--sticker-shadow").matchAll(/(?:0|[\d.]+px)\s+(?:0|[\d.]+px)\s+([\d.]+)px/g)]
      .map((m) => Number(m[1]));
    assert.ok(blurs.length > 0, "the resting shadow must exist");
    for (const blur of blurs) {
      assert.ok(blur <= 14, `a ${blur}px blur floats the sticker off the page`);
    }
  });

  it("defines exactly one sticker primitive, in the shared material layer", () => {
    const base = ruleFor("\\.sticker-surface");
    assert.ok(base, ".sticker-surface must exist in material.css");

    assert.match(base, /background:\s*var\(--sticker-bg\)/, "a sticker masks the rules beneath it");
    assert.match(base, /border:\s*1px solid var\(--sticker-edge\)/, "a sticker has a fine physical edge");
    assert.match(base, /border-radius:\s*var\(--sticker-radius\)/);
    assert.match(base, /box-shadow:\s*var\(--sticker-shadow\)/, "a sticker rests on the page");

    for (const relative of allStyles()) {
      if (relative.endsWith("components/material.css")) continue;
      assert.doesNotMatch(read(relative), /\.sticker-surface\s*\{/,
        `${relative} redefines the sticker primitive`);
    }
  });

  it("never turns an entire element type into a sticker", () => {
    // The Wave 1 defect was a large opaque region with no reason to exist.
    // A sticker is opt-in on an audited component and nothing else.
    for (const relative of allStyles()) {
      const css = stripComments(read(relative));
      for (const [rule] of css.matchAll(/[^{}]*\{[^}]*\}/g)) {
        if (!/var\(--sticker-bg\)|var\(--sticker-shadow\)/.test(rule)) continue;
        const selectors = rule.slice(0, rule.indexOf("{"));
        assert.doesNotMatch(selectors, /(^|[\s,>])(section|article|div|main|li|ul|ol)(\s*[,{]|\s*$)/,
          `${relative} makes a bare element a sticker: ${selectors.trim()}`);
        assert.doesNotMatch(selectors, /\*/, `${relative} stickers everything: ${selectors.trim()}`);
      }
    }
  });
});

describe("stickers are applied only where a record exists", () => {
  const views = () => {
    const files = [];
    const roots = [path.join(appRoot, "src", "views")];
    while (roots.length) {
      const dir = roots.pop();
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) roots.push(full);
        else if (entry.name.endsWith(".ejs")) files.push(full);
      }
    }
    return files;
  };
  const markup = () => views().map((f) => readFileSync(f, "utf8")).join("\n");

  // Audited in the templates: each is a single record a person put on the page.
  const RECORDS = [
    "dashboard-actions",      // today's answer — the reason the page exists
    "prayer-item",            // one prayer carried through time
    "settings-group",         // a compact group of related controls
    "battle-setup",           // the one thing standing between you and a battle
    "auth-card",              // the form you arrive on
    "empty-state",            // a page not yet written
  ];

  // Audited and deliberately NOT stickers, with the reason, so the list cannot
  // quietly grow back: each already sits inside a surface of its own, and a
  // sticker inside a panel is a tray holding a label.
  const NOT_RECORDS = ["daily-goals-empty"];

  it("puts a sticker on every audited record", () => {
    const html = markup();
    for (const record of RECORDS) {
      const el = html.match(new RegExp(`class="(?:[^"]*\\s)?${record}(?:\\s[^"]*)?"`));
      assert.ok(el, `${record} is no longer rendered`);
      assert.match(el[0], /\bsticker-surface\b/, `${record} is a record but not a sticker`);
    }
  });

  it("keeps a sticker out of anything that already has a surface", () => {
    const html = markup();
    for (const name of NOT_RECORDS) {
      const el = html.match(new RegExp(`class="(?:[^"]*\\s)?${name}(?:\\s[^"]*)?"`));
      assert.ok(el, `${name} is no longer rendered`);
      assert.doesNotMatch(el[0], /\bsticker-surface\b/,
        `${name} sits inside a panel already; a sticker there is a tray holding a label`);
    }
  });

  it("leaves structure on the page rather than lifting it off", () => {
    // A list, a grid, a timeline or a column is not an object. Sticker one and
    // the page stops being a continuous sheet.
    const html = markup();
    for (const structural of [
      "battle-encounters",
      "weekday-chart",
      "explore-list",
      "achievements-next-list",
      "prayer-world-regions",
      "page-shell",
      "dashboard-container",
    ]) {
      for (const [el] of html.matchAll(new RegExp(`class="(?:[^"]*\\s)?${structural}(?:\\s[^"]*)?"`, "g"))) {
        assert.doesNotMatch(el, /\bsticker-surface\b/,
          `${structural} is structure, not a record: ${el}`);
      }
    }
  });

  it("never nests one sticker directly inside another", () => {
    for (const file of views()) {
      const html = readFileSync(file, "utf8");
      // A sticker holding stickers is a tray, and a tray is the Wave 1 defect.
      assert.doesNotMatch(html, /sticker-surface[^>]*>\s*<[^>]*sticker-surface/,
        `${path.relative(appRoot, file)} nests a sticker immediately inside a sticker`);
    }
  });

  it("only lets a sticker that does something look like it does", () => {
    const html = markup();
    for (const [el] of html.matchAll(/class="[^"]*sticker-surface--interactive[^"]*"/g)) {
      // Interactivity is a property of the control, not of the decoration.
      assert.ok(/\bsticker-surface\b/.test(el), "the modifier rides on the primitive");
    }

    // The resting sticker must not borrow the interactive affordances.
    const base = material().match(/(^|\n)\.sticker-surface\s*\{[^}]*\}/)[0];
    assert.doesNotMatch(base, /cursor:\s*pointer/, "a resting sticker must not imply a click");
    assert.doesNotMatch(base, /transition/, "a resting sticker must not animate");

    const hover = material().match(/\.sticker-surface:hover\s*\{/);
    assert.equal(hover, null, "only the interactive modifier may respond to hover");
  });

  it("gates every sticker hover behind a real pointer", () => {
    const css = stripComments(material());
    for (const [block, query] of css.matchAll(/@media([^{]*)\{(?:[^{}]|\{[^}]*\})*\}/g)) {
      if (!/\.sticker[^{]*:hover/.test(block)) continue;
      // A preference query that *switches hover motion off* is the fix, not the
      // fault; only a block that grants hover behaviour needs the pointer gate.
      if (/prefers-|forced-colors/.test(query)) continue;
      assert.match(query, /\(hover:\s*hover\)/, "a sticker hover must not stick after a tap");
    }

    // And nothing may grant hover outside a media query at all.
    const topLevel = css.replace(/@media[^{]*\{(?:[^{}]|\{[^}]*\})*\}/g, "");
    assert.equal(topLevel.match(/\.sticker[^{]*:hover/g), null,
      "an ungated sticker hover sticks after a tap on touch");
  });
});

describe("rotation is placement, not scatter", () => {
  it("uses fixed angles, never a runtime-generated one", () => {
    for (const name of ["--sticker-tilt-a", "--sticker-tilt-b"]) {
      const value = token(name);
      assert.ok(value, `${name} must be a fixed token`);
      const degrees = Math.abs(Number(value.replace("deg", "")));
      assert.ok(degrees <= 0.35, `${name} is ${degrees}deg — a visible tilt reads as scrapbook`);
      assert.ok(degrees > 0, `${name} must actually tilt`);
    }

    // Nothing may compute an angle at runtime.
    const scripts = [];
    const roots = [path.join(appRoot, "public", "scripts")];
    while (roots.length) {
      const dir = roots.pop();
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) roots.push(full);
        else if (entry.name.endsWith(".js")) scripts.push(full);
      }
    }
    for (const file of scripts) {
      const js = readFileSync(file, "utf8");
      const where = path.relative(appRoot, file);
      // The battle figures legitimately animate rotation; what must never exist
      // is a sticker angle decided at runtime.
      assert.doesNotMatch(js, /sticker/i, `${where} reaches into the sticker system`);
      assert.doesNotMatch(js, /rotate\([^)]*(?:Math\.random|random\()/i,
        `${where} generates a random rotation`);
    }
  });

  it("stops tilting on a narrow screen, where it reads as a mistake", () => {
    const css = stripComments(material());
    const narrow = css.match(/@media \(max-width:[^{]*\{(?:[^{}]|\{[^}]*\})*\}/g) || [];
    const guard = narrow.find((block) => /sticker-surface--tilt/.test(block));
    assert.ok(guard, "a narrow viewport must not be tilted");
    assert.match(guard, /transform:\s*none/, "the tilt must be removed, not reduced");
  });
});

describe("a sticker actually wins the cascade", () => {
  it("lets no component restate the surface the sticker owns", () => {
    // material.css loads before every page bundle, so a component that still
    // declares its own border-radius, background or shadow silently overrides
    // the sticker at equal specificity and the label stops looking applied.
    const OWNED = /(?:^|;|\{)\s*(border-radius|box-shadow|background(?:-color)?|border)\s*:/;

    const stickered = new Set();
    const roots = [path.join(appRoot, "src", "views")];
    while (roots.length) {
      const dir = roots.pop();
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { roots.push(full); continue; }
        if (!entry.name.endsWith(".ejs")) continue;
        for (const [, cls] of readFileSync(full, "utf8")
          .matchAll(/class="([^"]*\bsticker-surface\b[^"]*)"/g)) {
          for (const name of cls.split(/\s+/)) {
            if (name && !name.startsWith("sticker-")) stickered.add(name);
          }
        }
      }
    }
    assert.ok(stickered.size > 0, "no stickered components found");

    const offenders = [];
    for (const relative of allStyles()) {
      if (relative.endsWith("components/material.css")) continue;
      const css = stripComments(read(relative));
      for (const [rule] of css.matchAll(/[^{}]*\{[^}]*\}/g)) {
        const head = rule.slice(0, rule.indexOf("{"));
        const body = rule.slice(rule.indexOf("{") + 1);
        for (const name of stickered) {
          // only the component's own base rule, not a descendant or a state
          if (!new RegExp(`(^|[\\s,])\\.${name}\\s*$`).test(head.trim())) continue;
          if (OWNED.test(body)) {
            offenders.push(`${relative}: .${name} restates ${body.match(OWNED)[1]}`);
          }
        }
      }
    }
    assert.deepEqual(offenders, [], `the sticker loses to its own component:\n${offenders.join("\n")}`);
  });
});

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
  return files;
}
