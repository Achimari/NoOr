import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const fontsDir = path.join(appRoot, "public", "fonts");
const read = (relative) => readFileSync(path.join(appRoot, relative), "utf8");

function allSourceStyles() {
  const files = [];
  const pending = [path.join(appRoot, "public", "styles")];
  while (pending.length) {
    const dir = pending.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) pending.push(full);
      else if (entry.name.endsWith(".css")) files.push(full);
    }
  }
  return files;
}

function allFontFaceBlocks() {
  const blocks = [];
  for (const file of allSourceStyles()) {
    const css = readFileSync(file, "utf8");
    for (const [block] of css.matchAll(/@font-face\s*\{[^}]*\}/g)) {
      blocks.push({ file: path.relative(appRoot, file), block });
    }
  }
  return blocks;
}

const ACHIMARI_HAND_SURFACES = [
  "public/styles/shell.css",
  "public/styles/globals.css",
  "public/styles/components/brand.css",
  "public/styles/components/buttons.css",
  "public/styles/components/fields.css",
  "public/styles/components/lists.css",
  "public/styles/components/tables.css",
  "public/styles/components/feed.css",
  "public/styles/components/status.css",
  "public/styles/components/dialogs.css",
  "public/styles/components/reading-modal.css",
  "public/styles/header/base.css",
  "public/styles/header/responsive.css",
  "public/styles/pages/daily-check-in.css",
  "public/styles/pages/statistics.css",
  "public/styles/pages/prayers.css",
  "public/styles/pages/community.css",
  "public/styles/game/battle.css",
  "public/styles/home/dashboard.css",
];

describe("one hand across the product", () => {
  it("resolves every type role to Achimari Hand", () => {
    const variables = read("public/styles/variables.css");

    for (const role of ["--font-ui", "--font-display", "--font-body", "--font-reading"]) {
      assert.match(variables, new RegExp(`${role}:\\s*"Achimari Hand", var\\(--font-system\\)`));
    }
  });

  it("keeps a real system stack behind it for glyphs Achimari Hand lacks", () => {
    const variables = read("public/styles/variables.css");
    const system = variables.match(/--font-system:([^;]*);/)[1];

    assert.match(system, /-apple-system/);
    assert.match(system, /sans-serif\s*$/);
  });

  it("asks the browser for no weight or style the file does not contain", () => {
    assert.match(
      read("public/styles/globals.css"),
      /body\s*\{[^}]*font-synthesis:\s*none/s,
      "a single-face family must never be faked into bold or italic",
    );

    const offenders = [];
    for (const relative of ACHIMARI_HAND_SURFACES) {
      for (const [declaration] of read(relative).matchAll(/font-weight:\s*([^;]+);/g)) {
        if (!/\b400\b|normal|inherit/.test(declaration)) offenders.push(`${relative}: ${declaration.trim()}`);
      }
    }
    assert.deepEqual(offenders, [], "Achimari Hand ships Regular only; hierarchy comes from size and tone");
  });

  it("requests no font feature Achimari Hand does not ship", () => {
    const offenders = ACHIMARI_HAND_SURFACES.filter((relative) => /tabular-nums/.test(read(relative)));
    assert.deepEqual(offenders, [], "tabular-nums does nothing in this family");
  });

  it("never sets negative tracking on the marker hand", () => {
    const offenders = [];
    for (const relative of ACHIMARI_HAND_SURFACES) {
      for (const [declaration, value] of read(relative).matchAll(/letter-spacing:\s*(-[\d.]+)e?m?/g)) {
        offenders.push(`${relative}: ${declaration.trim()}`);
      }
    }
    assert.deepEqual(offenders, [], "negative tracking collides a marker face's strokes");
  });

  it("uses Achimari Hand in the active battle arena too", () => {
    const globals = read("public/styles/globals.css");
    const arena = globals.match(/\.battle-active\s*\{([^}]*)\}/)[1];

    assert.match(arena, /--font-ui:\s*"Achimari Hand",\s*var\(--font-system\)/);
    assert.match(arena, /--font-display:\s*"Achimari Hand",\s*var\(--font-system\)/);
    assert.match(arena, /font-family:\s*var\(--font-ui\)/);
    assert.match(arena, /font-synthesis:\s*none/, "the arena must not invent unshipped weights");
  });

  it("keeps a readable floor for functional text", () => {
    const variables = read("public/styles/variables.css");
    const micro = Number(variables.match(/--text-micro:\s*([\d.]+)rem/)[1]) * 16;

    assert.ok(micro >= 14, `functional text must not drop below 14px, got ${micro}px`);
  });
});

describe("webfont delivery gate", () => {
  it("self-hosts the generated Achimari Hand CFF/OpenType face", () => {
    const variables = read("public/styles/variables.css");
    const fontPath = path.join(fontsDir, "achimari-hand", "AchimariHand-Regular.otf");

    assert.match(
      variables,
      /@font-face\s*\{[^}]*font-family:\s*"Achimari Hand";[^}]*src:\s*url\("\/fonts\/achimari-hand\/AchimariHand-Regular\.otf"\)\s*format\("opentype"\);[^}]*font-weight:\s*400;[^}]*font-style:\s*normal;[^}]*font-display:\s*swap;[^}]*\}/s,
    );
    assert.ok(existsSync(fontPath));
    assert.equal(readFileSync(fontPath).subarray(0, 4).toString("ascii"), "OTTO");
    assert.doesNotMatch(variables, /font-family:\s*"(?:Kitaro Road|Sagfield)"/);
  });

  it("ships no @font-face that points at a file the repository does not have", () => {
    for (const { file, block } of allFontFaceBlocks()) {
      for (const [, url] of block.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
        assert.ok(url.startsWith("/fonts/"), `${file} must self-host from /fonts/, got ${url}`);
        assert.ok(
          existsSync(path.join(appRoot, "public", url.replace(/^\//, "").split("?")[0])),
          `${file} declares ${url}, which is not present in the repository`,
        );
      }
    }
  });

  it("uses font-display: swap on every declared face", () => {
    for (const { file, block } of allFontFaceBlocks()) {
      assert.match(block, /font-display:\s*swap/, `${file} must not block first paint`);
    }
  });

  it("requests no font from a third-party origin", () => {
    const hosts = /fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit|fontspace|cdnjs|jsdelivr|unpkg/i;

    for (const file of allSourceStyles()) {
      assert.doesNotMatch(readFileSync(file, "utf8"), hosts, `${path.relative(appRoot, file)} loads a remote font`);
    }
    const views = [];
    const pending = [path.join(appRoot, "src", "views")];
    while (pending.length) {
      const dir = pending.pop();
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) pending.push(full);
        else if (entry.name.endsWith(".ejs")) views.push(full);
      }
    }
    for (const file of views) {
      assert.doesNotMatch(readFileSync(file, "utf8"), hosts, `${path.relative(appRoot, file)} loads a remote font`);
    }
  });

  it("preloads only a face that actually exists", () => {
    const views = [];
    const pending = [path.join(appRoot, "src", "views")];
    while (pending.length) {
      const dir = pending.pop();
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) pending.push(full);
        else if (entry.name.endsWith(".ejs")) views.push(full);
      }
    }
    for (const file of views) {
      const markup = readFileSync(file, "utf8");
      for (const [, href] of markup.matchAll(/<link[^>]+as="font"[^>]*href="([^"]+)"/g)) {
        assert.ok(
          existsSync(path.join(appRoot, "public", href.replace(/^\//, ""))),
          `${path.relative(appRoot, file)} preloads ${href}, which does not exist`,
        );
      }
    }
  });

  it("preloads Achimari Hand in both document shells", () => {
    const preload = /<link\s+rel="preload"\s+href="\/fonts\/achimari-hand\/AchimariHand-Regular\.otf"\s+as="font"\s+type="font\/otf"\s+crossorigin\s*\/>/;

    assert.match(read("src/views/components/layout/document.ejs"), preload);
    assert.match(read("src/views/components/layout/auth-document.ejs"), preload);
  });

  it("records provenance beside the font directory", () => {
    const readmePath = path.join(fontsDir, "README.md");
    assert.ok(existsSync(readmePath), "public/fonts must carry a provenance note");

    const readme = readFileSync(readmePath, "utf8");
    assert.match(readme, /Achimari Hand/);
    assert.match(readme, /supplied specimen/i);
    assert.match(readme, /SIL Open Font License/i, "the derivative's licence must be recorded");

    assert.doesNotMatch(readme, /receipt|order\s*#|serial|licen[cs]e\s*key/i);
  });

  it("keeps the generated-file state of the branded family honest", () => {
    const readme = readFileSync(path.join(fontsDir, "README.md"), "utf8");
    const declared = allFontFaceBlocks()
      .map(({ block }) => (block.match(/font-family:\s*["']([^"']+)["']/) || [])[1])
      .filter(Boolean);

    const family = "Achimari Hand";
    const supplied = declared.includes(family);
    const dir = path.join(fontsDir, "achimari-hand");
    assert.equal(supplied, existsSync(dir) && readdirSync(dir).includes("AchimariHand-Regular.otf"));
    assert.match(readme, /Achimari Hand[\s\S]{0,400}?Generated/i);
  });
});
