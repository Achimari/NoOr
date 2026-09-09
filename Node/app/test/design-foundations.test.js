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

  it("writes the whole interface in one hand, with a system Unicode fallback", () => {
    const variables = read("public/styles/variables.css");

    for (const role of ["--font-ui", "--font-display", "--font-body", "--font-reading"]) {
      assert.match(
        variables,
        new RegExp(`${role}:\\s*"Achimari Hand", var\\(--font-system\\)`),
        `${role} must resolve to Achimari Hand, then the system fallback`,
      );
    }
    assert.match(variables, /--font-system:\s*-apple-system/);

    assert.doesNotMatch(variables, /font-family:\s*"(?:Kitaro Road|Sagfield)"/);

    assert.doesNotMatch(variables, /url\([^)]*SF[- ]?Pro/i);
    assert.match(variables, /url\("\/fonts\/achimari-hand\/AchimariHand-Regular\.otf"\)/);
    assert.doesNotMatch(variables, /url\(["']?(?:https?:)?\/\//i);
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
