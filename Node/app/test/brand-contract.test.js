import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import en from "../src/i18n/locales/en.js";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFileSync(path.join(appRoot, relative), "utf8");

const LEGACY_ALLOWLIST = [
  {
    pattern: /noor:[a-z_]+/gi,
    reason: "Telegram callback payload consumed by already-delivered buttons",
  },
  {
    pattern:
      /(?:window\.)?NoOr(?:TrackStylesheet|SealStylesheets|HideLoading|StylesReady|RevealNewRows|StartPageTransition|ResetPageTransition)/g,
    reason: "window.NoOr* global read across script boundaries",
  },
  {
    pattern: /data-noor-[a-z-]*/gi,
    reason: "data-noor-* DOM hook matched by querySelector in app.js",
  },
  {
    pattern: /noor-loader(?:-[a-z]+)*/gi,
    reason: "loader class/keyframe shared by loading-head.ejs, the documents and app.js",
  },
  {
    pattern: /noor-node-app/g,
    reason: "npm package name; renaming it breaks lockfile and deployment paths",
  },
  {
    pattern: /\/opt\/noor|swapfile-noor/g,
    reason: "provisioned deployment path on existing servers",
  },
  {
    pattern: /what-noor-does/g,
    reason: "published Help deep link; the anchor outlives the heading text",
  },
];

const FILE_EXEMPTIONS = [
  {
    file: "test/page-transition.test.js",
    pattern: /\[\^"\]\*NoOr/g,
    reason: "asserts the inline handler still calls the legacy global prefix",
  },
];

const SCAN_ROOTS = ["src", "public/styles", "public/scripts", "test", "scripts"];
const SCAN_FILES = ["package.json", "README.md"];
const SCAN_EXTENSIONS = new Set([".js", ".mjs", ".ejs", ".css", ".json", ".md", ".sh"]);
const SCAN_SELF = "test/brand-contract.test.js";

function collectScannedFiles() {
  const files = [...SCAN_FILES];
  const pending = [...SCAN_ROOTS];
  while (pending.length) {
    const relativeDir = pending.pop();
    for (const entry of readdirSync(path.join(appRoot, relativeDir), { withFileTypes: true })) {
      const relative = path.posix.join(relativeDir, entry.name);
      if (entry.isDirectory()) pending.push(relative);
      else if (SCAN_EXTENSIONS.has(path.extname(entry.name))) files.push(relative);
    }
  }
  return files
    .filter((relative) => relative !== SCAN_SELF)
    .filter((relative) => statSync(path.join(appRoot, relative)).isFile());
}

function unclassifiedMatches(relative, contents) {
  let remaining = contents;
  for (const { pattern } of LEGACY_ALLOWLIST) remaining = remaining.replace(pattern, "");
  for (const exemption of FILE_EXEMPTIONS) {
    if (exemption.file === relative) remaining = remaining.replace(exemption.pattern, "");
  }
  return remaining
    .split("\n")
    .map((line, index) => ({ line: line.trim(), number: index + 1 }))
    .filter(({ line }) => /noor/i.test(line));
}

describe("Achimari brand contract", () => {
  it("names the product Achimari in the shared chrome dictionary", () => {
    assert.equal(en.header.logoTitle, "Achimari");
    assert.match(en.footer.copyright, /^Achimari\b/);
  });

  it("uses one spelling of the name in every dictionary string", () => {
    const offenders = [];
    const walk = (value, trail) => {
      if (typeof value === "string") {
        if (/Achi\s+Mari|AchiMari|ACHIMARI/.test(value)) offenders.push(`${trail}: ${value}`);
        return;
      }
      if (value && typeof value === "object") {
        for (const [key, nested] of Object.entries(value)) walk(nested, `${trail}.${key}`);
      }
    };
    walk(en, "en");

    assert.deepEqual(offenders, [], "the written brand is always exactly `Achimari`");
  });

  it("leaves no NoOr string in any user-facing dictionary value", () => {
    const offenders = [];
    const walk = (value, trail) => {
      if (typeof value === "string") {
        if (/noor/i.test(value)) offenders.push(`${trail}: ${value}`);
        return;
      }
      if (value && typeof value === "object") {
        for (const [key, nested] of Object.entries(value)) walk(nested, `${trail}.${key}`);
      }
    };
    walk(en, "en");

    assert.deepEqual(offenders, [], "every dictionary string is rebranded");
  });

  it("sends Achimari, not NoOr, in outbound Telegram copy", () => {
    const service = read("src/services/telegramService.js");

    for (const [, message] of service.matchAll(/sendMessage\([^,]+,\s*(["'`])((?:\\.|(?!\1).)*)\1/g)) {
      assert.doesNotMatch(message, /noor/i, `outbound Telegram copy still says NoOr: ${message}`);
    }
    assert.doesNotMatch(
      read("src/controllers/telegramController.js"),
      /"[^"]*NoOr[^"]*"/,
      "the test notification still says NoOr",
    );
  });

  it("keeps every legacy Telegram callback payload working", () => {
    const service = read("src/services/telegramService.js");

    for (const payload of [
      "noor:add_prayer",
      "noor:answer",
      "noor:answer_yes",
      "noor:answer_no",
      "noor:see_prayers",
      "noor:website",
      "noor:menu",
    ]) {
      assert.ok(
        service.includes(`"${payload}"`),
        `${payload} must keep working for buttons already delivered to users`,
      );
    }
  });

  it("classifies every remaining NoOr token against the legacy allowlist", () => {
    const defects = [];
    for (const relative of collectScannedFiles()) {
      const contents = readFileSync(path.join(appRoot, relative), "utf8");
      if (!/noor/i.test(contents)) continue;
      for (const { line, number } of unclassifiedMatches(relative, contents)) {
        defects.push(`${relative}:${number} ${line}`);
      }
    }

    assert.deepEqual(
      defects,
      [],
      "every visible NoOr must be rebranded; every retained one must be allowlisted with a reason",
    );
  });

  it("documents a reason for every allowlisted legacy identifier", () => {
    for (const entry of [...LEGACY_ALLOWLIST, ...FILE_EXEMPTIONS]) {
      assert.ok(entry.reason && entry.reason.length > 20, "each allowlist entry states why it stays");
    }
  });
});
