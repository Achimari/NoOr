import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { pageBundles, sharedStyles } from "../src/config/assetSources.js";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const publicDir = path.join(appRoot, "public");

const registeredStyles = [
  ...sharedStyles,
  ...Object.values(pageBundles).flatMap((bundle) => bundle.styles || []),
];

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const readApp = (file) => readFileSync(path.join(appRoot, file), "utf8");

// Every place markup is produced: server templates and browser scripts.
function producerSources() {
  const roots = ["src/views", "public/scripts"].map((dir) => path.join(appRoot, dir));
  return roots.flatMap((root) =>
    readdirSync(root, { recursive: true })
      .filter((file) => /\.(ejs|js)$/.test(file))
      .map((file) => ({ file: path.relative(appRoot, path.join(root, file)), source: readFileSync(path.join(root, file), "utf8") })),
  );
}

function registeredSheetsDeclaring(selector) {
  return registeredStyles.filter((file) => selector.test(stripComments(readFileSync(path.join(publicDir, file), "utf8"))));
}

/*
 * home/hero.css and components/dialogs.css were removed on 2026-09-13
 * (docs/code-cleanup). The generic integrity loop above stopped generating
 * their two checks each; these guards replace them by keeping the retired
 * implementations out and proving their replacements are still in place.
 */
describe("retired hero and generic dialog layers", () => {
  it("keeps the old landing hero out of the asset pipeline and every producer", () => {
    assert.equal(registeredStyles.includes("styles/home/hero.css"), false, "hero.css must not be registered again");
    assert.equal(existsSync(path.join(publicDir, "styles/home/hero.css")), false, "hero.css must not return to the source tree");
    assert.deepEqual(registeredSheetsDeclaring(/(?<![\w-])\.hero(?:-[\w-]+)?(?![\w-])/), [], "no registered sheet may restyle .hero*");
    assert.deepEqual(
      producerSources().filter(({ source }) => /class=["'`][^"'`]*(?<![\w-])hero(?:-[\w-]+)?(?![\w-])/.test(source)).map(({ file }) => file),
      [],
      "no template or script may emit a .hero* class",
    );
  });

  it("lets Today own its opening through its own page bundle", () => {
    const today = readApp("src/views/pages/partials/home-content.ejs");
    assert.match(today, /class="page-opening today-opening"/);
    assert.match(today, /<h1 class="page-head-title today-title">Today<\/h1>/);
    assert.ok(pageBundles["daily-check-in"].styles.includes("styles/pages/daily-check-in.css"));
    assert.match(readFileSync(path.join(publicDir, "styles/pages/daily-check-in.css"), "utf8"), /\.today-page \.today-opening\s*{/);
  });

  it("keeps the generic ui-dialog layer out of the asset pipeline and every producer", () => {
    assert.equal(registeredStyles.includes("styles/components/dialogs.css"), false, "dialogs.css must not be registered again");
    assert.equal(existsSync(path.join(publicDir, "styles/components/dialogs.css")), false, "dialogs.css must not return to the source tree");
    assert.deepEqual(registeredSheetsDeclaring(/(?<![\w-])\.ui-dialog(?:-[\w-]+)?(?![\w-])/), [], "no registered sheet may restyle .ui-dialog*");
    assert.deepEqual(
      producerSources().filter(({ source }) => /(?<![\w-])ui-dialog(?:-[\w-]+)?(?![\w-])/.test(source)).map(({ file }) => file),
      [],
      "no template or script may emit a .ui-dialog* class",
    );
  });

  it("gives every current dialog a producer, a stylesheet its page loads, and a close call in the document Escape handler", () => {
    const app = readApp("public/scripts/app.js");
    const escapeBlock =
      app.match(/if \(event\.key === "Escape"\) \{\s*closePrayerActionsMenu\(\{ restoreFocus: true \}\);[\s\S]*?\n  \}/)?.[0] || "";
    const dialogs = [
      ["reading-modal-dialog", "src/views/pages/partials/reading-modal.ejs", "styles/components/reading-modal.css", ["daily-check-in", "settings"], ["closeReadingModal"]],
      ["missed-answer-dialog", "src/views/pages/partials/catch-up.ejs", "styles/pages/daily-check-in.css", ["daily-check-in"], ["closeCatchUpAnswerModal"]],
      ["catch-up-tasks-dialog", "src/views/pages/partials/catch-up.ejs", "styles/pages/daily-check-in.css", ["daily-check-in"], ["closeCatchUpTasksModal"]],
      ["settings-confirm-dialog", "public/scripts/app.js", "styles/home/dashboard.css", [], ["closeSettingsAnswerConfirmModal", "closeSettingsReadingConfirmModal"]],
      ["prayer-reaction-dialog", "public/scripts/app.js", "styles/home/dashboard.css", [], ["closeReactionChooser"]],
    ];

    assert.notEqual(escapeBlock, "", "app.js keeps its document-level Escape handler");
    for (const [className, producer, sheet, pages, closers] of dialogs) {
      assert.match(readApp(producer), new RegExp(`class="${className}" role="dialog" aria-modal="true"`), `${producer} renders .${className} as a modal dialog`);
      const loaded = pages.length
        ? pages.every((page) => pageBundles[page].styles.includes(sheet))
        : sharedStyles.includes(sheet);
      assert.ok(loaded, `${sheet} must be loaded wherever .${className} appears`);
      assert.match(stripComments(readFileSync(path.join(publicDir, sheet), "utf8")), new RegExp(`\\.${className}\\s*[{,]`), `${sheet} styles .${className}`);
      for (const closer of closers) assert.match(escapeBlock, new RegExp(`${closer}\\(\\);`), `Escape closes .${className}`);
    }
  });
});

function scanBlocks(css) {
  const depths = [];
  const strays = [];
  let depth = 0;
  let line = 1;
  let index = 0;

  while (index < css.length) {
    const character = css[index];

    if (character === "\n") { line += 1; index += 1; continue; }

    if (character === "/" && css[index + 1] === "*") {
      const end = css.indexOf("*/", index + 2);
      const stop = end === -1 ? css.length : end + 2;
      line += css.slice(index, stop).split("\n").length - 1;
      index = stop;
      continue;
    }

    if (character === '"' || character === "'") {
      index += 1;
      while (index < css.length && css[index] !== character) {
        if (css[index] === "\\") index += 1;
        if (css[index] === "\n") line += 1;
        index += 1;
      }
      index += 1;
      continue;
    }

    if (character === "{") { depth += 1; depths.push(line); index += 1; continue; }

    if (character === "}") {
      if (depth === 0) strays.push(line);
      else { depth -= 1; depths.pop(); }
      index += 1;
      continue;
    }

    index += 1;
  }

  return { depth, strays, unclosed: depths };
}

function findOrphanDeclarations(css) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const orphans = [];
  let depth = 0;

  for (const rawLine of withoutComments.split("\n")) {
    const line = rawLine.trim();
    const opens = (line.match(/{/g) || []).length;
    const closes = (line.match(/}/g) || []).length;

    if (depth === 0 && opens === 0 && /^[a-z-]+\s*:/i.test(line) && line.endsWith(";")) {
      orphans.push(line);
    }

    depth += opens - closes;
    if (depth < 0) depth = 0;
  }

  return orphans;
}

describe("stylesheet integrity", () => {
  it("registers at least every shared and page stylesheet", () => {
    assert.ok(registeredStyles.length >= 20, "asset sources should register the full style layer");
  });

  for (const file of registeredStyles) {
    it(`${file} has balanced blocks`, () => {
      const css = readFileSync(path.join(publicDir, file), "utf8");
      const { depth, strays, unclosed } = scanBlocks(css);

      assert.deepEqual(
        strays,
        [],
        `${file} has a closing brace with no matching block at line(s) ${strays.join(", ")}`,
      );
      assert.equal(
        depth,
        0,
        `${file} leaves ${depth} block(s) unclosed, opened at line(s) ${unclosed.join(", ")}`,
      );
    });

    it(`${file} has no declaration outside a block`, () => {
      const css = readFileSync(path.join(publicDir, file), "utf8");
      assert.deepEqual(
        findOrphanDeclarations(css),
        [],
        `${file} declares a property outside any rule`,
      );
    });
  }

  it("keeps the decorative earned-seal shine behind a preference query", () => {
    const css = readFileSync(path.join(publicDir, "styles/game/achievements.css"), "utf8");
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const topLevel = withoutComments
      .split("\n")
      .reduce((state, rawLine) => {
        const line = rawLine.trim();
        if (state.depth === 0 && line.includes('.ach-seal[data-status="EARNED"]::after') && line.includes("display: none")) {
          state.found.push(line);
        }
        state.depth += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
        if (state.depth < 0) state.depth = 0;
        return state;
      }, { depth: 0, found: [] });

    assert.deepEqual(topLevel.found, [], "the earned seal's shine is disabled unconditionally");
  });
});
