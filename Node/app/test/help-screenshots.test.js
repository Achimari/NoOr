import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const helpDir = path.join(appRoot, "public", "images", "help");
const read = (relative) => readFileSync(path.join(appRoot, relative), "utf8");
const help = () => read("src/views/pages/partials/help-content.ejs");

/** Every `<img>` the Help page renders, with its attributes. */
const images = () =>
  [...help().matchAll(/<img\s[^>]*src="\/images\/help\/([\w-]+\.webp)"[^>]*>/g)].map(([tag, file]) => ({ tag, file }));

const attribute = (tag, name) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? null;

/**
 * Help teaches from pictures of the product, so a picture of a *retired*
 * product is worse than no picture: it tells a reader to look for a control
 * that no longer looks like that.
 *
 * These files were regenerated on 2026-09-12 for the monochrome system, by
 * `scripts/capture-help-screenshots.mjs`, from real browser captures against
 * the isolated fixture database. The guards below are what keeps them honest.
 */
describe("Help screenshots describe the product as it is now", () => {
  const EXPECTED = [
    "daily-check-in.webp",
    "profile.webp",
    "achievements.webp",
    "spells.webp",
    "battle.webp",
    "battle-entry.webp",
    "account-menu.webp",
  ];

  it("renders exactly the seven captures it ships, and ships no others", () => {
    const rendered = images().map(({ file }) => file);
    assert.deepEqual([...rendered].sort(), [...EXPECTED].sort(), "Help must render every capture and no stragglers");

    const onDisk = readdirSync(helpDir).filter((name) => name.endsWith(".webp")).sort();
    assert.deepEqual(onDisk, [...EXPECTED].sort(), "an unreferenced screenshot is dead weight in the repository");
  });

  it("declares the size each file actually is", () => {
    for (const { tag, file } of images()) {
      assert.equal(attribute(tag, "width"), "1280", `${file} must declare its real width`);
      assert.equal(attribute(tag, "height"), "800", `${file} must declare its real height`);
      assert.equal(attribute(tag, "loading"), "lazy", `${file} is far below the fold`);

      const bytes = statSync(path.join(helpDir, file)).size;
      assert.ok(bytes > 8 * 1024, `${file} is ${bytes} bytes — too small to be a real 1280x800 capture`);
      assert.ok(bytes < 400 * 1024, `${file} is ${Math.round(bytes / 1024)}KB; Help ships seven of these`);
    }
  });

  it("was recaptured after the monochrome system shipped", () => {
    // The visual system changed on 2026-09-12. A screenshot older than the
    // stylesheet it is supposed to depict is, by definition, stale.
    const stylesheet = statSync(path.join(appRoot, "public", "styles", "variables.css")).mtimeMs;
    for (const { file } of images()) {
      const captured = statSync(path.join(helpDir, file)).mtimeMs;
      assert.ok(
        captured >= stylesheet - 86_400_000,
        `${file} predates the current palette by more than a day — recapture it with scripts/capture-help-screenshots.mjs`,
      );
    }
  });

  it("describes the feature being taught, not a retired colour or a volatile total", () => {
    for (const { tag, file } of images()) {
      const alt = attribute(tag, "alt");
      assert.ok(alt && alt.length > 60, `${file} needs a real alternative, got: ${alt}`);

      // The retired system's vocabulary. These exact phrases were in the alt
      // text this replaced, and each of them described something the reader can
      // no longer see.
      for (const retired of [/band of sky/i, /\bsky\b/i, /\bgreen\b/i, /\bred\b/i, /vermilion/i, /beige/i]) {
        assert.doesNotMatch(alt, retired, `${file} still describes the retired visual system`);
      }

      // A count that changes as the reader uses the product turns a helpful
      // description into a wrong one. The pictures may show figures; the
      // alternatives must not pin them.
      for (const volatile of [/\b\d+ of \d+ earned\b/, /\bin \d+ turns\b/, /\b\d+\/\d+\b/]) {
        assert.doesNotMatch(alt, volatile, `${file} pins a total that changes with use`);
      }
    }
  });

  it("keeps a reproducible capture recipe beside the screenshots", () => {
    const recipe = read("docs/sacred-press-redesign/CAPTURE.md");

    assert.match(recipe, /scripts\/seed-press-fixtures\.js/, "the fixture seed must be named");
    assert.match(recipe, /scripts\/capture-help-screenshots\.mjs/, "and so must the capture command");
    assert.match(recipe, /fixtures_db/, "and the isolated database it runs against");
    for (const file of EXPECTED) {
      assert.ok(recipe.includes(file), `${file} must be listed with the state it needs`);
    }
  });

  it("captures from the application, never from an image generator", () => {
    const script = read("scripts/capture-help-screenshots.mjs");

    assert.match(script, /chromium/, "the captures come from a real browser");
    assert.match(script, /fullPage: false/, "viewport-only, so every file is the declared size");
    assert.match(script, /requires:/, "every shot names the state it needs");
    // A missing state is reported, not invented.
    assert.match(script, /not captured:/, "an unreachable state must be named, not faked");
    assert.match(script, /process\.exitCode = 1/, "and must fail the run");
  });
});
