import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const appRoot = root;
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const footerView = read("src/views/components/layout/footer.ejs");
const footerCss = read("public/styles/home/footer.css");

describe("retired footer-water feature", () => {
  it("renders the compact footer directly without a decorative media band", () => {
    assert.match(footerView, /^<section class="section footer-info">/);
    assert.doesNotMatch(footerView, /footer-ending|footer-water|data-app-water/);
    assert.doesNotMatch(footerView, /<video|ambient-water\.(?:webm|mp4|jpg)/);
  });

  it("restores footer ownership of bottom alignment and keeps the black rule", () => {
    const footerRule = footerCss.match(/\.section\.footer-info\s*{([\s\S]*?)\n}/)?.[1] || "";

    assert.match(footerRule, /margin-top:\s*auto/);
    assert.match(footerRule, /background:\s*var\(--footer-bg\)/);
    assert.match(footerRule, /border-top:\s*1px solid var\(--ink\)/);
    assert.doesNotMatch(footerCss, /footer-ending|footer-water|ambient-water/);
  });

  it("keeps the footer content and navigation accessible", () => {
    assert.match(footerView, /t\("footer\.copyright"\)/);
    assert.match(footerView, /t\("footer\.tagline"\)/);
    assert.match(footerView, /class="footer-socials"/);
    assert.doesNotMatch(footerView, /<section[^>]*footer-info[^>]*aria-hidden/);
  });

  it("leaves no ambient video controller of any kind behind", () => {
    // The water band was retired first; the shared sky followed it when Sacred
    // Press replaced the ambient backdrop with printed plates (CONSTRAINTS.md,
    // 2026-09-11). Neither controller may come back by either name.
    const app = read("public/scripts/app.js");

    assert.doesNotMatch(app, /data-app-water|waterVideo|waterSourcesLoaded|observeWater|initWater/);
    assert.doesNotMatch(app, /data-app-sky|initAmbientArt|has-ambient-video/);
    assert.ok(
      !existsSync(path.join(appRoot, "src/views/components/layout/ambient-sky.ejs")),
      "the shared sky component has no remaining consumer",
    );
  });

  it("removes the unused water media and its local documentation", () => {
    for (const relativePath of [
      "public/videos/ambient-water.webm",
      "public/videos/ambient-water.mp4",
      "public/videos/ambient-water.jpg",
      "public/videos/AMBIENT_WATER.md",
      "docs/water-footer",
    ]) {
      assert.equal(existsSync(path.join(root, relativePath)), false, `${relativePath} must be removed`);
    }
  });
});
