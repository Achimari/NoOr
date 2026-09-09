import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const footerView = read("src/views/components/layout/footer.ejs");
const footerCss = read("public/styles/home/footer.css");
const ambientSky = read("src/views/components/layout/ambient-sky.ejs");

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

  it("returns the ambient controller to sky-only playback", () => {
    assert.match(ambientSky, /data-app-sky/);
    assert.match(ambientSky, /function syncPlayback\(\)/);
    assert.doesNotMatch(ambientSky, /data-app-water|waterVideo|waterSourcesLoaded|observeWater|initWater/);
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
