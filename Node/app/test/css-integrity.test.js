import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
