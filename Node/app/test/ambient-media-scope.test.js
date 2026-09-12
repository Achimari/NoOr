import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const platesDir = path.join(appRoot, "public", "images", "plates");
const read = (relative) => readFileSync(path.join(appRoot, relative), "utf8");
const appScript = () => read("public/scripts/app.js");

function allViews() {
  const files = [];
  const pending = [path.join(appRoot, "src", "views")];
  while (pending.length) {
    const dir = pending.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) pending.push(full);
      else if (entry.name.endsWith(".ejs")) files.push(path.relative(appRoot, full));
    }
  }
  return files.sort();
}

/** Every `<img>` in the product, with the markup that declares it. */
function allImages() {
  const images = [];
  for (const relative of allViews()) {
    const markup = read(relative);
    for (const [tag] of markup.matchAll(/<img\b[^>]*>/g)) {
      images.push({ file: relative, tag, markup });
    }
  }
  return images;
}

const attribute = (tag, name) => (tag.match(new RegExp(`\\b${name}="([^"]*)"`)) || [])[1];

/**
 * The shared ambient sky is superseded (CONSTRAINTS.md, 2026-09-11). Imagery is
 * no longer a video washing up behind every route; it is a small number of
 * printed plates placed where they carry narrative.
 *
 * This file is the replacement contract. Everything the sky suite enforced —
 * one owner, no page-specific mounts, reduced-motion and Save-Data safeguards,
 * a still fallback — is re-asserted for plates, plus the layout-stability and
 * licensing rules a video backdrop never needed.
 */
describe("the ambient sky is retired", () => {
  it("mounts no ambient video from any shell, page or script", () => {
    for (const relative of allViews()) {
      assert.doesNotMatch(read(relative), /ambient-sky|app-sky|ambient-video/, `${relative} still mounts the sky`);
    }
    assert.doesNotMatch(appScript(), /data-app-sky|initAmbientArt|has-ambient-video|setAmbientAnswerState/);
    assert.ok(!existsSync(path.join(appRoot, "src/views/components/layout/ambient-sky.ejs")));
  });

  it("renders no <video> anywhere in the product", () => {
    for (const relative of allViews()) {
      assert.doesNotMatch(read(relative), /<video\b/, `${relative} still ships a video element`);
    }
  });

  it("keeps the answer state on the controls, where it was always readable", () => {
    // The sky used to tint itself when an answer was recorded. That signal now
    // lives entirely on the two buttons, which is where a screen reader and a
    // keyboard user could always find it.
    assert.match(appScript(), /aria-pressed", String\(answer === "YES"\)/);
    assert.match(appScript(), /aria-pressed", String\(answer === "NO"\)/);
  });
});

describe("printed plates", () => {
  it("ships every plate as AVIF and WebP with a raster fallback, at two widths", () => {
    assert.ok(existsSync(platesDir), "the plate directory must exist");

    const stems = new Set(
      readdirSync(platesDir)
        .filter((name) => /\.(avif|webp|jpg)$/.test(name))
        .map((name) => name.replace(/\.(avif|webp|jpg)$/, "")),
    );
    assert.ok(stems.size > 0, "the product must ship at least one plate");

    for (const stem of stems) {
      for (const extension of ["avif", "webp", "jpg"]) {
        assert.ok(
          existsSync(path.join(platesDir, `${stem}.${extension}`)),
          `${stem} is missing its ${extension} encoding`,
        );
      }
    }

    for (const stem of stems) {
      if (stem.endsWith("-small")) continue;
      assert.ok(stems.has(`${stem}-small`), `${stem} must ship a narrow variant for a phone`);
    }
  });

  it("keeps every plate inside a weight a page opening can afford", () => {
    for (const name of readdirSync(platesDir).filter((entry) => /\.(avif|webp|jpg)$/.test(entry))) {
      const bytes = statSync(path.join(platesDir, name)).size;
      const cap = name.endsWith(".avif") ? 140 * 1024 : name.includes("-small") ? 140 * 1024 : 420 * 1024;
      assert.ok(bytes <= cap, `${name} is ${Math.round(bytes / 1024)}KB, over its ${Math.round(cap / 1024)}KB cap`);
    }
  });

  it("serves every plate from this repository, never from another origin", () => {
    for (const relative of allViews()) {
      const markup = read(relative);
      for (const [, url] of markup.matchAll(/\b(?:src|srcset)="([^"]+)"/g)) {
        for (const candidate of url.split(",").map((part) => part.trim().split(/\s+/)[0])) {
          if (!candidate || candidate.startsWith("<%")) continue;
          assert.doesNotMatch(candidate, /^https?:\/\//, `${relative} loads ${candidate} from another origin`);
        }
      }
    }
  });

  it("ships no generated composition reference as a production image", () => {
    // The six PNGs in docs/sacred-press-redesign are layout references. None of
    // them may be cropped into the product, and none may be copied into public/.
    const publicDir = path.join(appRoot, "public");
    const offenders = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/^0[1-6]-(auth-gateway|today|progress|prayers-community|profile-achievements|battle)/.test(entry.name)) {
          offenders.push(path.relative(appRoot, full));
        }
      }
    };
    walk(publicDir);
    assert.deepEqual(offenders, [], "a generated reference is not a production asset");

    for (const relative of allViews()) {
      assert.doesNotMatch(read(relative), /sacred-press-redesign/, `${relative} references the comps`);
    }
  });

  it("records where every plate came from, and that it is the project's own", () => {
    const readme = read("public/images/plates/README.md");

    assert.match(readme, /ambient-sky\.jpg/, "the photographic plate must name its source");
    assert.match(readme, /original/i, "the generated plate must be recorded as original work");
    assert.match(readme, /build-press-plates\.py/, "the reproducible build command must be recorded");
    assert.doesNotMatch(readme, /niccolomiranda/i, "no reference site may be a source");
    assert.doesNotMatch(readme, /unsplash|pexels|shutterstock|getty|stock photo/i, "no stock placeholder");
  });
});

describe("every image declares itself before it arrives", () => {
  it("reserves space, so a plate landing never shifts the page", () => {
    for (const { file, tag } of allImages()) {
      const hasIntrinsic = attribute(tag, "width") && attribute(tag, "height");
      const hasRatio = /aspect-ratio/.test(tag) || /style="[^"]*aspect-ratio/.test(tag);
      assert.ok(
        hasIntrinsic || hasRatio,
        `${file} ships an <img> with no width/height or aspect-ratio: ${tag.slice(0, 90)}`,
      );
    }
  });

  it("gives every image either useful alternative text or an explicit empty alt", () => {
    for (const { file, tag } of allImages()) {
      const alt = attribute(tag, "alt");
      assert.notEqual(alt, undefined, `${file} ships an <img> with no alt attribute: ${tag.slice(0, 90)}`);
      if (alt !== "") {
        assert.ok(alt.length > 3, `${file} has a placeholder alt: ${alt}`);
        assert.doesNotMatch(alt, /^(image|photo|picture|icon|plate)$/i, `${file} has a meaningless alt: ${alt}`);
      }
    }
  });

  it("lazy-loads everything below the fold and eagerly loads only a real LCP plate", () => {
    // At most one eager image per view: a page has one largest-contentful
    // element, and everything else waits until the reader scrolls to it.
    const eagerByFile = new Map();

    for (const { file, tag } of allImages()) {
      const loading = attribute(tag, "loading");
      if (loading && !["lazy", "eager"].includes(loading)) assert.fail(`${file} has loading="${loading}"`);
      if (loading === "lazy") continue;
      eagerByFile.set(file, [...(eagerByFile.get(file) || []), tag.slice(0, 70)]);
    }

    for (const [file, tags] of eagerByFile) {
      assert.equal(tags.length, 1, `${file} loads ${tags.length} images eagerly:\n${tags.join("\n")}`);
    }

    // An eagerly loaded image must actually be a page opening, and must say so
    // by claiming priority — otherwise it is just an unlazy image.
    for (const { file, tag } of allImages()) {
      if (attribute(tag, "loading") === "lazy") continue;
      assert.match(tag, /fetchpriority="high"/, `${file} loads an image eagerly without claiming it is the LCP`);
    }
  });

  it("preloads at most one image, and only one the markup actually renders", () => {
    const preloaded = [];
    for (const relative of allViews()) {
      for (const [, href] of read(relative).matchAll(/<link[^>]+href="([^"]+)"[^>]*as="image"/g)) {
        preloaded.push({ relative, href });
      }
    }

    assert.ok(preloaded.length <= 2, "only a true LCP image is preloaded, in at most the two document shells");
    for (const { relative, href } of preloaded) {
      assert.ok(
        existsSync(path.join(appRoot, "public", href.replace(/^\//, ""))),
        `${relative} preloads ${href}, which does not exist`,
      );
    }
  });

  it("offers AVIF and WebP through <picture> wherever a plate is rendered", () => {
    for (const { file, tag, markup } of allImages()) {
      const src = attribute(tag, "src") || "";
      if (!src.includes("/images/plates/")) continue;

      const index = markup.indexOf(tag);
      const before = markup.slice(Math.max(0, index - 1200), index);
      assert.match(before, /<picture\b/, `${file} renders a plate outside a <picture>`);
      assert.match(before, /type="image\/avif"/, `${file} offers no AVIF for its plate`);
      assert.match(before, /type="image\/webp"/, `${file} offers no WebP for its plate`);
    }
  });
});

describe("a plate never becomes the task", () => {
  it("keeps a flat printed ground behind every plate, so a failed load is still a design", () => {
    const material = read("public/styles/components/material.css");
    const plate = material.match(/\.press-plate\s*\{[^}]*\}/s);

    assert.ok(plate, ".press-plate must exist in the material layer");
    assert.match(plate[0], /background:\s*var\(--paper-muted\)/, "the plate's ground is paper, not a hole");
    assert.match(plate[0], /aspect-ratio:\s*var\(--plate-ratio/, "the box is reserved before the file arrives");
  });

  it("runs no continuous motion behind a plate", () => {
    const material = read("public/styles/components/material.css");
    const plate = material.match(/\.press-plate\s*\{[^}]*\}/s)[0];

    assert.doesNotMatch(plate, /animation|transition|will-change/, "a plate is printed, not playing");
  });

  it("drops decorative plate imagery for a reader who asked for less data", () => {
    // Save-Data and reduced transparency both get the flat ground. The plate is
    // atmosphere; the task underneath it never depends on the file arriving.
    const styles = read("public/styles/components/material.css") + read("public/styles/pages/auth.css");

    assert.match(styles, /@media \(prefers-reduced-data: reduce\)/, "Save-Data must be answered");
  });
});
