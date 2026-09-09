import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pageBundles, sharedScripts, sharedStyles } from "../src/config/assetSources.js";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const publicDir = path.join(root, "public");
const assetsDir = path.join(publicDir, "assets");

function readPublicFile(relativePath) {
  return readFileSync(path.join(publicDir, relativePath), "utf8");
}

function hashContent(content) {
  return createHash("sha256").update(content).digest("hex").slice(0, 12);
}

function normalizeCss(content) {
  return content
    .split("\n")
    .filter((line) => !line.trim().startsWith("@import"))
    .join("\n")
    .trim();
}

function writeHashedAsset(prefix, extension, content) {
  const fileName = `${prefix}.${hashContent(content)}.${extension}`;
  writeFileSync(path.join(assetsDir, fileName), content);
  return `/assets/${fileName}`;
}

rmSync(assetsDir, { force: true, recursive: true });
mkdirSync(assetsDir, { recursive: true });

const css = sharedStyles
  .map((file) => `/* ${file} */\n${normalizeCss(readPublicFile(file))}`)
  .join("\n\n");
const js = sharedScripts
  .map((file) => `/* ${file} */\n${readPublicFile(file)}`)
  .join("\n;\n");

const manifest = {
  css: writeHashedAsset("app", "css", css),
  js: writeHashedAsset("app", "js", js),
  pages: {},
};

for (const [pageId, bundle] of Object.entries(pageBundles)) {
  const entry = {};

  if (bundle.styles?.length) {
    const pageCss = bundle.styles
      .map((file) => `/* ${file} */\n${normalizeCss(readPublicFile(file))}`)
      .join("\n\n");
    entry.css = writeHashedAsset(pageId, "css", pageCss);
  }

  if (bundle.script) {
    entry.js = writeHashedAsset(pageId, "js", readPublicFile(bundle.script));
  }

  manifest.pages[pageId] = entry;
}

writeFileSync(path.join(assetsDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Built ${manifest.css}`);
console.log(`Built ${manifest.js}`);
for (const [pageId, entry] of Object.entries(manifest.pages)) {
  if (entry.css) console.log(`Built ${entry.css}`);
  if (entry.js) console.log(`Built ${entry.js}`);
}
