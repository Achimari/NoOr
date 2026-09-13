import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import ejs from "ejs";

import { sharedViewLocals } from "./helpers/viewLocals.js";

const headerPath = fileURLToPath(new URL("../src/views/components/layout/header.ejs", import.meta.url));
const render = (currentPath, auth = { name: "Reader", timezone: "UTC", emblemKey: "dawn", accentKey: "neutral" }) =>
  ejs.renderFile(headerPath, {
    ...sharedViewLocals,
    currentPath,
    auth,
    t: (_key, fallback) => fallback,
    getTimezoneLabel: () => "UTC",
    timezoneOptions: [{ value: "UTC", label: "UTC" }],
  });

describe("header Help shortcut", () => {
  it("links directly to Help before the account button, with an accessible icon-only label", async () => {
    const html = await render("/daily-check-in");
    const help = html.match(/<a\b[^>]*href="\/help"[^>]*>[\s\S]*?<\/a>/)?.[0];

    assert.ok(help, "Help must remain reachable by a native link");
    assert.match(help, /aria-label="Help"/);
    assert.match(help, /<svg[^>]*aria-hidden="true"/);
    assert.ok(html.indexOf(help) > html.indexOf('class="header-actions"'));
    assert.ok(html.indexOf(help) < html.indexOf("data-account-menu"));
    assert.equal((html.match(/href="\/help"/g) || []).length, 1, "Help moves out of the account menu");
    assert.doesNotMatch(help, /aria-current/);
  });

  it("identifies the current Help page on the shortcut", async () => {
    const html = await render("/help");
    const help = html.match(/<a\b[^>]*href="\/help"[^>]*>/)?.[0];

    assert.match(help || "", /aria-current="page"/);
  });

  it("preserves the signed-out header", async () => {
    const html = await render("/login", null);

    assert.match(html, /href="\/login"/);
    assert.doesNotMatch(html, /href="\/help"/);
  });
});
