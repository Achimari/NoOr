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

    assert.match(variables, /--canvas:\s*#fcfcfa/i);
    assert.match(variables, /--paper:\s*#ffffff/i);
    assert.match(variables, /--paper-muted:\s*#f2f2ef/i);
    assert.match(variables, /--surface:\s*var\(--paper\)/i);
    assert.match(variables, /--surface-subtle:\s*var\(--paper-muted\)/i);
    assert.match(variables, /--ink:\s*#111111/i);
    assert.match(variables, /--ink-secondary:\s*var\(--ink-muted\)/i);
    assert.match(variables, /--separator:\s*var\(--rule\)/i);
    assert.match(variables, /--brand:\s*#315f73/i);
    assert.match(variables, /--brand-hover:\s*#244b5c/i);
  });

  it("keeps the approved semantic Yes/No colours", () => {
    const variables = read("public/styles/variables.css");

    assert.match(variables, /--success:\s*#14713c/i);
    assert.match(variables, /--danger:\s*#b3261e/i);
  });

  it("sets the whole interface in one visible family", () => {
    const variables = read("public/styles/variables.css");

    // Achimari Hand is named once and every role follows it. `cursive` sits
    // behind it for a failed load or a glyph the face does not draw; it is a
    // generic fallback, not a companion typeface a reader would ever see.
    assert.match(variables, /--font-brand:\s*"Achimari Hand",\s*cursive/);

    for (const role of ["--font-display", "--font-ui", "--font-body", "--font-reading", "--font-data"]) {
      assert.match(
        variables,
        new RegExp(`${role}:\\s*var\\(--font-brand\\)`),
        `${role} must resolve to Achimari Hand, not to a second family`,
      );
    }

    assert.doesNotMatch(variables, /--font-system:/, "the system stack is no longer a typography role");
    assert.doesNotMatch(variables, /font-family:\s*"(?:Kitaro Road|Sagfield)"/);
    assert.doesNotMatch(variables, /url\([^)]*SF[- ]?Pro/i);
    assert.match(variables, /url\("\/fonts\/achimari-hand\/AchimariHand-Regular\.otf"\)/);
    assert.doesNotMatch(variables, /url\(["']?(?:https?:)?\/\//i);
  });

  it("keeps the accessible secondary ink and holds the quiet ink off text", () => {
    const variables = read("public/styles/variables.css");

    // #8a8a84 is 3.5:1 on white — a rule colour, not a text colour. The darker
    // secondary is 8.2:1, so small and image-adjacent copy clears roughly 7:1.
    assert.match(variables, /--ink-quiet:\s*#8a8a84/i);
    assert.match(variables, /--ink-secondary-strong:\s*#4f4f4a/i);
    assert.match(variables, /--ink-muted:\s*#5c5c58/i);
    assert.match(variables, /--ink-on-sky:\s*var\(--ink\)/);
  });

  it("publishes a type scale whose every step stays readable in a handwritten face", () => {
    const variables = read("public/styles/variables.css");
    const step = (name) => Number(variables.match(new RegExp(`${name}:\\s*([\\d.]+)rem`))[1]) * 16;

    assert.equal(step("--text-body"), 20, "long-form copy sits at 20px");
    assert.equal(step("--text-control"), 18, "ordinary copy, inputs and controls sit at 18px");
    assert.equal(step("--text-label"), 17, "labels and critical data sit at 17px");
    assert.equal(step("--text-micro"), 16, "nothing meaningful is set below this");
    assert.equal(step("--text-page-title"), 32, "a page title sits at 32px");
    assert.ok(step("--text-component") >= 20 && step("--text-component") <= 24);
  });

  it("publishes one weight, because the face ships one", () => {
    const variables = read("public/styles/variables.css");

    assert.match(variables, /--weight-body:\s*400/);
    for (const retired of ["--weight-medium", "--weight-semibold", "--weight-strong"]) {
      assert.doesNotMatch(variables, new RegExp(`${retired}:`), `${retired} promises a weight that does not exist`);
    }
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
