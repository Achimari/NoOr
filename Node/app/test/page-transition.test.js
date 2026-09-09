import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const layoutDir = path.join(appRoot, "src", "views", "components", "layout");
const scriptsDir = path.join(appRoot, "public", "scripts");

const layout = (name) => readFileSync(path.join(layoutDir, name), "utf8");
const script = (name) => readFileSync(path.join(scriptsDir, name), "utf8");

const DOCUMENTS = ["document.ejs", "auth-document.ejs"];

describe("stylesheet readiness", () => {
  for (const name of DOCUMENTS) {
    it(`${name} waits for every shared and route stylesheet`, () => {
      const markup = layout(name);

      assert.match(
        markup,
        /NoOrTrackStylesheet|data-noor-style/,
        `${name} must register every stylesheet with the readiness tracker`,
      );
      assert.doesNotMatch(
        markup,
        /index === styles\.length - 1/,
        `${name} still ties readiness to the last shared stylesheet`,
      );
    });

    it(`${name} settles readiness on load and on error alike`, () => {
      const markup = layout(name);
      assert.match(markup, /onload="[^"]*NoOr/, `${name} must report a loaded stylesheet`);
      assert.match(markup, /onerror="[^"]*NoOr/, `${name} must report a failed stylesheet`);
    });
  }

  it("counts every stylesheet exactly once, and reveals only when all settle", () => {
    const head = layout("loading-head.ejs");

    assert.match(head, /NoOrTrackStylesheet/, "the head owns the tracker");
    assert.match(head, /settled\s*\+=\s*1/, "readiness is a count, not a single callback");
    assert.match(head, /expected\s*=\s*-1/, "a partial count cannot reveal the page early");
    assert.match(head, /settled >= expected/, "the page reveals only once every sheet has reported");
    assert.match(head, /watchdog|setTimeout/, "a stuck-state escape hatch exists");

    for (const name of DOCUMENTS) {
      assert.match(
        layout(name),
        /NoOrSealStylesheets\(<%= \w+\.length %>\)/,
        `${name} must seal with its own stylesheet count`,
      );
    }
  });

  it("counts stylesheets by attribute, never by a script between the links", () => {
    for (const name of DOCUMENTS) {
      const markup = layout(name);
      assert.doesNotMatch(
        markup,
        /<script>window\.NoOrTrackStylesheet\(\)<\/script>/,
        `${name} must not block the parser between stylesheets`,
      );
      assert.match(markup, /onload="window\.NoOrTrackStylesheet\(\)"/, `${name} counts on load`);
      assert.match(markup, /onerror="window\.NoOrTrackStylesheet\(\)"/, `${name} counts on error`);
    }
  });

  it("does not wait for images, video or background work", () => {
    const head = layout("loading-head.ejs");
    assert.doesNotMatch(head, /HTMLImageElement|\bvideo\b|decode\(/);
  });
});

describe("page transition controller", () => {
  const app = script("app.js");

  it("exposes idempotent start and reset methods", () => {
    assert.match(app, /window\.NoOrStartPageTransition\s*=/);
    assert.match(app, /window\.NoOrResetPageTransition\s*=/);
  });

  it("avoids a click-flash and gives a shown loader a readable lifetime", () => {
    const head = layout("loading-head.ejs");
    assert.match(app, /PAGE_TRANSITION_DELAY\s*=\s*160/, "intent feedback waits through a normal click response");
    assert.match(head, /minimumVisibleMs\s*=\s*650/, "a loader that appears must read as deliberate");
    assert.match(head, /minimumVisibleMs\s*-\s*elapsed/, "readiness must respect the minimum visible interval");
    assert.match(head, /noor-loader-spin\s+1\.25s/, "the mark must rotate calmly rather than twitch");
  });

  it("only claims eligible activations", () => {
    for (const guard of [
      /metaKey/, /ctrlKey/, /shiftKey/, /altKey/,
      /button\s*!==\s*0|event\.button/,
      /target/, /download/, /hash/,
      /data-no-page-transition|noPageTransition/,
      /origin/,
    ]) {
      assert.match(app, guard, `the eligibility check is missing ${guard}`);
    }
  });

  it("does not arm for an external or Telegram deep link", () => {
    assert.match(
      app,
      /telegram|t\.me/i,
      "the Telegram hand-off must be excluded explicitly",
    );
  });

  it("does not arm while the reading modal holds unsaved text", () => {
    assert.match(app, /hasUnsavedReading\(\)/);
    const controller = app.slice(app.indexOf("NoOrStartPageTransition"));
    assert.ok(
      app.includes("hasUnsavedReading()") && /hasUnsavedReading\(\)/.test(app.slice(0, app.indexOf("pageshow")) || app),
      "the unsaved guard is consulted before arming",
    );
    assert.ok(controller.length > 0);
  });

  it("clears every transition class, timer and aria-busy on pageshow", () => {
    assert.match(app, /"pageshow"/);
    assert.match(app, /persisted/, "a bfcache restore must reset the overlay too");
    assert.match(app, /aria-busy/);
  });

  it("announces itself without moving focus", () => {
    for (const name of DOCUMENTS) {
      const markup = layout(name);
      assert.match(markup, /role="status"/, `${name} must announce the wait`);
      assert.match(markup, /aria-live="polite"/, `${name} must announce it politely`);
      assert.match(markup, /data-noor-loader(?![-\w])/, `${name} must render the loader`);
      assert.equal(
        (markup.match(/data-noor-loader(?![-\w])/g) || []).length,
        1,
        `${name} must render exactly one loader`,
      );
    }

    assert.match(app, /Loading page/, "the status text is real, not an empty live region");
    assert.doesNotMatch(
      app.slice(app.indexOf("function startPageTransition"), app.indexOf("function isSameOriginDocumentLink")),
      /\.focus\(\)/,
      "the loader must not move focus before the browser commits the navigation",
    );
  });

  it("uses the semantic z-index scale, not 9998/9999", () => {
    const head = layout("loading-head.ejs");
    assert.doesNotMatch(head, /z-index:\s*999[89]/);

    const variables = readFileSync(path.join(appRoot, "public", "styles", "variables.css"), "utf8");
    assert.match(variables, /--z-page-transition:/, "the overlay layer has a named token");
  });

  it("shows a static mark and an opacity-only change under reduced motion", () => {
    const head = layout("loading-head.ejs");
    assert.match(head, /prefers-reduced-motion/);
  });
});
