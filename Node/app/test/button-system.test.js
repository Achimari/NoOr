import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFileSync(path.join(appRoot, relative), "utf8");
const BUTTONS = "public/styles/components/buttons.css";

function allSourceStyles() {
  const files = [];
  const pending = [path.join(appRoot, "public", "styles")];
  while (pending.length) {
    const dir = pending.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) pending.push(full);
      else if (entry.name.endsWith(".css")) files.push(path.relative(appRoot, full));
    }
  }
  return files;
}

function allViews() {
  const views = [];
  const pending = [path.join(appRoot, "src", "views")];
  while (pending.length) {
    const dir = pending.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) pending.push(full);
      else if (entry.name.endsWith(".ejs")) views.push(path.relative(appRoot, full));
    }
  }
  return views;
}

const SPECIALISED = [
  { selector: ".dashboard-action", reason: "Today's Yes/No is a binary selection, not a submit action" },
  { selector: ".settings-answer-button", reason: "the same Yes/No selection, edited from Settings" },
  { selector: ".achievements-filter", reason: "a mutually exclusive filter, carrying aria-pressed" },
  { selector: ".explore-button", reason: "spell unlock and loadout actions, which the spec lists with battle moves" },
];

describe("one canonical ordinary button", () => {
  it("offers every ordinary variant from the one owner", () => {
    const css = read(BUTTONS);

    for (const variant of ["primary", "secondary", "quiet", "danger", "icon", "block"]) {
      assert.match(css, new RegExp(`\\.ui-button--${variant}\\b`), `.ui-button--${variant} must exist`);
    }
  });

  it("offers the default and the large commit size", () => {
    const css = read(BUTTONS);

    assert.match(css, /\.ui-button\s*\{[^}]*min-height:\s*var\(--tap-min\)/, "default target is 44px");
    assert.match(css, /\.ui-button--large\s*\{[^}]*min-height:\s*48px/, "a commit action is 48px");
  });

  it("owns every interaction state, including loading", () => {
    const css = read(BUTTONS);

    assert.match(css, /\.ui-button:disabled/);
    assert.match(css, /\.ui-button:active/);
    assert.match(css, /\.ui-button[^{]*:focus-visible/);
    assert.match(css, /\.ui-button[^{]*\[data-loading="true"\]/, "loading is a state of the one owner");
  });

  it("preserves the native hidden state", () => {
    const css = read(BUTTONS);

    assert.match(css, /\.ui-button\[hidden\]\s*\{[^}]*display:\s*none/s);
  });

  it("keeps a loading control the same width and blocks a second submit", () => {
    const css = read(BUTTONS);
    const loading = css.match(/\.ui-button\[data-loading="true"\][^{]*\{([^}]*)\}/)[1];

    assert.doesNotMatch(loading, /\bwidth:/, "a loading button must not resize and shift its neighbours");
    assert.match(css, /\[data-loading="true"\][^{]*\{[^}]*pointer-events:\s*none/, "loading blocks a repeat press");
  });

  it("gates every hover behind a real pointer", () => {
    const css = read(BUTTONS);
    const hovers = [...css.matchAll(/([^{}]*:hover[^{]*)\{/g)].map(([, selector]) => selector.trim());

    for (const selector of hovers) {
      const before = css.slice(0, css.indexOf(selector));
      const query = before.lastIndexOf("@media (hover: hover) and (pointer: fine)");
      const close = before.lastIndexOf("\n}");
      assert.ok(query > close, `${selector} must sit inside the pointer query`);
    }
  });

  it("never lets a disabled control answer a hover or a press", () => {
    const css = read(BUTTONS);

    for (const [, selector] of css.matchAll(/([^{}]*:(?:hover|active)[^{]*)\{/g)) {
      assert.match(selector, /:not\(:disabled\)/, `${selector.trim()} must exclude the disabled state`);
    }
  });
});

describe("the old general button system is gone", () => {
  it("declares no .btn base, primary or secondary anywhere", () => {
    for (const relative of allSourceStyles()) {
      const css = read(relative);
      assert.doesNotMatch(css, /(^|\n|,)\s*\.btn\s*[,{]/, `${relative} still owns the legacy .btn`);
      assert.doesNotMatch(css, /\.btn-(?:primary|secondary)\b/, `${relative} still owns a legacy .btn variant`);
    }
  });

  it("leaves no view emitting the legacy class", () => {
    for (const relative of allViews()) {
      assert.doesNotMatch(read(relative), /class="[^"]*\bbtn\b/, `${relative} still emits .btn`);
    }
  });

  it("keeps no unused parallel button component", () => {
    const legacy = "src/views/components/ui/button.ejs";
    if (!existsSync(path.join(appRoot, legacy))) return;

    const markup = read(legacy);
    assert.match(markup, /ui-button/);
    assert.doesNotMatch(markup, /"btn"/);
  });
});

describe("specialised controls are a documented exception, not a second system", () => {
  it("records a reason for each one", () => {
    for (const { selector, reason } of SPECIALISED) {
      assert.ok(reason.length > 20, `${selector} needs a stated reason to opt out`);
    }
  });

  it("still makes every specialised control consume the shared ergonomics", () => {
    for (const { selector } of SPECIALISED) {
      const owner = allSourceStyles().find((relative) =>
        new RegExp(`(^|\\n)\\${selector}\\s*[,{]`).test(read(relative)),
      );
      assert.ok(owner, `${selector} must be styled somewhere`);

      const css = read(owner);
      const block = css.match(new RegExp(`(^|\\n)\\${selector}\\s*\\{([^}]*)\\}`))[2];
      assert.match(
        block,
        /min-height:\s*(?:var\(--tap-min\)|calc\(var\(--tap-min\)|[4-9]\d)|padding/,
        `${selector} must take the shared target height`,
      );
      assert.doesNotMatch(block, /outline:/, `${selector} must not fork the focus ring`);
    }
  });
});
