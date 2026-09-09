import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const partialsDir = path.join(appRoot, "src", "views", "pages", "partials");
const layoutDir = path.join(appRoot, "src", "views", "components", "layout");
const appScript = readFileSync(path.join(appRoot, "public", "scripts", "app.js"), "utf8");
const materialCss = readFileSync(path.join(appRoot, "public", "styles", "components", "material.css"), "utf8");

const partial = (name) => readFileSync(path.join(partialsDir, name), "utf8");
const layout = (name) => readFileSync(path.join(layoutDir, name), "utf8");
const ambientSkyPath = path.join(layoutDir, "ambient-sky.ejs");
const ambientSky = existsSync(ambientSkyPath) ? readFileSync(ambientSkyPath, "utf8") : "";

describe("shared sky backdrop", () => {
  it("includes one shared sky component from both document shells", () => {
    for (const name of ["document.ejs", "auth-document.ejs"]) {
      assert.match(
        layout(name),
        /include\("\.\/ambient-sky"\)/,
        `${name} must use the shared sky component`,
      );
    }

    assert.equal((ambientSky.match(/data-app-sky/g) || []).length, 1);
    assert.match(ambientSky, /aria-hidden="true"/, "the sky is decorative");
  });

  it("never copies the sky base into a page partial", () => {
    const contentPartials = readdirSync(partialsDir).filter((file) => file.endsWith(".ejs"));

    for (const file of contentPartials) {
      assert.doesNotMatch(
        partial(file),
        /data-app-sky/,
        `${file} must not declare a second sky base; the shell owns it`,
      );
    }
  });

  it("renders one universal moving layer with the still poster as fallback", () => {
    assert.match(materialCss, /\.app-sky/, "the sky base needs a styled layer");
    assert.equal((ambientSky.match(/data-ambient-video/g) || []).length, 1);
    assert.match(ambientSky, /ambient-sky\.webm/);
    assert.match(ambientSky, /ambient-sky\.mp4/);
    assert.match(ambientSky, /ambient-sky\.jpg/, "the video must retain a poster fallback");
    assert.match(materialCss, /background-attachment:\s*fixed|position:\s*fixed/, "the sky base is fixed behind the page");
  });

  it("defers video transfer until playback is allowed", () => {
    assert.match(ambientSky, /preload="none"/);
    assert.match(ambientSky, /<source data-src="\/videos\/ambient-sky\.webm"/);
    assert.doesNotMatch(
      ambientSky,
      /<source src="\/videos\/ambient-sky/,
      "reduced-motion and Save-Data must not start a video request",
    );
  });

  it("keeps a readable scrim over the sky", () => {
    assert.match(materialCss, /\.app-sky__scrim|app-sky::after/, "the sky base carries its own scrim");
  });

  it("never creates page-specific ambient mounts", () => {
    const contentPartials = readdirSync(partialsDir).filter((file) => file.endsWith(".ejs"));
    for (const view of contentPartials) {
      assert.doesNotMatch(
        partial(view),
        /data-ambient-mount/,
        `${view} must reuse the document sky instead of mounting another video`,
      );
    }
  });

  it("binds page behavior to the shared layer without creating a second video", () => {
    assert.match(
      appScript,
      /querySelector\("\[data-app-sky\]"\)/,
      "app.js must bind to the shared sky",
    );
    assert.doesNotMatch(
      appScript,
      /createElement\("video"\)|createElement\('video'\)/,
      "app.js must not create a route-local duplicate",
    );
  });

  it("keeps the reduced-motion, Save-Data, visibility and error safeguards", () => {
    const controller = `${ambientSky}\n${appScript}`;
    assert.match(controller, /prefers-reduced-motion/);
    assert.match(controller, /saveData/);
    assert.match(controller, /visibilitychange/);
    assert.match(controller, /addEventListener\("error"/, "a failed video must fall back to the poster");
  });

  it("is a deliberate decision on the signed-out shell too", () => {
    const authDocument = layout("auth-document.ejs");
    assert.match(authDocument, /include\("\.\/ambient-sky"\)/);
  });
});
