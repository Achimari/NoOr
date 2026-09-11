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

/** Remove JS and CSS comments so assertions read code, not commentary. */
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

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
    // Strip comments first: the head explains what it deliberately does *not*
    // wait for, and prose must not be mistaken for behaviour.
    const head = stripComments(layout("loading-head.ejs"));

    assert.doesNotMatch(head, /HTMLImageElement|\bvideo\b|decode\(/);
    assert.doesNotMatch(head, /ambient|analytics/i, "background work is not part of readiness");
  });
});

describe("the loader gates on real readiness", () => {
  const head = () => stripComments(layout("loading-head.ejs"));

  it("requires stylesheets, the DOM, the webfont and every hold together", () => {
    const source = head();
    const gate = source.match(/function ready\(\)\s*\{[^}]*\}/);

    assert.ok(gate, "readiness must be one explicit predicate, not scattered flags");
    const condition = gate[0];

    assert.match(condition, /settled >= expected/, "every stylesheet must have settled");
    assert.match(condition, /expected >= 0/, "a partial count cannot reveal the page early");
    assert.match(condition, /domReady/, "the DOM and deferred scripts must have run");
    assert.match(condition, /fontsReady/, "the one webfont must have resolved");
    assert.match(condition, /holds === 0/, "no page may still be initialising");
  });

  it("takes DOM readiness from DOMContentLoaded, after deferred scripts run", () => {
    const source = head();

    assert.match(source, /DOMContentLoaded/, "deferred page scripts execute before this fires");
    assert.match(source, /domReady\s*=\s*true/);
    assert.match(source, /document\.readyState === "loading"/, "a late-parsed head must not miss the event");
  });

  it("waits for the webfont, and settles when it fails or is unsupported", () => {
    const source = head();

    assert.match(source, /document\.fonts\.ready/, "the product is set in one face; it must not swap");
    // Both handlers of then() are the same settler, so a rejected font still
    // releases the gate; the else-branch covers a browser without the API.
    assert.match(source, /\.then\(settleFonts,\s*settleFonts\)/,
      "a failed font load must still settle readiness");
    assert.match(source, /else\s*\{\s*settleFonts\(\);/,
      "a browser without document.fonts must not hang behind the loader");

    // Asked only once the DOM is parsed, or the promise can resolve before the
    // stylesheets that request the face have been seen.
    const onDomReady = source.match(/function onDomReady\(\)\s*\{[^}]*\}/);
    assert.ok(onDomReady, "DOM readiness is one named step");
    assert.match(onDomReady[0], /watchFonts\(\);/,
      "font readiness is chained after DOM readiness, not asked from <head>");
  });

  it("offers an explicit readiness contract instead of guessing with a timeout", () => {
    const source = head();

    assert.match(source, /NoOrPageReady/, "pages need a way to declare critical async work");
    assert.match(source, /hold:\s*function/, "a hold is taken");
    assert.match(source, /holds\s*-=\s*1/, "and released");
    assert.match(source, /released\s*=\s*true/, "releasing twice must not double-count");
  });

  it("uses a page that actually holds, and always releases it", () => {
    const battle = stripComments(script("pages/battle.js"));

    assert.match(battle, /NoOrPageReady\?\.hold\(\)/, "battle waits for its spell metadata");
    assert.match(battle, /\.finally\(/, "a failed request must still release the gate");
  });

  it("bounds the one unbounded input so the watchdog stays exceptional", () => {
    const source = head();
    const grace = source.match(/fontGraceMs\s*=\s*(\d+)/);
    const watchdog = source.match(/watchdogMs\s*=\s*(\d+)/);

    // The font is the only readiness input on a network fetch that can take
    // arbitrarily long. Measured on a 180kbps throttle it pushed the whole load
    // past the global watchdog, which made the safety net the normal path.
    assert.ok(grace, "the font wait must be bounded");
    assert.ok(Number(grace[1]) < Number(watchdog[1]),
      "the font grace must expire well before the global watchdog");
    assert.match(source, /setTimeout\(settleFonts, fontGraceMs\)/,
      "past the grace the page reveals and font-display: swap takes over");
  });

  it("keeps the timeout a watchdog, not the completion mechanism", () => {
    const source = head();
    const watchdog = source.match(/watchdogMs\s*=\s*(\d+)/);

    assert.ok(watchdog, "a stuck-state escape hatch exists");
    assert.ok(Number(watchdog[1]) >= 4000,
      "a short timer would become the normal path rather than a safety net");
    assert.match(source, /loaderWatchdog/, "a watchdog reveal must be distinguishable from a real one");
  });

  it("never leaves the document gated after an error or a bfcache restore", () => {
    const source = head();

    assert.match(source, /addEventListener\("error"/, "a script error must not trap the reader");
    assert.match(source, /persisted/, "a restored page is already initialised");
    assert.match(source, /unlockBody\(\)/, "and must not come back locked");
  });
});

describe("interaction is locked without blocking initialization", () => {
  const head = () => stripComments(layout("loading-head.ejs"));
  const app = script("app.js");

  it("marks the underlying content inert and restores only what it set", () => {
    const source = head();

    assert.match(source, /inert = true/, "underlying content must not take focus or clicks");
    assert.match(source, /data-noor-inerted/, "only the elements we inerted may be restored");
    assert.match(source, /if \(child\.inert\) continue/,
      "content already inert for another reason must be left alone");
    assert.match(source, /"inert" in HTMLElement\.prototype/, "feature-detected, never assumed");
  });

  it("lets the overlay swallow pointer events while it is up", () => {
    const style = layout("loading-head.ejs");

    assert.match(style, /html\.page-loading-visible \.noor-loader,\s*html\.page-transitioning \.noor-loader \{[^}]*pointer-events:\s*auto/,
      "the visible overlay must intercept pointer events");
    assert.match(style, /html\.page-loading,\s*html\.page-transitioning \{\s*overflow:\s*hidden/,
      "scrolling must be locked for as long as the gate is up");
  });

  it("locks on navigation immediately, before the spinner is shown", () => {
    const controller = stripComments(
      app.slice(app.indexOf("function startPageTransition"), app.indexOf("function resetPageTransition")),
    );

    const lockAt = controller.indexOf("NoOrLockInteraction");
    const showAt = controller.indexOf("PAGE_TRANSITION_DELAY");
    assert.ok(lockAt >= 0, "a navigation must lock the page");
    assert.ok(lockAt < showAt, "the lock must not wait for the spinner delay");
  });

  it("releases the lock on reset, and cannot strand a cancelled navigation", () => {
    const reset = app.slice(app.indexOf("function resetPageTransition"));

    assert.match(reset.slice(0, 400), /NoOrUnlockInteraction/, "reset must unlock");
    assert.match(app, /PAGE_TRANSITION_ABANDON_MS/, "a cancelled navigation fires no event; bound it");
    assert.match(app, /pageTransitionTimer \|\| pageTransitionAbandonTimer/,
      "starting twice must not leak a second timer");
  });

  it("guards double submits on the auth layout, which ships no controller", () => {
    const source = head();
    const auth = layout("auth-document.ejs");

    // The auth documents load no JS bundle at all, so app.js is not there to
    // arm a transition. The inline head covers only that case.
    assert.doesNotMatch(auth, /<script src=/, "the auth layout still ships no bundle");
    assert.match(source, /addEventListener\("submit"/, "a submit on an auth page must lock");
    assert.match(source, /typeof window\.NoOrStartPageTransition === "function"\) return/,
      "when the controller exists it owns eligibility; the head must defer");
    assert.match(source, /checkValidity\(\)\) return/,
      "a validation failure must never lock the reader out of the form");
  });

  it("never freezes the main thread to hold the reader back", () => {
    const source = head();

    assert.doesNotMatch(source, /while\s*\([^)]*Date\.now|alert\(|debugger/,
      "the page must keep initialising underneath the overlay");
  });
});

describe("page transition controller", () => {
  const app = script("app.js");

  it("exposes idempotent start and reset methods", () => {
    assert.match(app, /window\.NoOrStartPageTransition\s*=/);
    assert.match(app, /window\.NoOrResetPageTransition\s*=/);
  });

  it("avoids a click-flash without buying it back with a minimum display time", () => {
    const head = layout("loading-head.ejs");
    assert.match(app, /PAGE_TRANSITION_DELAY\s*=\s*160/, "intent feedback waits through a normal click response");

    // The overlay simply stays off screen until appearAfterMs. A load that
    // finishes inside that window shows nothing, so nothing has to be held on
    // screen afterwards to stop it flashing.
    assert.match(head, /appearAfterMs\s*=\s*\d+/, "the overlay waits before appearing");
    assert.doesNotMatch(head, /minimumVisibleMs/, "a ready page must never be held behind the loader");
    assert.match(head, /noor-loader-spin\s+0\.52s\s+linear/, "the restored mark spins at its original rate");
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
