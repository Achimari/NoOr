import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import ejs from "ejs";

import { sharedViewLocals } from "./helpers/viewLocals.js";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFileSync(path.join(appRoot, relative), "utf8");
const settingsPath = path.join(appRoot, "src/views/pages/partials/settings-content.ejs");

const render = (overrides = {}) =>
  ejs.renderFile(settingsPath, {
    ...sharedViewLocals,
    auth: { id: 1, name: "Press Fixture", timezone: "Europe/Riga" },
    values: {},
    toastMessage: "",
    toastVariant: "default",
    nicknameErrors: [],
    passwordErrors: [],
    nicknameSuccess: "",
    passwordSuccess: "",
    t: () => "",
    siteData: { socialLinks: [] },
    ...overrides,
  });

const at = (html, needle) => html.indexOf(needle);

describe("Settings keeps its order and reaches the correction sooner", () => {
  it("keeps Account, then Password, then Today's answers", async () => {
    const html = await render();

    assert.ok(at(html, 'id="settings-account-title"') < at(html, 'id="settings-password-title"'));
    assert.ok(at(html, 'id="settings-password-title"') < at(html, 'id="settings-today-title"'));
  });

  it("keeps every password field in its order, with its name and its autocomplete", async () => {
    const html = await render();
    const start = at(html, 'action="/settings/password"');
    const form = html.slice(start, html.indexOf("</form>", start));
    const fields = [...form.matchAll(/<input\b[^>]*>/g)].map((tag) => [
      tag[0].match(/name="([^"]+)"/)[1],
      tag[0].match(/autocomplete="([^"]+)"/)[1],
    ]);

    assert.deepEqual(fields, [
      ["currentPassword", "current-password"],
      ["password", "new-password"],
      ["passwordConfirmation", "new-password"],
    ]);
  });

  it("offers a jump to the correction controls above the fold", async () => {
    const html = await render();
    const jump = html.match(/<a class="settings-jump-link" href="#([^"]+)"[^>]*>([^<]+)<\/a>/);

    assert.ok(jump, "the introduction offers a jump link");
    assert.match(jump[2], /Today's answers/);
    assert.match(html, new RegExp(`id="${jump[1]}"`), "and its target exists");
    assert.ok(at(html, "settings-jump-link") < at(html, 'id="settings-account-title"'), "before the first group");
  });

  it("never posts a correction anywhere but its own action", async () => {
    const html = await render();

    assert.match(html, /<form[^>]*action="\/settings\/nickname"[^>]*method="post"/);
    assert.match(html, /<form[^>]*action="\/settings\/password"[^>]*method="post"/);
  });
});

describe("the password form folds on a phone without leaving the document", () => {
  it("ships open, inside a native disclosure, with all three fields present", async () => {
    const html = await render();

    assert.match(html, /<details[^>]*data-settings-password[^>]*\sopen>/);
    assert.match(html, /<summary[^>]*class="fold-summary"[^>]*aria-controls="settings-password-form"/);
    assert.match(html, /id="settings-password-form"/);
    for (const name of ["currentPassword", "password", "passwordConfirmation"]) {
      assert.match(html, new RegExp(`name="${name}"`), `${name} stays in the document for autofill`);
    }
  });

  it("is marked foldable only while it carries no error", async () => {
    assert.match(await render(), /data-settings-password data-phone-fold/);
    assert.doesNotMatch(
      await render({ passwordErrors: ["Current password is incorrect"] }),
      /data-phone-fold/,
      "an error inside a folded disclosure is an error nobody reads",
    );
  });

  it("states a validation failure beside the form, not only in a toast", async () => {
    const html = await render({ passwordErrors: ["Current password is incorrect"] });

    assert.match(html, /class="settings-feedback settings-feedback--error" role="alert"/);
    assert.match(html, /Current password is incorrect/);
  });

  it("confirms a successful change in the same place", async () => {
    const html = await render({ passwordSuccess: "Password updated." });

    assert.match(html, /class="settings-feedback settings-feedback--success" role="status"/);
    assert.match(html, /Password updated\./);
  });
});

describe("the answer correction controls are unchanged in meaning", () => {
  it("keeps both pairs, their aria-pressed state and their current answer", async () => {
    const html = await render();
    const start = at(html, 'class="surface-panel settings-answers"');
    const answers = html.slice(start, html.indexOf("</section>", start));

    assert.equal((answers.match(/data-settings-answer-option="YES"/g) || []).length, 1);
    assert.equal((answers.match(/data-settings-answer-option="NO"/g) || []).length, 1);
    assert.equal((answers.match(/data-settings-reading-answer-option="YES"/g) || []).length, 1);
    assert.equal((answers.match(/data-settings-reading-answer-option="NO"/g) || []).length, 1);

    for (const button of answers.match(/<button class="settings-answer-button[^>]*>/g) || []) {
      assert.match(button, /aria-pressed="(true|false)"/, button);
    }
    assert.match(answers, /data-settings-answer-current/);
    assert.match(answers, /data-settings-reading-current/);
  });

  it("carries no check mark on a selected answer, by explicit owner instruction", async () => {
    const html = await render();
    const start = at(html, 'class="surface-panel settings-answers"');
    const panel = html.slice(start, html.indexOf("</section>", start));
    const css = read("public/styles/pages/settings.css");

    assert.doesNotMatch(panel, /ui-icon|<svg/, "the Settings pair is icon-free");
    assert.doesNotMatch(
      css,
      /\.settings-answer-(yes|no)\[aria-pressed="true"\]::(after|before)/,
      "and no rule draws one back in",
    );
  });

  it("keeps each label centred and each selected answer on the ink field", () => {
    const css = read("public/styles/pages/settings.css");
    const base = css.match(/\n\.settings-answer-button \{([^}]*)\}/)[1];
    const selected = css.match(/\n\.settings-answer-yes\[aria-pressed="true"\],\s*\n\.settings-answer-no\[aria-pressed="true"\] \{([^}]*)\}/)[1];

    assert.match(base, /justify-content:\s*center/);
    assert.match(base, /min-height:\s*56px/, "well above the 44px target floor");
    assert.match(selected, /background:\s*var\(--ink\)/);
    assert.match(selected, /color:\s*var\(--white\)/);
  });

  it("stacks Strong above Bible reading at phone widths, each pair full width", () => {
    const css = read("public/styles/pages/settings.css");
    const phone = css.slice(css.lastIndexOf("@media (max-width: 760px)"));

    assert.match(phone, /\.settings-answers \{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
    assert.match(css, /\.settings-answer-actions \{[^}]*width:\s*100%/s);
  });

  it("drops the panel's own box on a phone rather than nesting a third inset", () => {
    const css = read("public/styles/pages/settings.css");
    const phone = css.slice(css.lastIndexOf("@media (max-width: 760px)"));

    assert.match(phone, /\.settings-group > \.surface-panel\.settings-answers \{[^}]*border:\s*0/s);
    assert.match(phone, /\.settings-reading-details \{[^}]*border:\s*0/s);
  });

  it("gives every action in a group one width and one alignment on a phone", () => {
    const css = read("public/styles/pages/settings.css");
    const phone = css.slice(css.lastIndexOf("@media (max-width: 760px)"));

    assert.match(phone, /\.settings-page \.settings-form \.ui-button--large \{[^}]*width:\s*100%/s);
    assert.match(phone, /\.settings-page \.settings-input \{[^}]*width:\s*100%/s);
  });
});
