import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const publicDir = path.join(appRoot, "public");
const read = (relative) => readFileSync(path.join(appRoot, relative), "utf8");

function allSourceStyles() {
  const roots = [path.join(publicDir, "styles")];
  const files = [];
  while (roots.length) {
    const dir = roots.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) roots.push(full);
      else if (entry.name.endsWith(".css")) files.push(full);
    }
  }
  return files;
}

function buildManifest() {
  const manifestPath = path.join(publicDir, "assets", "manifest.json");
  if (!existsSync(manifestPath)) {
    execFileSync("node", [path.join(appRoot, "scripts", "build-assets.js")], {
      cwd: appRoot,
      stdio: "pipe",
    });
  }
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

describe("Quiet Light design tokens", () => {
  it("defines the approved semantic surface and ink roles", () => {
    const variables = read("public/styles/variables.css");

    // Monochrome Press, 2026-09-12: white paper and black ink replace the
    // mineral sheet and the graphite. `test/ink-on-paper.test.js` computes the
    // contrast ratios and proves the whole system is neutral; this suite pins
    // the token architecture around those values.
    assert.match(variables, /--paper:\s*#ffffff/i);
    assert.match(variables, /--paper-raised:\s*var\(--paper\)/i);
    assert.match(variables, /--paper-muted:\s*#f2f2f2/i);
    assert.match(variables, /--canvas:\s*var\(--paper\)/i);
    assert.match(variables, /--field:\s*#000000/i);
    assert.match(variables, /--surface:\s*var\(--paper\)/i);
    assert.match(variables, /--surface-subtle:\s*var\(--paper-muted\)/i);
    assert.match(variables, /--ink:\s*#000000/i);
    assert.match(variables, /--ink-secondary:\s*var\(--ink-muted\)/i);
    assert.match(variables, /--separator:\s*var\(--rule\)/i);

    // Filled actions remain black; green and red are reserved for state.
    assert.match(variables, /--accent:\s*var\(--ink\)/i);
    assert.match(variables, /--action:\s*var\(--ink\)/i);
    assert.match(variables, /--action-hover:\s*var\(--ink-raised\)/i);
    assert.match(variables, /--brand:\s*var\(--ink\)/i);
    assert.match(variables, /--brand-hover:\s*var\(--ink-raised\)/i);
  });

  it("keeps green Yes and red No semantic roles with their own state rules", () => {
    const variables = read("public/styles/variables.css");

    assert.match(variables, /--success:\s*#1d704e/i);
    assert.match(variables, /--danger:\s*#b73535/i);
    assert.match(variables, /--success-line:\s*var\(--success\)/i);
    assert.match(variables, /--danger-line:\s*var\(--danger\)/i);
  });

  it("sets each role in the family that role is for", () => {
    const variables = read("public/styles/variables.css");

    // Sacred Press, 2026-09-11: four semantic roles across three self-hosted
    // OFL families. The single-handwritten-family rule this replaces is
    // recorded as superseded in CONSTRAINTS.md.
    assert.match(variables, /--font-display:\s*"Unbounded",/);
    assert.match(variables, /--font-ui:\s*"IBM Plex Sans Condensed",/);
    assert.match(variables, /--font-body:\s*"IBM Plex Sans",/);
    assert.match(variables, /--font-data:\s*"IBM Plex Mono",/);
    assert.match(variables, /--font-reading:\s*var\(--font-body\)/);

    assert.doesNotMatch(variables, /--font-brand:/, "the one-family token is retired");
    assert.doesNotMatch(variables, /--font-system:/, "the system stack is not a typography role");
    assert.doesNotMatch(variables, /Achimari Hand/, "the handwritten face is in no role");
    assert.doesNotMatch(variables, /font-family:\s*"(?:Kitaro Road|Sagfield)"/);
    assert.doesNotMatch(variables, /url\([^)]*SF[- ]?Pro/i);
    assert.doesNotMatch(variables, /url\(["']?(?:https?:)?\/\//i, "every face is same-origin");

    // Seven faces, every one of them served from this repository.
    const sources = [...variables.matchAll(/src:\s*url\("([^"]+)"\)/g)].map(([, url]) => url);
    assert.equal(sources.length, 7);
    for (const url of sources) {
      assert.match(url, /^\/fonts\/.+\.woff2$/, `${url} must be a local WOFF2`);
      assert.ok(existsSync(path.join(publicDir, url.replace(/^\//, ""))), `${url} must exist`);
    }
  });

  it("keeps the accessible secondary ink and holds the quiet ink off text", () => {
    const variables = read("public/styles/variables.css");

    // --ink-quiet is deliberately below the text floor on paper: it is a rule
    // and divider colour, and ink-on-paper.test.js proves nothing sets text in
    // it. The two secondary inks both clear AA on every paper step.
    assert.match(variables, /--ink-quiet:\s*#8a8a8a/i);
    assert.match(variables, /--ink-secondary-strong:\s*#333333/i);
    assert.match(variables, /--ink-muted:\s*#525252/i);
    assert.doesNotMatch(variables, /--ink-on-sky:/, "the sky is retired, and so is the ink role that floated on it");
  });

  it("publishes a type scale with real contrast between its steps", () => {
    const variables = read("public/styles/variables.css");
    const step = (name) => Number(variables.match(new RegExp(`${name}:\\s*([\\d.]+)rem`))[1]) * 16;

    assert.equal(step("--text-body"), 17, "long-form copy sits at 17px");
    assert.equal(step("--text-control"), 16, "interface copy, inputs and controls sit at 16px");
    assert.equal(step("--text-label"), 15, "labels sit at 15px");
    assert.equal(step("--text-meta"), 14, "dates, timers and metadata sit at 14px");
    assert.equal(step("--text-mark"), 13, "the mono margin mark is the floor");
    assert.ok(step("--text-component") >= 18 && step("--text-component") <= 24);

    // The old scale ran 16/17/18/20 — four steps inside four pixels, which is
    // no hierarchy at all. Every adjacent pair must now actually differ, and
    // the span from the floor to the figure must be a real ratio.
    const ramp = ["--text-mark", "--text-meta", "--text-label", "--text-control", "--text-body"].map(step);
    for (let i = 1; i < ramp.length; i += 1) {
      assert.ok(ramp[i] > ramp[i - 1], "every step in the ramp must be larger than the one below it");
    }
    assert.ok(step("--text-figure") / step("--text-body") >= 2, "a major figure towers over body copy");
  });

  it("publishes only weights the shipped faces can draw", () => {
    const variables = read("public/styles/variables.css");

    assert.match(variables, /--weight-body:\s*400/);
    assert.match(variables, /--weight-strong:\s*600/, "IBM Plex ships a real 600 here");
    assert.match(variables, /--weight-display:\s*700/);
    assert.match(variables, /--weight-display-heavy:\s*800/);

    // 500 was never shipped by any face in this repository, and asking for it
    // is how a synthesised weight creeps back in.
    assert.doesNotMatch(variables, /--weight-medium:/, "--weight-medium promises a weight nothing ships");
  });
});

describe("no third-party webfont", () => {
  it("has no Google Fonts request in any stylesheet source", () => {
    for (const file of allSourceStyles()) {
      const css = readFileSync(file, "utf8");
      assert.doesNotMatch(
        css,
        /fonts\.googleapis\.com|fonts\.gstatic\.com/,
        `${path.relative(appRoot, file)} still requests a Google font`,
      );
    }
  });

  it("has no Google Fonts request or preconnect in any view", () => {
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

    for (const file of views) {
      const markup = readFileSync(file, "utf8");
      assert.doesNotMatch(
        markup,
        /fonts\.googleapis\.com|fonts\.gstatic\.com/,
        `${path.relative(appRoot, file)} still references Google Fonts`,
      );
    }
  });

  it("emits no Google Fonts request in the built CSS bundle", () => {
    const manifest = buildManifest();
    const bundle = readFileSync(path.join(publicDir, manifest.css.replace(/^\//, "")), "utf8");

    assert.doesNotMatch(bundle, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
    assert.doesNotMatch(bundle, /Manrope/);
  });
});
