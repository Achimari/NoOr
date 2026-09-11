import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { sharedStyles } from "../src/config/assetSources.js";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFileSync(path.join(appRoot, relative), "utf8");

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

const BRAND_MARK = "src/views/components/ui/brand-mark.ejs";
const BRAND_SYMBOL = "src/views/components/ui/brand-symbol.ejs";

function pngDimensions(relative) {
  const image = readFileSync(path.join(appRoot, relative));
  assert.equal(image.toString("ascii", 1, 4), "PNG", `${relative} must be a PNG`);
  return { width: image.readUInt32BE(16), height: image.readUInt32BE(20) };
}

describe("Achimari wordmark and ascent mark", () => {
  it("renders the wordmark as selectable text, not an image", () => {
    const markup = read(BRAND_MARK);

    assert.doesNotMatch(markup, /<img/, "the wordmark must stay real text");
    assert.match(markup, /Achi/);
    assert.match(markup, /mari/);
  });

  it("keeps the DOM text and accessible name exactly `Achimari`", () => {
    const markup = read(BRAND_MARK);

    assert.match(markup, /<span class="brand-wordmark">Achimari<\/span>/);
    assert.doesNotMatch(markup, /brand-wordmark-(?:lead|tail)/, "the name must not be split into visual fragments");
    assert.doesNotMatch(markup, /aria-label="(?!Achimari")/, "no label may rename the wordmark");
  });

  it("draws an abstract mountain and seabird formation that stays decorative to assistive tech", () => {
    const lockup = read(BRAND_MARK);
    const symbol = read(BRAND_SYMBOL);

    assert.match(lockup, /include\("\.\/brand-symbol"/, "the lockup must use the shared symbol");
    assert.match(symbol, /<svg\b/);
    assert.match(symbol, /aria-hidden="true"/, "the mark is decorative; the text carries the name");
    assert.match(symbol, /focusable="false"/, "the mark must not become a tab stop in IE/Edge legacy");
    assert.equal((symbol.match(/<path\b/g) || []).length, 3, "one mountain ridge and two tiers of seabirds");
    assert.match(symbol, /M14 18 23 11 32 20 42 12 51 18/, "the upper path reads as distant birds in flight");
    assert.match(symbol, /M7 48 23 24 34 37 44 27 57 48/, "the dominant path forms an ascending mountain ridge");
    assert.match(symbol, /M14 53 23 44 31 52 M35 53 44 44 52 52/, "the foreground paths echo both peaks and seabirds");

    assert.doesNotMatch(symbol, /<circle|stroke-dasharray/, "the symbol must not return to a dot or broken ring");
  });

  it("uses the same symbol geometry in the interface, favicon and install icon", () => {
    const symbol = read(BRAND_SYMBOL);
    const paths = [...symbol.matchAll(/<path[^>]*d="([^"]+)"/g)].map((match) => match[1]);

    for (const asset of [
      "public/brand/achimari-mark.svg",
      "public/brand/achimari-symbol.svg",
      "public/brand/achimari-app-icon.svg",
      "public/brand/achimari-maskable-icon.svg",
    ]) {
      const contents = read(asset);
      paths.forEach((drawing) => assert.ok(contents.includes(drawing), `${asset} has drifted from the interface mark`));
    }
  });

  it("is the single owner of the brand lockup across header and auth", () => {
    for (const view of [
      "src/views/components/layout/header.ejs",
      "src/views/pages/partials/auth-login.ejs",
      "src/views/pages/partials/auth-onboarding.ejs",
    ]) {
      assert.match(read(view), /include\((?:"|')\.\.\/[^"']*brand-mark/, `${view} must use the shared lockup`);
    }
  });

  it("uses the light lockup wherever the auth screen gives it a dark plate", () => {
    for (const view of [
      "src/views/pages/partials/auth-login.ejs",
      "src/views/pages/partials/auth-onboarding.ejs",
    ]) {
      assert.match(read(view), /brand-mark[^\n]*tone:\s*"chrome"/, `${view} must contrast its dark brand plate`);
    }
  });

  it("retires every legacy raster identity from the rendered product", () => {
    for (const view of allViews()) {
      const markup = read(view);
      assert.doesNotMatch(markup, /logo-mark\.png|\/Logo\.png|favicon\.png/, `${view} still ships the old identity`);
    }
  });

  it("styles the lockup from a bundle every document loads", () => {
    assert.ok(sharedStyles.includes("styles/components/brand.css"), "brand.css must be a shared layer");
    assert.ok(existsSync(path.join(appRoot, "public", "styles", "components", "brand.css")));
  });
});

describe("Achimari favicon and loader", () => {
  it("declares the modern favicon, touch icon, mask and web app manifest", () => {
    for (const view of ["src/views/components/layout/document.ejs", "src/views/components/layout/auth-document.ejs"]) {
      const markup = read(view);
      const icons = [...markup.matchAll(/<link[^>]*rel="(?:icon|apple-touch-icon)"[^>]*href="([^"]+)"/g)];

      assert.ok(icons.length > 0, `${view} must declare an icon`);
      for (const [, href] of icons) {
        assert.ok(existsSync(path.join(appRoot, "public", href.replace(/^\//, ""))), `${href} is missing`);
        assert.match(href, /achimari/i, `${href} must be the Achimari mark`);
      }
      assert.match(markup, /rel="icon"[^>]*sizes="any"[^>]*achimari-mark\.svg/);
      assert.match(markup, /rel="icon"[^>]*sizes="32x32"[^>]*achimari-mark-32\.png/);
      assert.match(markup, /rel="apple-touch-icon"[^>]*sizes="180x180"[^>]*achimari-touch-icon\.png/);
      assert.match(markup, /rel="mask-icon"[^>]*achimari-symbol\.svg/);
      assert.match(markup, /rel="manifest"[^>]*site\.webmanifest/);
    }
  });

  it("ships raster icons at their declared sizes", () => {
    assert.deepEqual(pngDimensions("public/brand/achimari-mark-32.png"), { width: 32, height: 32 });
    assert.deepEqual(pngDimensions("public/brand/achimari-touch-icon.png"), { width: 180, height: 180 });
    assert.deepEqual(pngDimensions("public/brand/achimari-mark-192.png"), { width: 192, height: 192 });
    assert.deepEqual(pngDimensions("public/brand/achimari-mark-512.png"), { width: 512, height: 512 });
    assert.deepEqual(pngDimensions("public/brand/achimari-maskable-512.png"), { width: 512, height: 512 });
  });

  it("publishes installable icons through one valid manifest", () => {
    const manifest = JSON.parse(read("public/brand/site.webmanifest"));

    assert.equal(manifest.name, "Achimari");
    assert.equal(manifest.id, "/");
    assert.equal(manifest.theme_color, "#111111");
    assert.deepEqual(manifest.icons.map(({ src, sizes, purpose }) => ({ src, sizes, purpose })), [
      { src: "/brand/achimari-mark-192.png", sizes: "192x192", purpose: "any" },
      { src: "/brand/achimari-mark-512.png", sizes: "512x512", purpose: "any" },
      { src: "/brand/achimari-maskable-512.png", sizes: "512x512", purpose: "maskable" },
    ]);
    manifest.icons.forEach(({ src }) => {
      assert.ok(existsSync(path.join(appRoot, "public", src.replace(/^\//, ""))), `${src} is missing`);
    });
  });

  it("draws the loader as the original black field and white ring", () => {
    // Reversed deliberately by the owner: the monogram loader introduced with
    // the Achimari rebrand is replaced by the earlier black-field spinner
    // (commit 2ba01079). The loader is now a loading *gate*, and a plain
    // rotating ring reads as progress where a pulsing brand mark read as
    // decoration. The monogram remains the product's identity everywhere else —
    // favicon, touch icon, mask icon and manifest are all asserted above.
    const head = read("src/views/components/layout/loading-head.ejs");
    const documents = `${read("src/views/components/layout/document.ejs")}\n${read("src/views/components/layout/auth-document.ejs")}`;

    assert.match(head, /conic-gradient/, "the ring is drawn in CSS, with no asset to fetch");
    assert.match(head, /background:\s*#000/, "the field is black, as it was");
    assert.match(head, /noor-loader-mark/, "the legacy hook name stays; only the drawing changes");

    // The loader no longer pulls in the monogram, so neither document should
    // still be including it for that purpose.
    assert.equal((documents.match(/include\("\.\.\/ui\/brand-symbol"/g) || []).length, 0);
    assert.doesNotMatch(head, /noor-loader-symbol/, "the SVG wrapper class is gone with the SVG");
  });

  it("keeps the loader honest under reduced motion", () => {
    const head = read("src/views/components/layout/loading-head.ejs");
    const reduced = head.slice(head.indexOf("prefers-reduced-motion"));

    assert.match(reduced, /animation:\s*none/, "nothing loops when motion is reduced");
  });
});

describe("brand voice", () => {
  it("states the promise without inventing an etymology", () => {
    const dictionary = read("src/i18n/locales/en.js");

    assert.doesNotMatch(dictionary, /means?\s+["“]?(?:achievement|course|navigation)/i);
    assert.doesNotMatch(dictionary, /anchor|ship\s*wheel|compass rose|set sail|smooth sailing/i);
  });
});
