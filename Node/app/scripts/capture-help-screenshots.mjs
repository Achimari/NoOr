#!/usr/bin/env node
/* Recapture the seven screenshots the Help page teaches from.
 *
 * These are real browser captures of the real application, taken against the
 * isolated fixture database seeded by `scripts/seed-press-fixtures.js`. No
 * image is generated, retouched or simulated: if a state cannot be reached,
 * this script says which one and why rather than producing a picture of it.
 *
 * Playwright is not a dependency of this project — the application does not
 * need a browser to run — so this script is given the path to an installation.
 *
 * Full recipe, including the fixture database and server:
 *   docs/sacred-press-redesign/CAPTURE.md
 *
 *   node --experimental-... none needed; run as:
 *   PLAYWRIGHT=/path/to/node_modules/playwright node scripts/capture-help-screenshots.mjs
 */

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE || "http://127.0.0.1:3021";
const appRoot = fileURLToPath(new URL("..", import.meta.url));
const OUT = process.env.OUT || path.join(appRoot, "public", "images", "help");

/* The Help markup declares 1280x800 for every one of these. Changing the size
   means changing both the files and those attributes together. */
const VIEWPORT = { width: 1280, height: 800 };

const FIXTURE = { name: "Press Fixture", password: "press-fixture-pw" };
const PEER = { name: "Quiet Reader", password: "press-fixture-pw" };

/* Playwright's package entry is CommonJS, so an explicit path resolves to a
   default export rather than to the named one. */
const playwright = await import(process.env.PLAYWRIGHT || "playwright");
const { chromium } = playwright.chromium ? playwright : playwright.default;

async function signIn(browser, who) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="name"], input[name="login"]', who.name);
  await page.fill('input[name="password"]', who.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("login"), { timeout: 15000 });
  await page.close();
  return context;
}

/** Fonts loaded, art decoded, animation frozen — so two runs agree. */
async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page
    .evaluate(() =>
      Promise.race([
        Promise.all(
          [...document.images]
            .filter((image) => !image.complete)
            .map((image) => new Promise((done) => { image.onload = image.onerror = done; })),
        ),
        new Promise((done) => setTimeout(done, 4000)),
      ]),
    )
    .catch(() => {});
  await page.addStyleTag({
    content: "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important}",
  });
  await page.waitForTimeout(500);
}

/* Each shot names the state it needs, so a failure reports a missing
   prerequisite instead of quietly capturing the wrong screen. */
const SHOTS = [
  {
    file: "daily-check-in.webp",
    who: "fixture",
    path: "/daily-check-in",
    requires: "an answered Strong question and at least one task",
    verify: '[aria-pressed="true"]',
  },
  { file: "profile.webp", who: "fixture", path: "/profile", requires: "a confirmed base-point allocation", verify: "[data-allocation]" },
  { file: "achievements.webp", who: "fixture", path: "/achievements", requires: "nothing beyond a signed-in account", verify: ".ach-seal" },
  {
    file: "spells.webp",
    who: "fixture",
    path: "/profile#spells",
    requires: "at least one unlocked spell",
    verify: ".profile-spell-list, [data-spell]",
    async prepare(page) {
      const first = page.locator("[data-spell] summary, .profile-spell-toggle, [data-spell-toggle]").first();
      if (await first.count()) await first.click().catch(() => {});
      await page.locator("#spells").scrollIntoViewIfNeeded().catch(() => {});
    },
  },
  {
    file: "battle.webp",
    who: "fixture",
    path: "/battle",
    requires: "a PvE encounter already in progress",
    verify: "[data-battle-stage]",
  },
  {
    file: "battle-entry.webp",
    who: "peer",
    path: "/battle",
    requires: "an account with points allocated and no fight running",
    verify: "[data-battle-entry], .battle-entry, main",
  },
  {
    file: "account-menu.webp",
    who: "fixture",
    path: "/daily-check-in",
    requires: "nothing beyond a signed-in account",
    verify: ".header-account-menu, [data-account-menu]",
    async prepare(page) {
      await page.locator(".header-account-button, [data-account-toggle]").first().click();
      await page.waitForTimeout(300);
    },
  },
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const contexts = { fixture: await signIn(browser, FIXTURE), peer: await signIn(browser, PEER) };
  const missing = [];

  for (const shot of SHOTS) {
    const page = await contexts[shot.who].newPage();
    try {
      await page.goto(`${BASE}${shot.path}`, { waitUntil: "domcontentloaded", timeout: 20000 });
      await settle(page);
      if (shot.prepare) await shot.prepare(page);
      await settle(page);

      if (shot.verify && !(await page.locator(shot.verify).first().count())) {
        missing.push(`${shot.file} — needs ${shot.requires}; "${shot.verify}" was not on the page`);
        await page.close();
        continue;
      }

      // Viewport-only, so every file is exactly the size the markup declares.
      await page.screenshot({ path: path.join(OUT, shot.file), type: "webp", quality: 82, fullPage: false });
      console.log(`  ${shot.file}  ${VIEWPORT.width}x${VIEWPORT.height}`);
    } catch (error) {
      missing.push(`${shot.file} — ${error.message.split("\n")[0]}`);
    }
    await page.close();
  }

  await browser.close();

  if (missing.length) {
    console.error("\nnot captured:");
    for (const line of missing) console.error(`  ${line}`);
    process.exitCode = 1;
  } else {
    console.log(`\nall ${SHOTS.length} Help screenshots captured into ${path.relative(appRoot, OUT)}`);
  }
}

await main();
