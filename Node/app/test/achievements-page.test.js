import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import vm from "node:vm";
import ejs from "ejs";

import { sharedViewLocals } from "./helpers/viewLocals.js";

import pageRoutes from "../src/routes/pageRoutes.js";
import { renderAchievementsPage } from "../src/controllers/achievementController.js";
import { getPageAssets } from "../src/middleware/viewLocals.js";
import { pageBundles, sharedStyles } from "../src/config/assetSources.js";
import { ACHIEVEMENT_STATUS } from "../src/domain/achievements.js";
import { getAchievementsForUser } from "../src/services/achievementService.js";

const contentPath = fileURLToPath(
  new URL("../src/views/pages/partials/achievements-content.ejs", import.meta.url),
);
const pagePath = fileURLToPath(new URL("../src/views/pages/achievements.ejs", import.meta.url));
const sealPath = fileURLToPath(
  new URL("../src/views/components/game/achievement-seal.ejs", import.meta.url),
);
const headerPath = fileURLToPath(new URL("../src/views/components/layout/header.ejs", import.meta.url));
const profilePartialPath = fileURLToPath(
  new URL("../src/views/pages/partials/profile-content.ejs", import.meta.url),
);
const clientScriptPath = fileURLToPath(
  new URL("../public/scripts/pages/achievements.js", import.meta.url),
);
const pageStylesPath = fileURLToPath(
  new URL("../public/styles/game/achievements.css", import.meta.url),
);
const buildAssetsPath = fileURLToPath(new URL("../scripts/build-assets.js", import.meta.url));

function gatewayFor({ sourceOverrides = {}, unlocks = [] } = {}) {
  return {
    async findAchievementSources() {
      return {
        gameProfile: { allocationConfirmedAt: new Date("2026-01-01T09:00:00.000Z"), accentKey: "blue" },
        strongRows: ["2026-01-01", "2026-01-02", "2026-01-03"].map((dateKey) => ({ dateKey, answer: "YES" })),
        readingRows: ["2026-01-01", "2026-01-02"].map((dateKey) => ({
          dateKey,
          answer: "YES",
          hasReflection: true,
          bookCodes: ["GEN"],
        })),
        goalRows: [],
        goalCheckInDateKeys: ["2026-01-01", "2026-01-02"],
        spellKeys: [],
        completedEncounterKeys: [],
        qualifyingPvpMatches: 0,
        ...sourceOverrides,
      };
    },
    async findAchievementUnlocks() {
      return unlocks;
    },
    async createAchievementUnlocks() {
      return 0;
    },
  };
}

async function buildView(options) {
  return getAchievementsForUser(7, gatewayFor(options));
}

async function renderContent(achievements) {
  return ejs.renderFile(contentPath, {
    ...sharedViewLocals,
    achievements,
    t: () => "",
    siteData: { socialLinks: [] },
  });
}

describe("achievements route and controller", () => {
  it("registers one authenticated GET /achievements behind a dedicated controller", () => {
    const layers = pageRoutes.stack.filter((layer) => layer.route?.path === "/achievements");

    assert.equal(layers.length, 1);
    assert.deepEqual(Object.keys(layers[0].route.methods), ["get"]);
    assert.equal(layers[0].route.stack[0].name, "requireAuth");
    assert.equal(layers[0].route.stack.length, 2);
  });

  it("does not expose an achievement detail route or an unlock endpoint", () => {
    const paths = pageRoutes.stack.filter((layer) => layer.route).map((layer) => layer.route.path);

    assert.equal(paths.some((path) => path.startsWith("/achievements/")), false);
    const source = readFileSync(new URL("../src/routes/apiRoutes.js", import.meta.url), "utf8");
    assert.doesNotMatch(source, /achievement/i);
  });

  it("renders the achievements page for the signed-in user only", async () => {
    let rendered = null;
    const loaded = [];
    const controller = renderAchievementsPage(async (userId) => {
      loaded.push(userId);
      return { total: 26 };
    });

    await controller(
      { user: { id: 12 }, params: { id: 99 }, query: { userId: 99 }, body: { userId: 99 } },
      { render: (view, data) => { rendered = { view, data }; } },
    );

    assert.deepEqual(loaded, [12]);
    assert.equal(rendered.view, "pages/achievements");
    assert.equal(rendered.data.pageId, "achievements");
    assert.equal(rendered.data.title, "Achievements");
    assert.deepEqual(rendered.data.achievements, { total: 26 });
  });

  it("wires the page view to the shared document layout and the content partial", () => {
    const source = readFileSync(pagePath, "utf8");

    assert.match(source, /components\/layout\/document/);
    assert.match(source, /partials\/achievements-content/);
  });
});

describe("achievements page markup", () => {
  it("states the summary once, under a single h1", async () => {
    const html = await renderContent(await buildView());

    assert.equal(html.match(/<h1/g).length, 1);
    assert.match(html, /Achievements<\/h1>/);
    assert.match(html, /Milestones earned through your daily practice and battles/);
    assert.match(html, /of 26 earned/);
    assert.match(html, /<progress[^>]*max="26"/);
  });

  it("renders the four category sections in catalog order with labelled headings", async () => {
    const html = await renderContent(await buildView());
    const headings = [...html.matchAll(/<h2[^>]*id="([^"]+)"[^>]*>\s*([^<]+?)\s*</g)]
      .map((match) => match[2]);

    assert.deepEqual(headings.filter((heading) => [
      "Foundations",
      "Daily rhythm",
      "Reflection and learning",
      "Trials",
    ].includes(heading)), ["Foundations", "Daily rhythm", "Reflection and learning", "Trials"]);

    [...html.matchAll(/aria-labelledby="([^"]+)"/g)].forEach((match) => {
      assert.ok(html.includes(`id="${match[1]}"`), `missing label target ${match[1]}`);
    });
  });

  it("renders all twenty-six achievements as articles with a stable key", async () => {
    const html = await renderContent(await buildView());

    assert.equal((html.match(/data-achievement-card/g) || []).length, 26);
    assert.equal((html.match(/<article/g) || []).length, 26);
    assert.match(html, /data-achievement-key="first-check-in"/);
    assert.match(html, /data-achievement-key="first-friendly-spar"/);
  });

  it("says every state in words, never in colour alone", async () => {
    const html = await renderContent(await buildView({
      unlocks: [{ achievementKey: "first-check-in", unlockedAt: new Date("2026-08-01T09:00:00.000Z") }],
    }));

    assert.match(html, /data-status="EARNED"/);
    assert.match(html, /data-status="IN_PROGRESS"/);
    assert.match(html, /data-status="NOT_STARTED"/);
    assert.match(html, />\s*Earned\s*</);
    assert.match(html, />\s*In progress\s*</);
    assert.match(html, />\s*Not started\s*</);
    assert.match(html, /<time datetime="2026-08-01T09:00:00\.000Z">1 Aug 2026<\/time>/);
  });

  it("gives every progress bar an accessible name and complete values", async () => {
    const html = await renderContent(await buildView());
    const progressTags = html.match(/<progress[^>]*>/g) || [];

    assert.ok(progressTags.length > 1);
    progressTags.forEach((tag) => {
      assert.match(tag, /max="\d+"/, tag);
      assert.match(tag, /value="\d+"/, tag);
      assert.match(tag, /aria-label="[^"]+"/, tag);
    });
  });

  it("shows a requirement and a numeric progress reading on a locked milestone", async () => {
    const html = await renderContent(await buildView());

    assert.match(html, /Answer Yes to the Strong check-in on seven days in a row\./);
    assert.match(html, /3\s*\/\s*7/);
  });

  it("offers one explicit next-step link on locked cards and none on earned cards", async () => {
    const html = await renderContent(await buildView({
      unlocks: [{ achievementKey: "first-check-in", unlockedAt: new Date("2026-08-01T09:00:00.000Z") }],
    }));

    const earnedCard = html.slice(
      html.indexOf('data-achievement-key="first-check-in"'),
      html.indexOf('data-achievement-key="first-reading"'),
    );
    assert.doesNotMatch(earnedCard, /achievements-card-link/);
    assert.match(html, /Continue in Daily Check-in/);
    assert.match(html, /Go to Battle/);
    assert.match(html, /Open Spells/);
    assert.doesNotMatch(html, /<a\s[^>]*data-achievement-card/);
  });

  it("shows the latest earned achievement and up to three closest next steps", async () => {
    const html = await renderContent(await buildView({
      unlocks: [{ achievementKey: "first-reading", unlockedAt: new Date("2026-08-02T09:00:00.000Z") }],
    }));

    assert.match(html, /Latest earned/);
    assert.match(html, /Closest next/);
    assert.match(html, /Open the Book/);
    assert.equal((html.match(/data-achievement-next/g) || []).length, 3);
  });

  it("gives a useful zero state when nothing has been earned yet", async () => {
    const html = await renderContent(await buildView({
      sourceOverrides: {
        gameProfile: null,
        strongRows: [],
        readingRows: [],
        goalRows: [],
        goalCheckInDateKeys: [],
      },
    }));

    assert.match(html, /Nothing earned yet/);
    assert.match(html, /First Step/);
    assert.equal((html.match(/data-achievement-next/g) || []).length, 3);
  });

  it("says so plainly when there is nothing left to work toward", async () => {
    const view = await buildView();
    view.closestNext = [];
    view.latest = view.categories[0].items[0];
    const html = await renderContent(view);

    assert.match(html, /Every achievement in the catalog is earned/);
    assert.equal((html.match(/data-achievement-next/g) || []).length, 0);
  });

  it("renders four state filters with counts and a polite live region", async () => {
    const html = await renderContent(await buildView());

    assert.match(html, /data-achievement-filter="all"[^>]*aria-pressed="true"/);
    assert.match(html, /data-achievement-filter="EARNED"[^>]*aria-pressed="false"/);
    assert.match(html, /data-achievement-filter="IN_PROGRESS"[^>]*aria-pressed="false"/);
    assert.match(html, /data-achievement-filter="NOT_STARTED"[^>]*aria-pressed="false"/);
    assert.match(html, /aria-live="polite"[^>]*data-achievements-status|data-achievements-status[^>]*aria-live="polite"/);
    assert.match(html, /Showing all 26 achievements\./);
  });

  it("leaves everything visible when JavaScript never runs", async () => {
    const html = await renderContent(await buildView());

    assert.doesNotMatch(html, /data-achievement-card[^>]*\shidden/);
    assert.doesNotMatch(html, /data-achievement-category[^>]*\shidden/);
  });

  it("passes only the sanitized accent key to the page", async () => {
    const html = await renderContent(await buildView());
    assert.match(html, /data-accent="blue"/);

    const neutral = await renderContent(await buildView({
      sourceOverrides: { gameProfile: { allocationConfirmedAt: null, accentKey: "url(javascript:1)" } },
    }));
    assert.match(neutral, /data-accent="neutral"/);
    assert.doesNotMatch(neutral, /javascript:/);
  });

  it("never renders private source text", async () => {
    const html = await renderContent(await buildView());

    assert.doesNotMatch(html, /2026-01-01/);
    assert.doesNotMatch(html, /GEN/);
    assert.doesNotMatch(html, /hasReflection/);
  });
});

describe("achievement seal component", () => {
  async function renderSeal(locals) {
    return ejs.renderFile(sealPath, {
    ...sharedViewLocals,
      iconKey: "first-step",
      status: ACHIEVEMENT_STATUS.EARNED,
      percent: 100,
      ...locals,
    });
  }

  it("renders a decorative inline SVG from the closed icon allowlist", async () => {
    const html = await renderSeal({ iconKey: "open-book", status: "IN_PROGRESS", percent: 40 });

    assert.match(html, /aria-hidden="true"/);
    assert.match(html, /<svg/);
    assert.match(html, /data-icon="open-book"/);
    assert.doesNotMatch(html, /<img|<script|onerror|href="http/);
  });

  it("falls back to a neutral mark for a key it does not know", async () => {
    const html = await renderSeal({ iconKey: "<script>alert(1)</script>" });

    assert.match(html, /data-icon="fallback"/);
    assert.doesNotMatch(html, /<script>/);
  });

  it("draws the progress ring from the server-computed percentage only", async () => {
    const empty = await renderSeal({ status: "NOT_STARTED", percent: 0 });
    const half = await renderSeal({ status: "IN_PROGRESS", percent: 50 });

    assert.match(empty, /--ach-ring-offset:\s*131\.9\d+/);
    assert.match(half, /--ach-ring-offset:\s*65\.9\d+/);
  });

  it("renders every catalog icon key with its own mark", async () => {
    const iconKeys = [
      "first-step", "open-book", "reflection", "five-checks", "character",
      "three-part-day", "strong", "tasks", "library", "spell", "spellbook",
      "doubt", "focus", "rise", "three-trials", "spar",
    ];

    for (const iconKey of iconKeys) {
      const html = await renderSeal({ iconKey });
      assert.match(html, new RegExp(`data-icon="${iconKey}"`), iconKey);
    }
  });
});

describe("achievements navigation", () => {
  async function renderHeader(currentPath) {
    return ejs.renderFile(headerPath, {
    ...sharedViewLocals,
      currentPath,
      pageId: "achievements",
      auth: { id: 3, timezone: "Europe/Riga", isTelegramLinked: false },
      t: (key, fallback) => (key === "header.nav" ? [{ label: "Battle", to: "/battle" }] : fallback ?? ""),
      timezoneOptions: [{ value: "Europe/Riga", label: "Riga" }],
      getTimezoneLabel: () => "Riga",
    });
  }

  it("adds Achievements directly after My Profile in the desktop account disclosure", async () => {
    const html = await renderHeader("/daily-check-in");
    const panel = html.slice(html.indexOf('id="account-panel"'));

    assert.ok(panel.indexOf('href="/profile"') < panel.indexOf('href="/achievements"'));
    assert.match(panel, /href="\/achievements"[^>]*data-account-item>Achievements<\/a>/);
  });

  it("adds Achievements directly after My Profile in the mobile Account section", async () => {
    const html = await renderHeader("/daily-check-in");
    const mobile = html.slice(html.indexOf("data-mobile-account"), html.indexOf('id="mobile-timezone-panel"'));

    assert.ok(mobile.indexOf('href="/profile"') < mobile.indexOf('href="/achievements"'));
    assert.match(mobile, /header-nav-account-link[^>]*>Achievements<\/a>/);
  });

  it("marks both Achievements links active on the achievements page", async () => {
    const html = await renderHeader("/achievements");
    const links = [...html.matchAll(/<a[^>]*href="\/achievements"[^>]*>/g)].map((match) => match[0]);

    assert.equal(links.length, 2);
    links.forEach((link) => assert.match(link, /active/));
  });

  it("does not add a sixth primary desktop navigation item", async () => {
    const en = (await import("../src/i18n/locales/en.js")).default;

    assert.equal(en.header.nav.length, 5);
    assert.equal(en.header.nav.some((link) => link.to === "/achievements"), false);
  });

  it("puts Achievements beside Spells in the owner's Profile header only", () => {
    const source = readFileSync(profilePartialPath, "utf8");
    const head = source.slice(source.indexOf('class="profile-head"'), source.indexOf("if (needsAllocation)"));

    assert.match(head, /profile-head-links/);
    assert.match(head, /href="#spells"/);
    assert.match(head, /href="\/achievements"/);
    assert.match(head, /profile\.isOwner/);
  });
});

describe("achievements page assets", () => {
  it("serves the page-scoped bundle in development", () => {
    assert.deepEqual(getPageAssets("achievements"), {
      styles: ["/styles/game/achievements.css"],
      script: "/scripts/pages/achievements.js",
    });
  });

  it("registers the same page bundle for the production build", () => {
    assert.deepEqual(pageBundles.achievements, {
      styles: ["styles/game/achievements.css"],
      script: "scripts/pages/achievements.js",
    });
  });

  it("keeps achievement code out of the shared app bundle", () => {
    const app = readFileSync(new URL("../public/scripts/app.js", import.meta.url), "utf8");
    assert.doesNotMatch(app, /achievement/i);

    for (const file of sharedStyles) {
      const css = readFileSync(new URL(`../public/${file}`, import.meta.url), "utf8");
      assert.doesNotMatch(css, /achievement/i, `${file} carries achievement styles`);
    }
  });

  it("respects reduced motion, reduced transparency and forced colours", () => {
    const css = readFileSync(pageStylesPath, "utf8");

    assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    assert.match(css, /@media\s*\(forced-colors:\s*active\)/);

    const isTranslucent = /backdrop-filter|var\(--glass-[123]\)/.test(css);
    if (isTranslucent) {
      assert.match(css, /@media\s*\(prefers-reduced-transparency:\s*reduce\)/);
    } else {
      assert.doesNotMatch(css, /backdrop-filter/);
    }
    assert.match(css, /:focus-visible/);
    assert.match(css, /--tap-min/);
  });
});

describe("achievements client filtering", () => {
  function createElement(attributes = {}, children = []) {
    const element = {
      dataset: {},
      hidden: false,
      textContent: "",
      attributes: {},
      children,
      listeners: {},
      setAttribute(name, value) {
        this.attributes[name] = String(value);
      },
      getAttribute(name) {
        return this.attributes[name] ?? null;
      },
      addEventListener(type, handler) {
        (this.listeners[type] ||= []).push(handler);
      },
      click() {
        (this.listeners.click || []).forEach((handler) => handler({ currentTarget: element }));
      },
      querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
      },
      querySelectorAll(selector) {
        const name = selector.replace(/^\[|\]$/g, "").replace(/^data-/, "");
        const key = name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        const descendants = [];
        const walk = (node) => {
          node.children.forEach((child) => {
            descendants.push(child);
            walk(child);
          });
        };
        walk(this);
        return descendants.filter((node) => key in node.dataset);
      },
    };

    Object.assign(element.dataset, attributes);
    return element;
  }

  function buildDocument() {
    const cards = [
      ["first-check-in", "EARNED"],
      ["first-reading", "IN_PROGRESS"],
      ["five-finished", "NOT_STARTED"],
      ["trial-doubt", "NOT_STARTED"],
    ].map(([key, status]) => createElement({ achievementCard: "", achievementKey: key, status }));

    const foundations = createElement({ achievementCategory: "foundations" }, cards.slice(0, 3));
    const trials = createElement({ achievementCategory: "trials" }, cards.slice(3));
    const buttons = ["all", "EARNED", "IN_PROGRESS", "NOT_STARTED"].map((value) =>
      createElement({ achievementFilter: value }),
    );
    const status = createElement({ achievementsStatus: "" });
    const root = createElement({ achievements: "" }, [...buttons, status, foundations, trials]);

    return {
      root,
      cards,
      buttons,
      status,
      categories: [foundations, trials],
      document: {
        querySelector: (selector) => (selector === "[data-achievements]" ? root : null),
      },
    };
  }

  function runClient() {
    const dom = buildDocument();
    vm.runInNewContext(readFileSync(clientScriptPath, "utf8"), { document: dom.document });
    return dom;
  }

  it("shows every card until a filter is chosen", () => {
    const dom = runClient();

    assert.deepEqual(dom.cards.map((card) => card.hidden), [false, false, false, false]);
    assert.equal(dom.buttons[0].getAttribute("aria-pressed"), "true");
  });

  it("removes filtered cards and empty categories from the rendered layout", () => {
    const css = readFileSync(pageStylesPath, "utf8");

    assert.match(
      css,
      /\.achievements-card\[hidden\]\s*,\s*\.achievements-category\[hidden\]\s*\{[^}]*display:\s*none\s*;/s,
    );
  });

  it("hides non-matching cards and any category left with nothing to show", () => {
    const dom = runClient();
    dom.buttons[1].click();

    assert.deepEqual(dom.cards.map((card) => card.hidden), [false, true, true, true]);
    assert.deepEqual(dom.categories.map((category) => category.hidden), [false, true]);
    assert.equal(dom.buttons[1].getAttribute("aria-pressed"), "true");
    assert.equal(dom.buttons[0].getAttribute("aria-pressed"), "false");
  });

  it("announces the visible count politely without reordering anything", () => {
    const dom = runClient();
    dom.buttons[3].click();

    assert.equal(dom.status.textContent, "Showing 2 achievements not started.");
    assert.deepEqual(
      dom.cards.filter((card) => !card.hidden).map((card) => card.dataset.achievementKey),
      ["five-finished", "trial-doubt"],
    );

    dom.buttons[0].click();
    assert.equal(dom.status.textContent, "Showing all 4 achievements.");
    assert.deepEqual(dom.categories.map((category) => category.hidden), [false, false]);
  });

  it("never fetches progress or claims an unlock from the browser", () => {
    const source = readFileSync(clientScriptPath, "utf8");

    assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|WebSocket|localStorage|navigator\.sendBeacon/);
    assert.doesNotMatch(source, /"\/api|'\/api|method:\s*"POST"/);
  });
});
