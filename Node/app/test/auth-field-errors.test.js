import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import ejs from "ejs";

import { validateBody } from "../src/middleware/validateRequest.js";
import { registerSchema } from "../src/validators/authValidators.js";

const loginPath = fileURLToPath(
  new URL("../src/views/pages/partials/auth-login.ejs", import.meta.url),
);

function runValidation(schema, body) {
  const req = { body };
  validateBody(schema)(req, {}, () => {});
  return req;
}

async function renderLogin(locals = {}) {
  return ejs.renderFile(loginPath, {
    t: (key) => ({
      "auth.login.title": "Sign in",
      "auth.login.subtitle": "",
      "auth.login.loginLabel": "Name",
      "auth.login.passwordLabel": "Password",
      "auth.login.submit": "Sign in",
      "auth.login.onboardingLink": "Create an account",
    })[key] ?? "",
    ...locals,
  });
}

describe("validation errors carry their field", () => {
  it("keeps the flat message list every existing caller reads", () => {
    const req = runValidation(registerSchema, { name: "a", password: "short" });

    assert.ok(Array.isArray(req.validationErrors));
    assert.ok(req.validationErrors.length >= 1);
    assert.ok(req.validationErrors.every((message) => typeof message === "string"));
  });

  it("also groups messages by the field that produced them", () => {
    const req = runValidation(registerSchema, { name: "a", password: "short" });

    assert.deepEqual(req.validationFieldErrors.name, ["Name must contain at least 2 characters"]);
    assert.deepEqual(req.validationFieldErrors.password, ["Password must contain at least 8 characters"]);
  });

  it("leaves both empty when the body is valid", () => {
    const req = runValidation(registerSchema, { name: "Ann", password: "longenough1" });

    assert.equal(req.validationErrors, undefined);
    assert.ok(req.validatedBody);
  });
});

describe("login form error presentation", () => {
  it("puts a field's error next to that field and links it for assistive tech", async () => {
    const html = await renderLogin({
      errors: ["Password is required"],
      fieldErrors: { password: ["Password is required"] },
      values: { login: "Ann" },
    });

    assert.match(html, /id="login-password-error"/);
    assert.match(html, /aria-describedby="login-password-error"/);
    assert.match(html, /aria-invalid="true"/);
    assert.match(html, /Password is required/);
  });

  it("keeps the submitted name so the form is not retyped", async () => {
    const html = await renderLogin({ errors: [], fieldErrors: {}, values: { login: "Ann" } });

    assert.match(html, /value="Ann"/);
    assert.doesNotMatch(html, /aria-invalid="true"/);
  });

  it("still shows an error that belongs to no single field", async () => {
    const html = await renderLogin({
      errors: ["Invalid name or password"],
      fieldErrors: {},
      values: { login: "Ann" },
    });

    assert.match(html, /role="alert"/);
    assert.match(html, /Invalid name or password/);
  });
});
