import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const publicDir = path.join(root, "public");
const assetsDir = path.join(publicDir, "assets");

const cssFiles = [
  "styles/variables.css",
  "styles/globals.css",
  "styles/header/base.css",
  "styles/header/responsive.css",
  "styles/home/hero.css",
  "styles/home/dashboard.css",
  "styles/home/sections.css",
  "styles/home/home-layout.css",
  "styles/home/roadmap-and-links.css",
  "styles/home/auth.css",
  "styles/home/footer.css",
  "styles/home/responsive.css",
];

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

const css = [
  "@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700&display=swap');",
  ...cssFiles.map((file) => `/* ${file} */\n${normalizeCss(readPublicFile(file))}`),
]
  .join("\n\n");
const js = readPublicFile("scripts/app.js");

const manifest = {
  css: writeHashedAsset("app", "css", css),
  js: writeHashedAsset("app", "js", js),
};

writeFileSync(path.join(assetsDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Built ${manifest.css}`);
console.log(`Built ${manifest.js}`);
