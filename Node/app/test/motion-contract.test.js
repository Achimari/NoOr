import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { pageBundles, sharedStyles } from "../src/config/assetSources.js";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const publicDir = path.join(appRoot, "public");
const style = (file) => readFileSync(path.join(publicDir, "styles", file), "utf8");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const allStyles = [
  ...sharedStyles,
  ...Object.values(pageBundles).flatMap((bundle) => bundle.styles || []),
];

describe("motion contract", () => {
  it("animates the daily timers with transform, not width", () => {
    const css = stripComments(style("pages/daily-check-in.css"));
    const rules = [...css.matchAll(/\.dashboard-timer-progress[^{]*{([^}]*)}/g)].map((m) => m[1]).join("\n");

    assert.doesNotMatch(rules, /transition:[^;]*\bwidth\b/, "the timer must not animate width");
    assert.match(rules, /transform:\s*scaleX/, "the timer fill scales");
    assert.match(rules, /transform-origin:\s*left/, "the fill grows from the left edge");
  });

  it("writes a normalised ratio from JS, never a percent width", () => {
    const app = readFileSync(path.join(publicDir, "scripts", "app.js"), "utf8");

    assert.doesNotMatch(app, /Progress\.style\.width\s*=/, "timer progress must not be sized by width");
    assert.match(app, /--timer-progress|setProperty\("--timer/, "JS writes the ratio as a custom property");
  });

  it("never animates a layout property for ordinary UI", () => {
    const offenders = [];
    for (const file of allStyles) {
      if (file.includes("game/battle")) continue; // approved game choreography
      const css = stripComments(readFileSync(path.join(publicDir, file), "utf8"));
      for (const match of css.matchAll(/transition:([^;}]*)[;}]/g)) {
        const value = match[1];
        if (/\b(width|height|top|left|right|bottom|margin|padding)\b/.test(value)) {
          offenders.push(`${file}: transition:${value.trim()}`);
        }
      }
    }
    assert.deepEqual(offenders, [], offenders.join("\n"));
  });

  it("never uses transition: all", () => {
    for (const file of allStyles) {
      assert.doesNotMatch(stripComments(readFileSync(path.join(publicDir, file), "utf8")), /transition:\s*all/, file);
    }
  });

  it("does not leave will-change on an ordinary hover card", () => {
    assert.doesNotMatch(
      stripComments(style("home/roadmap-and-links.css")),
      /\.hover-lift-card\s*{[^}]*will-change/s,
      "a permanent compositor layer for a hover lift is a cost with no payer",
    );
  });

  it("replaces the blanket reduced-motion kill switch with component-aware variants", () => {
    const globals = stripComments(style("globals.css"));

    assert.doesNotMatch(
      globals,
      /animation-duration:\s*0\.01ms\s*!important/,
      "reduced motion must keep useful opacity and colour feedback",
    );
    assert.match(globals, /prefers-reduced-motion/, "reduced motion is still handled");
  });

  const INDETERMINATE_PROGRESS = /\b(?:ui-button-spin|ui-button-wait)\b/;

  it("keeps ordinary UI motion under 300ms", () => {
    const offenders = [];
    for (const file of allStyles) {
      if (file.includes("game/battle")) continue;
      const css = stripComments(readFileSync(path.join(publicDir, file), "utf8"));
      for (const match of css.matchAll(/(?:transition|animation)[^;}]*?(\d{3,5})ms/g)) {
        if (INDETERMINATE_PROGRESS.test(match[0])) continue;
        if (Number(match[1]) > 300) offenders.push(`${file}: ${match[0].trim()}`);
      }
    }
    assert.deepEqual(offenders, [], offenders.join("\n"));
  });

  it("keeps the indeterminate loops calm rather than frantic", () => {
    const buttons = stripComments(readFileSync(path.join(publicDir, "styles/components/buttons.css"), "utf8"));

    for (const [, duration] of buttons.matchAll(/animation:\s*ui-button-(?:spin|wait)\s+(\d+)ms/g)) {
      assert.ok(Number(duration) >= 500, `a progress loop at ${duration}ms reads as agitation`);
      assert.ok(Number(duration) <= 1200, `a progress loop at ${duration}ms reads as stalled`);
    }
  });

  it("gives popovers interruptible transitions with a trigger-side origin", () => {
    const header = stripComments(style("header/base.css"));

    assert.doesNotMatch(header, /animation:\s*account-panel-in/, "an entry-only keyframe cannot be reversed");
    assert.doesNotMatch(header, /animation:\s*menu-pop/, "an entry-only keyframe cannot be reversed");
    assert.match(header, /transform-origin:\s*top right/, "the panel scales from its trigger");
  });

  it("settles new page content once per navigation", () => {
    const shell = stripComments(style("shell.css"));

    assert.match(shell, /@keyframes page-enter/, "the shared shell owns the one page-entry settle");
    assert.match(shell, /translateY\(6px\)/, "content settles from 6px");
    assert.match(
      shell,
      /animation: page-enter var\(--duration-panel\)/,
      "the settle runs for --duration-panel (220ms) from the shared scale",
    );
    assert.match(shell, /animation-fill-mode|both/, "content is never gated on the animation");
  });

  it("reveals statistics bars and globe points with a capped stagger", () => {
    const statistics = stripComments(style("pages/statistics.css"));

    assert.match(statistics, /@keyframes\s+[a-z-]*bar-reveal/, "bars reveal by scale");
    assert.match(statistics, /transform:\s*scaleX\(0\)/, "the reveal grows the bar from nothing");
    assert.match(statistics, /@keyframes\s+globe-point-in/, "globe points reveal by opacity and scale");
    assert.match(statistics, /--reveal-index/, "the stagger is per row");
    assert.match(statistics, /min\(calc\(var\(--reveal-index/, "the stagger is capped so a long list never queues");
  });

  it("keeps a reduced-motion alternative for every new animation", () => {
    for (const file of ["shell.css", "pages/statistics.css", "components/material.css"]) {
      const css = stripComments(style(file));
      if (!/@keyframes|animation:/.test(css)) continue;
      assert.match(css, /prefers-reduced-motion/, `${file} animates without a reduced-motion path`);
    }
  });

  it("keeps at most one short opacity response on the sky after an answer", () => {
    const material = stripComments(style("components/material.css"));
    const tint = material.match(/\.ambient-video__tint\s*{([^}]*)}/s)?.[1] || "";

    assert.doesNotMatch(tint, /1000ms/, "a one-second video filter change is not feedback");
    assert.doesNotMatch(tint, /background-color\s+\d+ms/, "only opacity responds");
  });
});
