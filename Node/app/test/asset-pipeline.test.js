import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { pageBundles, sharedScripts, sharedStyles } from "../src/config/assetSources.js";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const publicDir = path.join(appRoot, "public");

const lineCount = (file) => readFileSync(path.join(publicDir, file), "utf8").split("\n").length;

const DASHBOARD_RATCHET = { file: "styles/home/dashboard.css", baseline: 1810 };

const MAX_STYLESHEET_LINES = 1600;

describe("asset pipeline", () => {
  it("drives development and production from one shared source", () => {
    const build = readFileSync(path.join(appRoot, "scripts", "build-assets.js"), "utf8");
    const locals = readFileSync(path.join(appRoot, "src", "middleware", "viewLocals.js"), "utf8");

    for (const [name, source] of [["build-assets.js", build], ["viewLocals.js", locals]]) {
      assert.match(source, /from "\.\.?\/(src\/)?config\/assetSources\.js"/, `${name} must import assetSources.js`);
      assert.doesNotMatch(source, /const (cssFiles|sourceStyles) = \[/, `${name} still declares its own style list`);
      assert.doesNotMatch(source, /const (pageBundles|sourcePageAssets) = \{/, `${name} still declares its own page bundles`);
    }
  });

  it("references only assets that exist on disk", () => {
    const everyAsset = [
      ...sharedStyles,
      ...sharedScripts,
      ...Object.values(pageBundles).flatMap((bundle) => [
        ...(bundle.styles || []),
        ...(bundle.script ? [bundle.script] : []),
      ]),
    ];

    for (const asset of everyAsset) {
      assert.ok(existsSync(path.join(publicDir, asset)), `missing asset: ${asset}`);
    }
  });

  it("loads tokens before any layer that resolves them", () => {
    assert.equal(sharedStyles[0], "styles/variables.css");
  });

  it("builds a manifest that names every page bundle", () => {
    execFileSync("node", [path.join(appRoot, "scripts", "build-assets.js")], {
      cwd: appRoot,
      stdio: "pipe",
    });
    const manifest = JSON.parse(
      readFileSync(path.join(publicDir, "assets", "manifest.json"), "utf8"),
    );

    assert.ok(existsSync(path.join(publicDir, manifest.css.replace(/^\//, ""))));
    assert.ok(existsSync(path.join(publicDir, manifest.js.replace(/^\//, ""))));

    for (const [pageId, bundle] of Object.entries(pageBundles)) {
      const entry = manifest.pages[pageId];
      assert.ok(entry, `manifest is missing page bundle "${pageId}"`);
      if (bundle.styles?.length) {
        assert.ok(entry.css, `page bundle "${pageId}" is missing its stylesheet`);
        assert.ok(existsSync(path.join(publicDir, entry.css.replace(/^\//, ""))));
      }
      if (bundle.script) {
        assert.ok(entry.js, `page bundle "${pageId}" is missing its script`);
        assert.ok(existsSync(path.join(publicDir, entry.js.replace(/^\//, ""))));
      }
    }
  });

  it("keeps every stylesheet below the shared-dumping-ground threshold", () => {
    const styles = [...sharedStyles, ...Object.values(pageBundles).flatMap((b) => b.styles || [])];

    for (const file of styles) {
      if (file === DASHBOARD_RATCHET.file) continue;
      const lines = lineCount(file);
      assert.ok(
        lines <= MAX_STYLESHEET_LINES,
        `${file} is ${lines} lines, over the ${MAX_STYLESHEET_LINES}-line limit`,
      );
    }
  });

  it("shrinks the legacy dashboard stylesheet and never regrows it", () => {
    if (!existsSync(path.join(publicDir, DASHBOARD_RATCHET.file))) return; // fully split
    const lines = lineCount(DASHBOARD_RATCHET.file);

    assert.ok(
      lines <= DASHBOARD_RATCHET.baseline,
      `${DASHBOARD_RATCHET.file} grew to ${lines} lines from its ${DASHBOARD_RATCHET.baseline}-line baseline; ` +
        "split a page out of it instead of adding to it",
    );
  });
});
