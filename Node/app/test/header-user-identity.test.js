import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { sanitizeUser } from "../src/services/authService.js";

const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

describe("header user identity", () => {
  it("carries the saved profile identity into the signed-in user", () => {
    const user = sanitizeUser({
      id: 7,
      name: "Achimari",
      isTelegramLinked: false,
      timezone: "Europe/Riga",
      createdAt: new Date("2026-09-08T09:00:00.000Z"),
      gameProfile: { emblemKey: "lantern", accentKey: "rose" },
    });

    assert.equal(user.emblemKey, "lantern");
    assert.equal(user.accentKey, "rose");
  });

  it("uses safe defaults when a profile identity is missing or invalid", () => {
    const user = sanitizeUser({
      id: 7,
      name: "Achimari",
      timezone: "Europe/Riga",
      gameProfile: { emblemKey: "<script>", accentKey: "url(evil)" },
    });

    assert.equal(user.emblemKey, "dawn");
    assert.equal(user.accentKey, "neutral");
  });

  it("renders the customized emblem in place of the three-dot icon", () => {
    const header = read("src/views/components/layout/header.ejs");

    assert.match(header, /class="header-account-identity"/);
    assert.match(header, /data-emblem="<%= auth\.emblemKey %>"/);
    assert.match(header, /data-accent="<%= auth\.accentKey %>"/);
    assert.doesNotMatch(header, /name:\s*"more-horizontal"/);
  });

  it("updates the header identity as soon as the profile choice is saved", () => {
    const profileScript = read("public/scripts/pages/profile.js");

    assert.match(profileScript, /querySelector\("\[data-account-identity\]"\)/);
    assert.match(profileScript, /headerIdentity\.dataset\.accent/);
    assert.match(profileScript, /headerIdentity\.dataset\.emblem/);
  });

  it("uses black rules at the header and footer edges", () => {
    const header = read("public/styles/header/base.css");
    const footer = read("public/styles/home/footer.css");

    assert.match(header, /\.header\s*{[^}]*border-bottom:\s*1px solid var\(--ink\)/s);
    assert.match(footer, /\.section\.footer-info\s*{[^}]*border-top:\s*1px solid var\(--ink\)/s);
  });

  it("uses the footer's solid background for the header in every rendering mode", () => {
    const header = read("public/styles/header/base.css");
    const footer = read("public/styles/home/footer.css");

    assert.match(footer, /background:\s*var\(--footer-bg\)/);
    assert.match(header, /\.header\s*{[^}]*background:\s*var\(--footer-bg\)/s);
    assert.doesNotMatch(header, /background:\s*var\(--header-bg\)/);
  });
});
