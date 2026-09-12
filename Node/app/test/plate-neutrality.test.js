import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { inflateSync } from "node:zlib";
import { describe, it } from "node:test";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const platesDir = path.join(appRoot, "public", "images", "plates");
const read = (relative) => readFileSync(path.join(appRoot, relative), "utf8");

/** Every shipped plate file, by encoding. */
const plates = () =>
  readdirSync(platesDir)
    .filter((name) => /\.(avif|webp|jpg)$/.test(name))
    .sort();

/**
 * Decoding is what actually proves neutrality: a source comment is a promise
 * and a pixel is a fact. `sips` ships with macOS and `magick`/`convert` cover
 * the rest; if none of them is present the decode assertions report that
 * honestly rather than passing on a machine that never looked at a pixel.
 */
function decoder() {
  for (const [command, args] of [
    ["magick", (input, output) => [input, "-colorspace", "sRGB", output]],
    ["convert", (input, output) => [input, "-colorspace", "sRGB", output]],
    ["sips", (input, output) => ["-s", "format", "png", input, "--out", output]],
  ]) {
    try {
      execFileSync("which", [command], { stdio: "ignore" });
      return { command, args };
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * The plates are ink on paper and nothing else (CONSTRAINTS.md, 2026-09-12).
 *
 * The warm tint the first wave shipped was baked into the pixels by
 * `scripts/build-press-plates.py`, not applied in CSS, so the only guard that
 * can catch it coming back is one that reads the generator's own tone constants
 * and, where a decoder exists, the shipped bytes.
 */
describe("printed plates carry no colour", () => {
  const BUILDER = "scripts/build-press-plates.py";

  it("tones every plate from white paper to black ink at the source", () => {
    const script = read(BUILDER);

    assert.match(script, /^PAPER = np\.array\(\[0xFF, 0xFF, 0xFF\]/m, "paper is white, not a mineral ground");
    assert.match(script, /^INK = np\.array\(\[0x00, 0x00, 0x00\]/m, "ink is black, not a warm graphite");

    // No warm constant may return through a helper either.
    assert.doesNotMatch(script, /0xD7|0xD0|0xC5|0x17, 0x17, 0x15/, "the retired mineral values are gone");
  });

  it("drops the smallest dot, so a plate's white is the sheet's white", () => {
    const script = read(BUILDER);
    const min = Number(script.match(/^MIN_DOT = ([\d.]+)/m)?.[1]);

    assert.ok(Number.isFinite(min), "the press must declare its smallest holdable dot");
    assert.ok(min > 0, "without a floor the screen tints the whole plate grey");
    assert.ok(min < 0.12, `MIN_DOT is ${min}; above this the plate starts losing real highlight detail`);
    assert.match(script, /np\.where\(coverage < MIN_DOT, 0\.0, coverage\)/, "and the floor must actually be applied");
  });

  it("keeps the plate library out of rendered page templates", () => {
    const referenced = new Set();
    const viewsDir = path.join(appRoot, "src", "views");
    const pending = [viewsDir];
    while (pending.length) {
      const dir = pending.pop();
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) pending.push(full);
        else if (entry.name.endsWith(".ejs")) {
          for (const [, file] of readFileSync(full, "utf8").matchAll(/\/images\/plates\/([\w-]+\.(?:avif|webp|jpg))/g)) {
            referenced.add(file);
          }
        }
      }
    }

    assert.deepEqual([...referenced], [], "decorative plate images must not be requested by a page");
  });

  it("names every shipped plate in the provenance record", () => {
    const readme = read("public/images/plates/README.md");
    for (const file of plates()) {
      assert.ok(readme.includes(`\`${file}\``), `${file} ships without a line in README.md`);
    }
    assert.match(readme, /Retoned 2026-09-12/, "the retone must be recorded, not silently done");
  });

  it("decodes every plate as a true neutral, within the documented tolerance", (t) => {
    const tool = decoder();
    assert.ok(tool, "no image decoder on PATH (magick, convert or sips); cannot verify shipped pixels");
    const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "achimari-plate-neutrality-"));
    t.after(() => rmSync(temporaryDirectory, { recursive: true, force: true }));

    // 1/255 of drift survives chroma-subsampled encoding. It is documented in
    // README.md as a tolerance, and anything above it is a colour leak.
    const TOLERANCE = 1;
    const offenders = [];

    for (const file of plates()) {
      const source = path.join(platesDir, file);
      const target = path.join(temporaryDirectory, "decoded.png");
      try {
        execFileSync(tool.command, tool.args(source, target), { stdio: "ignore" });
      } catch {
        offenders.push(`${file} — could not be decoded`);
        continue;
      }

      const { width, height, pixels } = readPng(target);
      let worst = 0;
      // A stride keeps this a fast guard rather than a full-image scan: at
      // every 7th pixel a whole-image tint cannot hide, and a tint is the only
      // thing this is looking for.
      for (let i = 0; i < width * height; i += 7) {
        const [r, g, b] = [pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]];
        worst = Math.max(worst, Math.max(r, g, b) - Math.min(r, g, b));
      }
      if (worst > TOLERANCE) offenders.push(`${file} — channel spread ${worst}, over the ${TOLERANCE} tolerance`);
    }

    assert.deepEqual(offenders, [], "every plate must decode as black, white and neutral grey");
  });
});

/** A minimal PNG reader: enough for the 8-bit RGB/RGBA files the decoders emit. */
function readPng(file) {
  const buffer = readFileSync(file);
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 6;
  const idat = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8, "expected an 8-bit PNG from the decoder");
      colorType = data[9];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    offset += 12 + length;
  }

  const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : 0;
  assert.ok(channels, `unsupported PNG colour type ${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4);
  const line = Buffer.alloc(stride);
  const previous = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    raw.copy(line, 0, y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? line[x - channels] : 0;
      const b = previous[x];
      const c = x >= channels ? previous[x - channels] : 0;
      if (filter === 1) line[x] = (line[x] + a) & 0xff;
      else if (filter === 2) line[x] = (line[x] + b) & 0xff;
      else if (filter === 3) line[x] = (line[x] + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      }
    }
    for (let x = 0; x < width; x += 1) {
      out[(y * width + x) * 4] = line[x * channels];
      out[(y * width + x) * 4 + 1] = line[x * channels + 1];
      out[(y * width + x) * 4 + 2] = line[x * channels + 2];
      out[(y * width + x) * 4 + 3] = channels === 4 ? line[x * channels + 3] : 255;
    }
    line.copy(previous);
  }
  return { width, height, pixels: out };
}

/**
 * A plate that never arrives.
 *
 * Verified in a real browser on 2026-09-12 by aborting every
 * `/images/plates/**` request on Today, My Prayers and Profile: the box keeps
 * its reserved size, no route shifts, no route overflows, and the plate reads
 * as a deliberate recessed region. These guards keep that true.
 */
describe("a plate that does not arrive is still a design", () => {
  it("paints an opaque ground under every plate, so a failed load is a region", () => {
    const material = read("public/styles/components/material.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const plate = material.match(/\.press-plate\s*\{([^}]*)\}/)?.[1] || "";

    assert.match(plate, /background:\s*var\(--paper-muted\)/, "the ground is painted before the file is asked for");
    assert.match(plate, /aspect-ratio:\s*var\(--plate-ratio/, "and the box is reserved, so nothing shifts");
    assert.match(plate, /overflow:\s*hidden/);
  });

  it("hides the browser's own broken-image glyph without hiding the fallback", () => {
    const material = read("public/styles/components/material.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const failed = material.match(/\.press-plate\[data-plate-failed="true"\][^{]*\{([^}]*)\}/)?.[1] || "";

    assert.match(failed, /visibility:\s*hidden/, "the failed image is hidden");
    assert.doesNotMatch(failed, /display:\s*none/, "but the box must keep its size, or the page shifts");

    const script = read("public/scripts/app.js");
    assert.match(script, /plate\.dataset\.plateFailed = "true"/, "the attribute must actually be set");
    assert.match(script, /"error",[\s\S]{0,400}?true,\n\s*\);/, "error does not bubble, so it is caught capturing");
  });

  it("leaves no page-specific decorative plate selectors behind", () => {
    for (const [sheet, selector] of [
      ["pages/daily-check-in.css", ".today-plate"],
      ["components/feed.css", ".prayers-plate"],
      ["game/battle-arena.css", ".battle-plate-art"],
    ]) {
      const css = read(path.join("public", "styles", sheet)).replace(/\/\*[\s\S]*?\*\//g, "");
      assert.ok(!css.includes(selector), `${sheet}: ${selector} is a retired decorative slot`);
    }
  });
});
