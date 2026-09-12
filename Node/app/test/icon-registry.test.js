import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { ICON_NAMES, renderIcon } from "../src/utils/icons.js";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFileSync(path.join(appRoot, relative), "utf8");
const uiDir = path.join(appRoot, "src", "views", "components", "ui");
const registry = JSON.parse(read("src/views/components/ui/icon-registry.json"));

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

/** Every `{ name: "…" }` handed to the shared icon partial. */
function requestedNames() {
  const requested = [];
  for (const relative of allViews()) {
    const markup = read(relative);
    for (const [call] of markup.matchAll(/include\(\s*["'][^"']*components\/ui\/icon["'][^)]*\)/g)) {
      const name = call.match(/name:\s*["']([^"']+)["']/);
      if (name) requested.push({ file: relative, name: name[1] });
    }
    for (const [, name] of markup.matchAll(/renderIcon\(\s*["']([^"']+)["']/g)) {
      requested.push({ file: relative, name });
    }
  }
  return requested;
}

/**
 * One icon family, vendored once, closed.
 *
 * The product may not take a runtime icon dependency, so the family is pulled
 * from official Phosphor source into a local registry. Phosphor's regular
 * weight is a 1.5px stroke on a 24px grid; it is drawn upstream as filled
 * outlines on a 256 unit grid, so scaling that one weight into one 24 viewBox
 * is what gives the family a single geometry and a single weight.
 */
describe("the icon registry is one closed family", () => {
  it("adds no runtime icon dependency", () => {
    const manifest = JSON.parse(read("package.json"));
    const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };

    for (const name of Object.keys(dependencies)) {
      assert.doesNotMatch(
        name,
        /phosphor|lucide|feather|heroicons|font-?awesome|material-icons|iconify|remixicon/i,
        `${name} is a runtime icon dependency`,
      );
    }
  });

  it("vendors every icon from the same Phosphor weight", () => {
    assert.equal(registry.weight, "regular", "the whole family is one weight");
    assert.equal(registry.sourceGrid, 256);
    assert.equal(registry.targetGrid, 24);
    assert.equal(registry.scale, 24 / 256, "the scale must turn the source grid into the 24px grid");

    for (const [name, icon] of Object.entries(registry.icons)) {
      assert.ok(icon.from, `${name} must record the upstream file it came from`);
      assert.ok(icon.d.startsWith("<path"), `${name} must be a filled outline path`);
      assert.doesNotMatch(icon.d, /stroke=|stroke-width=/, `${name} mixes a stroked drawing into a filled family`);
      assert.doesNotMatch(icon.d, /fill="(?!currentColor)/, `${name} hard-codes a colour`);
    }
  });

  it("renders one viewBox, one grid and one colour source for every icon", () => {
    for (const name of ICON_NAMES) {
      const svg = renderIcon(name);
      assert.match(svg, /viewBox="0 0 24 24"/, `${name} must use the shared 24px viewBox`);
      assert.match(svg, /width="24" height="24"/, `${name} must declare its intrinsic size`);
      assert.match(svg, /fill="currentColor"/, `${name} must take its colour from the text around it`);
      assert.match(svg, /transform="scale\(0\.09375\)"/, `${name} must be scaled onto the shared grid`);
      assert.match(svg, /class="ui-icon/, `${name} must carry the shared geometry class`);
    }
  });

  it("keeps the registry closed: an unknown name is an error, not a circle", () => {
    assert.throws(() => renderIcon("definitely-not-an-icon"), /Unknown icon/);
    assert.throws(() => renderIcon(""), /Unknown icon/);

    // The superseded partial rendered a bare circle for anything it did not
    // recognise, which shipped a visible defect silently. No fallback shape may
    // exist in the renderer or in the partial.
    assert.doesNotMatch(read("src/utils/icons.js"), /<circle/, "the renderer has no fallback shape");
    assert.doesNotMatch(read("src/views/components/ui/icon.ejs"), /<svg|<circle|<path/, "the partial draws nothing itself");
  });

  it("renders only names the registry actually holds", () => {
    for (const { file, name } of requestedNames()) {
      assert.ok(ICON_NAMES.includes(name), `${file} asks for "${name}", which is not in the registry`);
    }
  });

  it("holds no icon that nothing renders", () => {
    // An unused icon is dead weight in every page that ships the registry, and
    // it is how a family quietly becomes a library.
    const used = new Set(requestedNames().map(({ name }) => name));
    const unused = ICON_NAMES.filter((name) => !used.has(name));

    assert.deepEqual(
      unused,
      [],
      `these icons are vendored but never rendered — remove them from scripts/vendor-phosphor-icons.py:\n${unused.join("\n")}`,
    );
  });

  it("retains the Phosphor MIT licence beside the registry", () => {
    const licence = path.join(uiDir, "PHOSPHOR-LICENSE.txt");

    assert.ok(existsSync(licence), "the upstream licence must travel with the icons");
    const text = readFileSync(licence, "utf8");
    assert.match(text, /MIT License/);
    assert.match(text, /Phosphor Icons/);

    const generator = read("scripts/vendor-phosphor-icons.py");
    assert.match(generator, /phosphor-icons\/core/, "the upstream source must be recorded");
    assert.match(generator, /assets\/regular/, "the weight must be pinned in the vendoring script");
  });
});

describe("icons are accessible by construction", () => {
  it("hides a decorative icon from assistive technology", () => {
    const svg = renderIcon("shield");

    assert.match(svg, /aria-hidden="true"/, "an icon beside a visible label is noise to a screen reader");
    assert.match(svg, /focusable="false"/, "and it must never take focus");
    assert.doesNotMatch(svg, /role="img"/);
  });

  it("gives a labelled icon a real accessible name", () => {
    const svg = renderIcon("send", { label: "Share request" });

    assert.match(svg, /role="img"/);
    assert.match(svg, /aria-label="Share request"/);
    assert.doesNotMatch(svg, /aria-hidden/, "a named icon must not also be hidden");
  });

  it("escapes a label rather than writing it into the attribute raw", () => {
    const svg = renderIcon("send", { label: 'Share "now" & <later>' });

    assert.match(svg, /aria-label="Share &quot;now&quot; &amp; &lt;later&gt;"/);
    assert.doesNotMatch(svg, /aria-label="Share "now"/);
  });

  it("leaves every icon-only control with an accessible name of its own", () => {
    // An icon-only button is named by the button, not by the icon inside it, so
    // the icon stays decorative and the control carries the name.
    const offenders = [];

    for (const relative of allViews()) {
      const markup = read(relative);
      for (const [button] of markup.matchAll(/<button\b[\s\S]{0,900}?<\/button>/g)) {
        if (!/components\/ui\/icon|renderIcon\(/.test(button)) continue;
        // `<%= … %>` and `<%- … %>` emit text, so a button whose only label is a
        // translated string is named. `<% … %>` is control flow and is not.
        const withoutTags = button
          .replace(/<%[=-]([\s\S]*?)%>/g, "TEXT")
          .replace(/<%[\s\S]*?%>/g, "")
          .replace(/<[^>]*>/g, "")
          .replace(/&\w+;/g, "")
          .trim();
        const named =
          /aria-label="[^"]+"/.test(button) ||
          /aria-labelledby="[^"]+"/.test(button) ||
          /label:\s*["'][^"']+["']/.test(button) ||
          withoutTags.length > 0;
        if (!named) offenders.push(`${relative}: ${button.slice(0, 90).replace(/\s+/g, " ")}`);
      }
    }

    assert.deepEqual(offenders, [], "an icon-only control must name itself");
  });

  it("sizes every icon from the text it sits beside, in one place", () => {
    const material = read("public/styles/components/material.css");
    const rule = material.match(/\.ui-icon\s*\{[^}]*\}/s);

    assert.ok(rule, "the shared geometry must live in the material layer");
    assert.match(rule[0], /inline-size:\s*1(?:\.\d+)?em/, "an icon scales with its label, not with a fixed pixel size");
    assert.match(rule[0], /fill:\s*currentColor/);
    assert.match(material, /@media \(forced-colors: active\)[\s\S]*?\.ui-icon/, "icons must answer forced colours");

    // No page sheet may re-size the family; that is how stroke and box drift.
    const offenders = [];
    const pending = [path.join(appRoot, "public", "styles")];
    while (pending.length) {
      const dir = pending.pop();
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) pending.push(full);
        else if (entry.name.endsWith(".css")) {
          const relative = path.relative(appRoot, full);
          if (relative.endsWith("components/material.css")) continue;
          const css = readFileSync(full, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
          for (const [block] of css.matchAll(/[^{}]*\{[^}]*\}/g)) {
            const selector = block.slice(0, block.indexOf("{"));
            if (!/\.ui-icon\b/.test(selector)) continue;
            if (/(?:^|[;{]\s*)(?:width|height|inline-size|block-size|stroke-width):/.test(block)) {
              offenders.push(`${relative} — ${selector.trim().replace(/\s+/g, " ")}`);
            }
          }
        }
      }
    }
    assert.deepEqual(offenders, [], "only the shared layer sizes the icon family");
  });
});
