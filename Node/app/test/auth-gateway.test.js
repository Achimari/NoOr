import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import ejs from "ejs";

import { sharedViewLocals } from "./helpers/viewLocals.js";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFileSync(path.join(appRoot, relative), "utf8");
const styles = () => read("public/styles/pages/auth.css");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const COPY = {
  "auth.login.title": "Login",
  "auth.login.subtitle": "Return to your daily practice.",
  "auth.login.loginLabel": "Login",
  "auth.login.passwordLabel": "Password",
  "auth.login.submit": "Log in",
  "auth.login.onboardingLink": "Create account",
  "auth.onboarding.title": "Create your account",
  "auth.onboarding.subtitle": "Start your daily practice.",
  "auth.onboarding.nameLabel": "Name",
  "auth.onboarding.passwordLabel": "Password",
  "auth.onboarding.passwordConfirmLabel": "Confirm password",
  "auth.onboarding.passwordHint": "At least 8 characters.",
  "auth.onboarding.submit": "Create account",
  "auth.onboarding.loginLink": "I already have an account",
};

const renderAuth = (page, locals = {}) =>
  ejs.renderFile(path.join(appRoot, `src/views/pages/partials/${page}.ejs`), {
    ...sharedViewLocals,
    t: (key) => COPY[key] ?? "",
    ...locals,
  });

const rule = (selector, css = stripComments(styles())) =>
  (css.match(new RegExp(`(?:^|\\n|,)\\s*${selector}\\s*\\{([^}]*)\\}`)) || [])[1] || "";

/**
 * The auth gateway is the product's first impression and its narrowest task.
 * A compact brand lockup sits directly above one rounded form panel.
 *
 * Every behaviour the centred card had is unchanged — field names, order,
 * labels, errors, submitted values, keyboard flow and the account links — and
 * the assertions below hold that as firmly as they hold the new composition.
 */
describe("the auth gateway is an editorial composition", () => {
  it("opens with the shared brand lockup above the form", async () => {
    const markup = await renderAuth("auth-login");

    assert.match(markup, /class="auth-masthead"/, "the page opens with a masthead");
    assert.match(markup, /class="[^"]*brand-lockup[^"]*brand-lockup--masthead/, "uses the auth lockup");
    assert.doesNotMatch(rule("\\.auth-masthead"), /background:\s*var\(--chrome\)/, "the wordmark is not a black chip");

    const masthead = rule("\\.auth-masthead");
    assert.match(masthead, /inline-size:\s*100%/, "the masthead spans the full sheet");
    assert.doesNotMatch(masthead, /max-width/, "and is never narrowed into a column of its own");

    // One gutter in the composition, owned by the gateway. Nesting a second
    // full-bleed negation inside it is what produced a two-pixel overflow on a
    // phone, which is why neither child negates a gutter any more.
    assert.match(rule("\\.auth-gateway"), /padding-inline:\s*max\(var\(--padding\)/);
    assert.doesNotMatch(masthead, /calc\(50% - 50vw\)/);
    assert.doesNotMatch(rule("\\.auth-body"), /calc\(50% - 50vw\)/);
  });

  it("centres one focused form column", () => {
    const body = rule("\\.auth-body");
    const form = rule("\\.auth-form-column");

    assert.match(body, /display:\s*flex/);
    assert.match(body, /justify-content:\s*center/);
    assert.match(form, /inline-size:\s*min\(100%,\s*34rem\)/);
    assert.doesNotMatch(form, /border-inline-start|grid-column/, "no retired image column remains");
  });

  it("keeps the masthead before the form at every width", async () => {
    const markup = await renderAuth("auth-login");
    const css = stripComments(styles());

    const masthead = markup.indexOf("auth-masthead");
    const form = markup.indexOf("<form");
    assert.ok(masthead < form, "the masthead comes before the form");

    assert.doesNotMatch(css, /(?:^|[;{]\s*)order:\s*-?\d/, "no CSS reordering of the auth composition");
    assert.doesNotMatch(css, /flex-direction:\s*\w+-reverse/, "no reversed flow");
  });

  it("renders no decorative image plate", async () => {
    const markup = await renderAuth("auth-login");

    assert.doesNotMatch(markup, /<picture|<img|\/images\/plates\/|press-plate|auth-plate/);
  });

  it("does not preload decorative artwork", () => {
    const shell = read("src/views/components/layout/auth-document.ejs");
    const preloads = [...shell.matchAll(/<link[^>]+as="image"[^>]*>/g)];

    assert.equal(preloads.length, 0, "the gateway has no decorative image to preload");
    assert.doesNotMatch(read("src/views/components/layout/document.ejs"), /as="image"/);
  });

  it("contains no retired image-slot styling", () => {
    const css = stripComments(styles());

    assert.doesNotMatch(css, /auth-plate|--plate-ratio/);
  });

  it("makes exactly one action the filled primary, in the brand accent", async () => {
    const markup = await renderAuth("auth-login");
    const buttons = stripComments(read("public/styles/components/buttons.css"));

    // The overprint primary is a variant of the shared button, so it inherits
    // every state, target size and focus rule rather than forking them.
    assert.match(markup, /class="ui-button ui-button--accent auth-submit"/);
    assert.match(rule("\\.ui-button--accent", buttons), /background:\s*var\(--accent\)/);
    assert.match(rule("\\.ui-button--accent", buttons), /color:\s*var\(--on-accent\)/);

    // Exactly one per view, and the second action is not a second primary.
    assert.equal((markup.match(/ui-button--accent|ui-button--primary/g) || []).length, 1);
    assert.match(markup, /class="ui-button ui-button--quiet auth-secondary"/);

    // And the page sheet never restates that surface.
    assert.doesNotMatch(rule("\\.auth-submit"), /background:/);
    assert.doesNotMatch(rule("\\.auth-secondary"), /background:/);
  });
});

describe("the gateway keeps every behaviour the centred card had", () => {
  for (const [page, fields] of [
    ["auth-login", ["login", "password"]],
    ["auth-onboarding", ["name", "password", "passwordConfirmation"]],
  ]) {
    it(`${page} keeps its field names, in order`, async () => {
      const markup = await renderAuth(page);
      const names = [...markup.matchAll(/<input[^>]*\bname="([^"]+)"/g)].map(([, name]) => name);

      assert.deepEqual(names, fields, "field names and order are an API, not a layout detail");
    });

    it(`${page} posts to its own endpoint with a real submit`, async () => {
      const markup = await renderAuth(page);

      assert.match(markup, new RegExp(`action="/${page === "auth-login" ? "login" : "auth/register"}"`));
      assert.match(markup, /method="post"/);
      assert.match(markup, /<button[^>]*type="submit"/);
    });

    it(`${page} labels every input and links its error`, async () => {
      const markup = await renderAuth(page);

      for (const [, id] of markup.matchAll(/<input[^>]*\bid="([^"]+)"/g)) {
        assert.match(markup, new RegExp(`<label[^>]*for="${id}"`), `${id} has no label`);
      }
    });
  }

  it("keeps a submitted value so the form is not retyped after an error", async () => {
    const markup = await renderAuth("auth-login", { values: { login: "Ravenswood" } });

    assert.match(markup, /name="login"[\s\S]{0,220}?value="Ravenswood"/);
  });

  it("attaches a field error to its own field, for assistive technology", async () => {
    const markup = await renderAuth("auth-login", {
      errors: ["That password is not right."],
      fieldErrors: { password: ["That password is not right."] },
    });

    assert.match(markup, /id="login-password"[\s\S]{0,400}?aria-describedby="login-password-error"/);

    // The message carries a warning mark before its text (2026-09-12): in a
    // monochrome system an error cannot be recognised by a red field, so it is
    // recognised by a shape. The mark is decorative and must stay out of the
    // accessible name, so it is checked here to be `aria-hidden` and the text
    // is checked to be the whole of what the description announces.
    const message = markup.match(/<p class="field-error" id="login-password-error">([\s\S]*?)<\/p>/);
    assert.ok(message, "the field error must still be a <p> bound to the field by id");
    assert.match(message[1], /aria-hidden="true"/, "the warning mark is decorative");
    assert.equal(
      message[1].replace(/<svg[\s\S]*?<\/svg>/g, "").trim(),
      "That password is not right.",
      "and the announced description is the message itself, unchanged",
    );
    // And it is not also repeated as an unattributed form-level error.
    assert.doesNotMatch(markup, /class="auth-errors"/);
  });

  it("keeps a form-level error that belongs to no single field", async () => {
    const markup = await renderAuth("auth-login", { errors: ["Something went wrong."] });

    assert.match(markup, /class="auth-errors"[^>]*role="alert"/);
    assert.match(markup, /Something went wrong\./);
  });

  it("keeps the route between the two accounts open in both directions", async () => {
    assert.match(await renderAuth("auth-login"), /href="\/onboarding"/);
    assert.match(await renderAuth("auth-onboarding"), /href="\/login"/);
  });

  it("needs no JavaScript to be usable", async () => {
    const markup = await renderAuth("auth-login");

    assert.doesNotMatch(markup, /<script/, "the gateway ships no script of its own");
    assert.doesNotMatch(markup, /hidden\b[^>]*class="[^"]*auth-(?:body|form)/, "nothing is hidden until JS runs");
  });
});
