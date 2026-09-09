import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { pageBundles, sharedStyles } from "../src/config/assetSources.js";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const publicDir = path.join(appRoot, "public");
const stylesDir = path.join(publicDir, "styles");

const style = (file) => readFileSync(path.join(stylesDir, file), "utf8");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

function bundleFor(pageId) {
  return [...sharedStyles, ...(pageBundles[pageId]?.styles || [])].map((file) =>
    stripComments(readFileSync(path.join(publicDir, file), "utf8")));
}

function rulesOwning(cssFiles, selector) {
  const owners = [];
  for (const css of cssFiles) {
    for (const match of css.matchAll(/([^{}]+){([^{}]*)}/g)) {
      const selectors = match[1].trim();
      if (selectors.startsWith("@") || selectors.includes("keyframes")) continue;
      if (selectors.includes(selector)) owners.push({ selectors, body: match[2] });
    }
  }
  return owners;
}

const allRegisteredStyles = () => [
  ...sharedStyles,
  ...Object.values(pageBundles).flatMap((bundle) => bundle.styles || []),
];

function walkRules(css) {
  const rules = [];
  const stack = [];
  let buffer = "";
  let index = 0;

  while (index < css.length) {
    const character = css[index];

    if (character === "{") {
      const head = buffer.trim();
      buffer = "";
      if (head.startsWith("@")) {
        stack.push(head);
        index += 1;
        continue;
      }
      let depth = 1;
      let start = index + 1;
      let cursor = start;
      while (cursor < css.length && depth > 0) {
        if (css[cursor] === "{") depth += 1;
        if (css[cursor] === "}") depth -= 1;
        cursor += 1;
      }
      if (!/keyframes/.test(stack.at(-1) || "")) {
        rules.push({ selectors: head, body: css.slice(start, cursor - 1), atRules: [...stack] });
      }
      index = cursor;
      continue;
    }

    if (character === "}") {
      stack.pop();
      buffer = "";
      index += 1;
      continue;
    }

    buffer += character;
    index += 1;
  }

  return rules;
}

function baseRules(owners, selector) {
  return owners.filter(({ selectors, body }) => {
    const list = selectors.split(",").map((part) => part.trim());
    const touchesSelector = list.some((part) => part.includes(selector));
    const isStateful = /:hover|:focus|:active|:disabled|\[aria-pressed|\[aria-expanded|\[aria-current|\[hidden|\.selected|::/.test(selectors);
    const paintsSurface = /(^|;|\s)(background|background-color|border|border-color|color)\s*:/.test(body);
    return touchesSelector && !isStateful && paintsSurface;
  });
}

describe("interaction state ownership", () => {
  const components = [
    ["settings", ".settings-answer-button"],
    ["daily-check-in", ".daily-goals-add"],
  ];

  for (const [pageId, selector] of components) {
    it(`${selector} has exactly one base state owner on ${pageId}`, () => {
      const owners = baseRules(rulesOwning(bundleFor(pageId), selector), selector);

      assert.equal(
        owners.length,
        1,
        `${selector} is declared by ${owners.length} base rules: ${owners.map((o) => o.selectors).join(" || ")}`,
      );
    });
  }

  it("leaves the leaderboard username entirely to the table component", () => {
    for (const file of ["home/dashboard.css", "pages/statistics.css"]) {
      const owners = baseRules(
        rulesOwning([stripComments(style(file))], ".leaderboard-user"),
        ".leaderboard-user",
      );
      assert.equal(owners.length, 0, `${file} repaints .leaderboard-user: ${owners.map((o) => o.selectors).join(" || ")}`);
    }

    const tables = stripComments(style("components/tables.css"));
    assert.match(tables, /\.data-table a\s*{[^}]*color:\s*var\(--brand\)/s, "the table component owns the link colour");
    assert.match(tables, /\.data-table a:hover/, "and its hover");
  });

  for (const selector of [".auth-submit", ".auth-secondary"]) {
    it(`${selector} leaves its surface entirely to the button component`, () => {
      const owners = baseRules(rulesOwning([stripComments(style("pages/auth.css"))], selector), selector);

      assert.equal(
        owners.length,
        0,
        `pages/auth.css repaints ${selector}: ${owners.map((o) => o.selectors).join(" || ")}`,
      );
    });
  }

  it("drives the settings answer from aria-pressed alone", () => {
    const css = stripComments(style("pages/settings.css"));

    assert.doesNotMatch(
      css,
      /\.settings-answer-button\.selected/,
      "a parallel .selected visual source competes with aria-pressed",
    );
    assert.match(css, /\.settings-answer-yes\[aria-pressed="true"\]/);
    assert.match(css, /\.settings-answer-no\[aria-pressed="true"\]/);
  });

  it("keeps selected Yes and No full green and red, borderless and icon-free", () => {
    for (const file of ["pages/settings.css", "pages/daily-check-in.css"]) {
      const css = stripComments(style(file));
      const yes = css.match(/\.(settings-answer-yes|dashboard-action-yes)\[aria-pressed="true"\][^{]*{([^}]*)}/)?.[2] || "";
      const no = css.match(/\.(settings-answer-no|dashboard-action-no)\[aria-pressed="true"\][^{]*{([^}]*)}/)?.[2] || "";

      const fill = (declaration, token) =>
        new RegExp(`background:\\s*var\\(--(${token}|state-fill)\\)`).test(declaration)
        && new RegExp(`--state-fill:\\s*var\\(--${token}\\)`).test(css) === /state-fill/.test(declaration);

      assert.ok(fill(yes, "success"), `${file}: selected Yes must be full green, got: ${yes.trim()}`);
      assert.ok(fill(no, "danger"), `${file}: selected No must be full red, got: ${no.trim()}`);
      assert.match(yes, /border:\s*0|border-color:\s*transparent/, `${file}: selected Yes must have no border`);
      assert.match(no, /border:\s*0|border-color:\s*transparent/, `${file}: selected No must have no border`);
      assert.doesNotMatch(yes, /content:\s*"/, `${file}: selected Yes must have no icon`);
      assert.doesNotMatch(no, /content:\s*"/, `${file}: selected No must have no icon`);
    }
  });

  it("never lets hover repaint a selected answer", () => {
    const css = stripComments(style("pages/settings.css"));
    assert.doesNotMatch(
      css,
      /\[aria-pressed="true"\]:hover\s*{[^}]*background:\s*(?!var\(--success\)|var\(--danger\))/,
      "hovering a chosen answer must keep its semantic fill",
    );
  });

  it("gates every hover-only rule behind a fine pointer", () => {
    const ungated = [];
    const files = [
      "components/buttons.css",
      "components/lists.css",
      "components/tables.css",
      "components/feed.css",
      "pages/settings.css",
      "pages/daily-check-in.css",
      "pages/statistics.css",
      "pages/community.css",
      "pages/prayers.css",
      "pages/auth.css",
      "game/achievements.css",
      "game/profile.css",
    ];

    for (const file of files) {
      for (const rule of walkRules(stripComments(style(file)))) {
        if (!/:hover/.test(rule.selectors)) continue;
        if (rule.atRules.some((query) => /\(hover:\s*hover\)/.test(query))) continue;
        ungated.push(`${file}: ${rule.selectors.replace(/\s+/g, " ").trim()}`);
      }
    }

    assert.deepEqual(ungated, [], `ungated hover rules can stick after a tap:\n${ungated.join("\n")}`);
  });

  it("does not let a route restate a shared component's interaction states", () => {
    const auth = stripComments(style("pages/auth.css"));

    for (const rule of walkRules(auth)) {
      if (!/\.auth-submit|\.auth-secondary/.test(rule.selectors)) continue;
      assert.doesNotMatch(
        rule.selectors,
        /:hover|:focus-visible|:active|:disabled/,
        `pages/auth.css owns a state that components/buttons.css already owns: ${rule.selectors.trim()}`,
      );
    }
  });

  it("never moves an element on hover", () => {
    for (const file of ["components/buttons.css", "pages/settings.css", "pages/daily-check-in.css", "pages/statistics.css"]) {
      const css = stripComments(style(file));
      for (const match of css.matchAll(/([^{}]*:hover[^{}]*){([^}]*)}/g)) {
        assert.doesNotMatch(
          match[2],
          /transform:\s*(?!none)/,
          `${file}: ${match[1].trim()} moves on hover`,
        );
      }
    }
  });

  it("presses with a 120ms scale and nothing else", () => {
    const css = stripComments(style("components/buttons.css"));
    const active = css.match(/\.ui-button:active[^{]*{([^}]*)}/)?.[1] || "";

    assert.match(active, /transform:\s*scale\(0\.9[78]\)/, "press feedback is a small scale");
    assert.doesNotMatch(active, /box-shadow/, "press must not add a shadow");
  });

  it("does not animate box shadow on frequent controls", () => {
    for (const file of ["components/buttons.css", "components/lists.css", "pages/settings.css"]) {
      const css = stripComments(style(file));
      for (const match of css.matchAll(/transition:([^;]*);/g)) {
        assert.doesNotMatch(
          match[1],
          /box-shadow/,
          `${file} animates box-shadow on a frequently used control`,
        );
      }
    }
  });

  it("never styles a dialog control behind a page-element scope", () => {
    const shared = [".daily-goals-add", ".catch-up-tasks-add", ".catch-up-tasks-none"];
    const css = stripComments(style("pages/daily-check-in.css"));

    for (const selector of shared) {
      for (const rule of walkRules(css)) {
        if (!rule.selectors.includes(selector)) continue;
        assert.doesNotMatch(
          rule.selectors,
          /\.(today-page|dashboard-page|home-page)\s+/,
          `${selector} is styled behind a page scope the dialog does not have: ${rule.selectors.trim()}`,
        );
      }
    }
  });

  it("gives the catch-up dialogs the shared button vocabulary", () => {
    const markup = readFileSync(
      path.join(appRoot, "src", "views", "pages", "partials", "catch-up.ejs"),
      "utf8",
    );

    for (const gone of ["settings-confirm-button", "settings-confirm-cancel", "settings-confirm-save"]) {
      assert.doesNotMatch(markup, new RegExp(gone), `catch-up.ejs still uses the bespoke ${gone}`);
    }

    const buttons = markup.match(/<button[^>]*>/g) || [];
    const dialogButtons = buttons.filter((tag) => /data-catch-up-(answer-close|tasks-close|tasks-save|tasks-add|tasks-none)/.test(tag));
    assert.ok(dialogButtons.length >= 5, "the dialogs still declare their controls");

    for (const tag of dialogButtons) {
      assert.match(tag, /class="[^"]*\bui-button\b/, `a dialog control is not a .ui-button: ${tag}`);
    }
  });

  it("never lets focus imitate a chosen answer in the catch-up dialog", () => {
    const css = stripComments(style("pages/daily-check-in.css"));
    const focus = css.match(/\.catch-up-answer-option:focus-visible\s*{([^}]*)}/)?.[1];

    if (focus) {
      assert.doesNotMatch(focus, /background/, "focus must not fill the button like a selection");
      assert.doesNotMatch(focus, /(^|;|\s)color:/, "focus must not recolour the label");
    }
  });

  it("declares the focus ring's geometry in exactly one place", () => {
    const owners = [];
    for (const file of allRegisteredStyles()) {
      const css = stripComments(readFileSync(path.join(publicDir, file), "utf8"));
      for (const rule of walkRules(css)) {
        if (/outline-offset\s*:/.test(rule.body)) owners.push(`${file}: ${rule.selectors.trim()}`);
      }
    }

    assert.equal(
      owners.length,
      1,
      `the focus ring's geometry must have one owner, found ${owners.length}:\n${owners.join("\n")}`,
    );
    assert.match(owners[0], /globals\.css/, "that owner is the shared foundation layer");
  });

  it("draws the ring inside the control so it never doubles a border", () => {
    const globals = stripComments(style("globals.css"));
    const ring = globals.match(/:where\([^)]*\):focus-visible\s*{([^}]*)}/)?.[1] || "";

    assert.match(ring, /outline:\s*2px solid var\(--focus-ring-color\)/);
    assert.match(ring, /outline-offset:\s*-1px/, "a positive offset puts a gap between the ring and the border");
    for (const control of ["a", "button", "input", "select", "textarea", "summary"]) {
      assert.match(globals, new RegExp(`:where\\([^)]*\\b${control}\\b[^)]*\\):focus-visible`), `${control} must be covered`);
    }
  });

  it("shows the field ring to keyboard focus and hides it from a mouse click", () => {
    const globals = stripComments(style("globals.css"));
    const app = readFileSync(path.join(publicDir, "scripts", "app.js"), "utf8");

    const rule = globals.match(/:root\[data-input-modality="pointer"\][^{]*{([^}]*)}/);
    assert.ok(rule, "a pointer-modality exception must exist");
    assert.match(rule[0], /:where\(input, select, textarea\)/, "the exception covers fields");
    assert.doesNotMatch(rule[0], /\bbutton\b|\ba\b\s*,/, "buttons and links keep their ring");
    assert.match(rule[1], /outline:\s*none/);

    assert.match(app, /data-input-modality|inputModality/, "app.js records the modality");
    assert.match(app, /"pointerdown"/, "a pointer press marks pointer modality");
    assert.match(app, /FOCUS_MOVING_KEYS/, "only focus-moving keys mark keyboard modality");
  });

  it("never lets typing summon a focus ring", () => {
    const app = readFileSync(path.join(publicDir, "scripts", "app.js"), "utf8");
    const keys = app.match(/const FOCUS_MOVING_KEYS = new Set\(\[([\s\S]*?)\]\)/)?.[1] || "";

    assert.ok(keys, "the key allowlist must be explicit");
    for (const printable of ['"a"', '"A"', '"1"', '" "', '"Enter"']) {
      assert.ok(!keys.includes(printable), `${printable} must not move focus`);
    }
    for (const mover of ["Tab", "ArrowDown", "Escape"]) {
      assert.ok(keys.includes(`"${mover}"`), `${mover} moves focus and must count`);
    }
  });

  it("keeps the ring when the modality script never runs", () => {
    const globals = stripComments(style("globals.css"));
    assert.doesNotMatch(
      globals,
      /:root:not\(\[data-input-modality/,
      "the ring must be the default, with pointer as the exception - not the reverse",
    );
  });

  it("gives every filled control a ring it can actually be seen against", () => {
    const filled = [
      ["components/buttons.css", ".ui-button--primary:focus-visible"],
      ["components/buttons.css", ".ui-button--danger:focus-visible"],
      ["pages/daily-check-in.css", '.dashboard-action[aria-pressed="true"]:focus-visible'],
      ["pages/settings.css", '.settings-answer-yes[aria-pressed="true"]:focus-visible'],
    ];

    for (const [file, selector] of filled) {
      const css = stripComments(style(file));
      const index = css.indexOf(selector);
      assert.ok(index > -1, `${file} must give ${selector} a visible ring`);
      const body = css.slice(index).match(/{([^}]*)}/)?.[1] || "";
      assert.match(body, /outline-color:\s*var\(--focus-ring-on-deep\)/, `${selector} needs the light ring`);
    }
  });

  it("keeps a visible 2px focus ring distinct from hover", () => {
    const globals = stripComments(style("globals.css"));
    assert.match(globals, /:focus-visible\s*{[^}]*outline:\s*2px solid var\(--focus-ring-color\)/s);
  });

  it("keeps disabled controls inert", () => {
    const css = stripComments(style("components/buttons.css"));
    const disabled = css.match(/\.ui-button:disabled[^{]*{([^}]*)}/s)?.[1] || "";

    assert.match(disabled, /cursor:\s*not-allowed/);
    assert.match(disabled, /transform:\s*none/);
  });
});
