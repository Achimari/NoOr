import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import ejs from "ejs";

import en from "../src/i18n/locales/en.js";
import { sharedStyles } from "../src/config/assetSources.js";
import { sharedViewLocals } from "./helpers/viewLocals.js";

/*
 * The phone navigation is a top Menu disclosure inside the masthead. It
 * replaced a bottom rail plus a More sheet (owner direction, 2026-09-13,
 * docs/mobile-redesign-v2). Every destination, the timezone control and the
 * POST logout that the rail carried are asserted here in their new home.
 */

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFileSync(path.join(appRoot, relative), "utf8");
const headerPath = path.join(appRoot, "src/views/components/layout/header.ejs");

const AUTH = { id: 1, name: "Press Fixture", timezone: "Europe/Riga", emblemKey: "dawn", accentKey: "neutral" };
const PRIMARY = en.header.nav.map((link) => [link.label, link.to]);

const render = (currentPath, auth = AUTH) =>
  ejs.renderFile(headerPath, {
    ...sharedViewLocals,
    currentPath,
    auth,
    t: (key, fallback) => (key === "header.nav" ? en.header.nav : fallback),
    getTimezoneLabel: () => "Riga",
    timezoneOptions: [{ value: "Europe/Riga", label: "Riga" }, { value: "UTC", label: "UTC" }],
  });

/** The Menu disclosure, from its opening tag to its close. */
const menuOf = (html) => {
  const start = html.indexOf("<details");
  assert.notEqual(start, -1, "the phone Menu is rendered");
  return html.slice(start, html.indexOf("</details>", start) + "</details>".length);
};
const summaryOf = (menu) => menu.slice(menu.indexOf("<summary"), menu.indexOf("</summary>"));
const hrefs = (html) => [...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map((m) => m[1]);

describe("the phone Menu is a native top disclosure", () => {
  it("is a <details> in the masthead, drawn as two lines and named Menu for assistive technology", async () => {
    const html = await render("/daily-check-in");
    const menu = menuOf(html);
    const summary = summaryOf(menu);

    assert.match(menu, /^<details[^>]*data-site-menu/);
    assert.match(summary, /<span class="sr-only">Menu<\/span>/, "the accessible name is real text, not an aria-label");
    assert.equal((summary.match(/<span class="site-menu-line" aria-hidden="true"><\/span>/g) || []).length, 2);
    assert.ok(html.indexOf("<details") > html.indexOf('class="header-actions"'), "it sits in the top header's actions");
  });

  it("leaves expanded state to the native summary rather than a static aria-expanded that goes stale without script", async () => {
    const summary = summaryOf(menuOf(await render("/daily-check-in")));

    assert.doesNotMatch(summary, /aria-expanded|aria-controls|role=/);
  });

  it("lists the five primary destinations first, in the existing order, as real links", async () => {
    const menu = menuOf(await render("/daily-check-in"));
    const primary = hrefs(menu).slice(0, 5);

    assert.deepEqual(primary, PRIMARY.map(([, to]) => to));
    for (const [label, to] of PRIMARY) {
      assert.match(menu, new RegExp(`<a[^>]*href="${to}"[^>]*>\\s*${label}\\s*</a>`), `${label} keeps its label`);
    }
  });

  it("follows them with the account group, then the timezone control, then a POST logout", async () => {
    const menu = menuOf(await render("/daily-check-in"));
    const at = (needle) => menu.indexOf(needle);

    assert.deepEqual(hrefs(menu).slice(5), ["/profile", "/achievements", "/settings"]);
    assert.ok(at('href="/battle"') < at('href="/profile"'), "Battle is not filed under Account");
    assert.ok(at('href="/settings"') < at("data-mobile-timezone-toggle"));
    assert.ok(at("data-mobile-timezone-toggle") < at('action="/logout"'));
    assert.match(menu, /<form[^>]*action="\/logout"[^>]*method="post"/);
    assert.doesNotMatch(menu, /href="\/logout"/, "signing out must not be a GET");
    assert.match(menu, /Region \/ Time zone/);
  });

  it("marks only the current destination's link, never the Menu control", async () => {
    for (const current of ["/statistics", "/battle", "/settings"]) {
      const menu = menuOf(await render(current));
      const marked = [...menu.matchAll(/<a\b[^>]*aria-current="page"[^>]*>/g)].map((m) => m[0]);

      assert.equal(marked.length, 1, `${current}: exactly one link is current`);
      assert.match(marked[0], new RegExp(`href="${current}"`));
      assert.doesNotMatch(summaryOf(menu), /aria-current/);
    }
  });

  it("marks the current destination on the desktop row too", async () => {
    const html = await render("/community");
    const desktop = html.slice(html.indexOf('class="header-nav"'), html.indexOf("</nav>", html.indexOf('class="header-nav"')));

    assert.match(desktop, /<a[^>]*href="\/community"[^>]*aria-current="page"/);
    assert.equal((desktop.match(/aria-current/g) || []).length, 1);
  });

  it("keeps Help a single direct link beside Menu, outside the panel", async () => {
    const html = await render("/daily-check-in");
    const menu = menuOf(html);

    assert.equal((html.match(/href="\/help"/g) || []).length, 1);
    assert.doesNotMatch(menu, /href="\/help"/);
    assert.ok(html.indexOf('href="/help"') < html.indexOf("<details"), "Help comes before Menu");
    assert.ok(html.indexOf('href="/help"') < html.indexOf("data-account-menu"), "and before the desktop account control");
  });

  it("is ordinary site navigation, not an application menu", async () => {
    const html = await render("/daily-check-in");

    assert.doesNotMatch(html, /role="(menu|menuitem|menubar|tablist|tab)"/);
    assert.match(menuOf(html), /<nav[^>]*aria-label=/);
  });

  it("renders no duplicate ids and every aria-controls target exists", async () => {
    const html = await render("/daily-check-in");
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);

    assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), []);
    for (const [, target] of html.matchAll(/aria-controls="([^"]+)"/g)) {
      assert.ok(ids.includes(target), `aria-controls="${target}" names a real element`);
    }
  });

  it("gives a signed-out reader the same Menu with destinations only", async () => {
    const html = await render("/login", null);
    const menu = menuOf(html);

    assert.deepEqual(hrefs(menu), PRIMARY.map(([, to]) => to));
    assert.doesNotMatch(menu, /logout|timezone/i);
    assert.match(html, /href="\/login"/);
    assert.doesNotMatch(html, /data-header-menu-toggle/, "the old hamburger overlay is gone");
  });
});

describe("there is no bottom navigation left", () => {
  it("retires the rail's markup, stylesheet and document include", () => {
    assert.equal(existsSync(path.join(appRoot, "src/views/components/layout/mobile-nav.ejs")), false);
    assert.equal(existsSync(path.join(appRoot, "public/styles/components/mobile-nav.css")), false);
    assert.doesNotMatch(read("src/views/components/layout/document.ejs"), /mobile-nav/);
    assert.equal(sharedStyles.some((href) => href.includes("mobile-nav")), false);
  });

  it("reserves no bottom clearance anywhere: no rail token, no scroll-padding at the end", () => {
    for (const file of ["public/styles/variables.css", "public/styles/globals.css", "public/styles/shell.css", "public/scripts/app.js"]) {
      assert.doesNotMatch(read(file), /mobile-nav-height|mobile-nav-row|scroll-padding-block-end/, file);
    }
  });

  it("fixes one layer only, the open Menu panel, and anchors it at the masthead rather than the bottom edge", () => {
    const base = read("public/styles/header/base.css");
    const responsive = read("public/styles/header/responsive.css");

    assert.doesNotMatch(base, /position:\s*fixed/);
    assert.equal((responsive.match(/position:\s*fixed/g) || []).length, 1);
    assert.match(responsive, /\.site-menu-panel\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*var\(--site-menu-top, var\(--header-height\)\) 0 0/);
  });

  it("still gives an active battle the whole screen: the masthead, and the Menu inside it, stand down", () => {
    assert.match(
      read("public/styles/game/battle-arena.css"),
      /body:has\(\[data-battle-page\]\[data-battle-focus="true"\]\) \.header \{ display: none; \}/,
    );
  });
});

describe("the masthead has one size owner and stays out of the way", () => {
  const base = () => read("public/styles/header/base.css");
  const responsive = () => read("public/styles/header/responsive.css");

  it("sizes the header from one token, with no competing compact height", () => {
    assert.match(read("public/styles/variables.css"), /--header-height:\s*56px/);
    assert.doesNotMatch(read("public/styles/variables.css") + read("public/styles/globals.css"), /--header-height-compact/);
    assert.doesNotMatch(responsive(), /top:\s*5\dpx/, "no hand-copied masthead heights");
  });

  it("shows the Menu only in the phone range and the desktop row only above it", () => {
    assert.match(base(), /\.site-menu\s*\{[^}]*display:\s*none/);
    const phone = responsive().slice(responsive().indexOf("@media (max-width: 959px)"));
    assert.match(phone, /\.site-menu\s*\{[^}]*display:\s*block/);
    assert.match(phone, /\.header-nav,\s*\.header-account\s*\{[^}]*display:\s*none/);
  });

  it("wraps the controls under the brand at enlarged text instead of letting them overlap it", () => {
    const phone = responsive().slice(responsive().indexOf("@media (max-width: 959px)"));

    assert.match(phone, /\.header-container\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap/);
    assert.match(phone, /\.header-actions\s*\{[^}]*margin-inline-start:\s*auto/, "the controls stay right-aligned on their own row");
  });

  it("keeps the Menu control and every panel row at the 44px target floor", () => {
    const phone = responsive().slice(responsive().indexOf("@media (max-width: 959px)"));

    assert.match(phone, /\.site-menu-toggle\s*\{[^}]*width:\s*var\(--tap-min\);[^}]*height:\s*var\(--tap-min\)/);
    assert.match(phone, /\.site-menu-link\s*\{[^}]*min-height:\s*var\(--tap-min\)/);
  });

  it("crosses the two lines into an X while open, by transform, and keeps them visible in forced colours", () => {
    const phone = responsive().slice(responsive().indexOf("@media (max-width: 959px)"));

    assert.match(phone, /\.site-menu\[open\] \.site-menu-line\s*\{\s*transform:\s*rotate\(45deg\)/);
    assert.match(phone, /\.site-menu\[open\] \.site-menu-line \+ \.site-menu-line\s*\{\s*transform:\s*rotate\(-45deg\)/);
    assert.match(phone, /\.site-menu-line\s*\{[^}]*transition:\s*transform/);
    assert.match(phone, /forced-colors: active\)\s*\{\s*\.site-menu-line\s*\{[^}]*CanvasText/);
  });

  it("marks the current row with a shape that survives forced colours", () => {
    const phone = responsive().slice(responsive().indexOf("@media (max-width: 959px)"));

    assert.match(phone, /\.site-menu-link\[aria-current="page"\]\s*\{[^}]*border-inline-start-color:\s*var\(--white\)[^}]*font-weight/);
    assert.match(phone, /forced-colors: active\)\s*\{\s*\.site-menu-link\[aria-current="page"\]\s*\{[^}]*Highlight/);
  });

  it("switches to the Menu at one width, shared by the stylesheet and the controller", () => {
    const css = responsive();
    const script = read("public/scripts/account-menu.js");

    assert.match(css, /@media \(max-width: 959px\) \{/);
    assert.match(script, /matchMedia\?\.\("\(max-width: 959px\)"\)/);
    assert.match(script, /innerWidth <= 959\)/, "the desktop account panel closes at the same width");
    const code = (css + script).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    assert.doesNotMatch(code, /\b(760|920|921)px?\b/, "no second header breakpoint survives");
  });

  it("fills the screen under the masthead with one scroll area of its own", () => {
    const panel = responsive().match(/\.site-menu-panel\s*\{([^}]*)\}/)?.[1] || "";

    assert.match(panel, /inset:\s*var\(--site-menu-top, var\(--header-height\)\) 0 0/);
    assert.match(panel, /overflow-y:\s*auto/);
    assert.match(panel, /overscroll-behavior:\s*contain/);
  });

  it("stops the page scrolling only while the Menu is open, derived in CSS so no class can be stranded", () => {
    const phone = responsive().slice(responsive().indexOf("@media (max-width: 959px)"));

    assert.match(phone, /html:has\(\.site-menu\[open\]\)\s*\{\s*overflow:\s*hidden;\s*\}/);
    assert.doesNotMatch(read("public/styles/header/base.css"), /site-menu\[open\]/, "never outside the Menu range");
    assert.equal((responsive().match(/html:has\(/g) || []).length, 1, "one page lock, owned by the Menu");
  });

  it("opens like apple.com: the field grows down and the destinations arrive in sequence", () => {
    const css = responsive();
    const delays = [...css.matchAll(/\.site-menu\[open\][^{]*\{\s*animation-delay:\s*(\d+)ms/g)].map((m) => Number(m[1]));

    assert.match(css, /@keyframes site-menu-reveal\s*\{\s*from\s*\{\s*clip-path:\s*inset\(0 0 100% 0\)/);
    assert.match(css, /@keyframes site-menu-item-in\s*\{\s*from\s*\{\s*opacity:\s*0;\s*transform:\s*translateY\(-8px\)/);
    assert.deepEqual(delays, [40, 70, 100, 130, 160, 190], "five destinations, then the account group, 30ms apart");
    assert.match(css, /\.site-menu-list--primary \.site-menu-link\s*\{[^}]*font-size:\s*1\.55rem/);
  });

  it("replaces the reveal and the stagger with a plain fade under reduced motion", () => {
    const reduced = responsive().slice(responsive().indexOf("prefers-reduced-motion"));

    assert.match(reduced, /\.site-menu-panel\s*\{\s*animation-name:\s*site-menu-fade/);
    assert.match(reduced, /\.site-menu-group\s*\{\s*animation:\s*none/);
  });

  it("gates every hover affordance behind a real pointer", () => {
    const css = base() + responsive();
    for (const block of css.split("@media").slice(1)) {
      if (!/\.site-menu[^{]*:hover/.test(block)) continue;
      assert.match(block, /^\s*\(hover: hover\) and \(pointer: fine\)/);
    }
    assert.doesNotMatch(css.split("@media")[0], /\.site-menu[^{]*:hover/);
  });
});

describe("Today spends the space the shell gave back on content", () => {
  it("opens the phone page on the 16px gutter instead of a taller band", () => {
    const css = read("public/styles/pages/daily-check-in.css");
    const phone = css.slice(css.indexOf("@media (max-width: 760px)"));

    assert.match(phone, /\.today-page \.today-opening \{\s*padding-block:\s*var\(--space-4\);\s*\}/);
  });
});

describe("the Menu keeps what the rail carried", () => {
  it("lists every time zone with the reader's own marked, in the phone panel", async () => {
    const menu = menuOf(await render("/daily-check-in"));
    const panel = menu.slice(menu.indexOf("data-mobile-timezone-panel"));

    assert.match(panel, /data-mobile-timezone-search/);
    assert.equal((panel.match(/data-timezone-option=/g) || []).length, 2);
    assert.match(panel, /aria-current="true"[^>]*data-timezone-option="Europe\/Riga"/);
    assert.match(menu, /<div[^>]*id="site-menu-timezone-panel"[^>]*hidden/, "the list starts closed");
  });

  it("marks no Menu row current on Help, where the direct shortcut carries the state", async () => {
    const html = await render("/help");

    assert.doesNotMatch(menuOf(html), /aria-current="page"/);
    assert.match(html, /<a[^>]*href="\/help"[^>]*aria-current="page"/);
  });

  it("renders one masthead per document, with no second navigation after the page body", () => {
    const documentView = read("src/views/components/layout/document.ejs");

    assert.equal((documentView.match(/include\("\.\/header"/g) || []).length, 1);
    assert.ok(documentView.indexOf('include("./header"') < documentView.indexOf("<%- body %>"));
    assert.equal(documentView.slice(documentView.indexOf("<%- body %>")).includes("include("), false);
  });
});

describe("the Menu controller stays non-modal", () => {
  const script = () => read("public/scripts/account-menu.js").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

  it("has one owner: the header controls script, not app.js", () => {
    assert.match(script(), /\[data-site-menu\]/);
    assert.doesNotMatch(read("public/scripts/app.js"), /data-site-menu|data-mobile-more|data-header-menu-toggle/);
  });

  it("measures the masthead's lower edge when Menu is pressed, for the full-screen panel", () => {
    assert.match(script(), /siteMenuToggle\?\.addEventListener\("click"[\s\S]*?setProperty\("--site-menu-top"/);
  });

  it("takes no scroll lock in script and makes nothing inert", () => {
    assert.doesNotMatch(script(), /overflow\s*=|inert|scroll-lock|header-menu-open/);
  });
});
