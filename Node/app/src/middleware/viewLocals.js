import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createViewLocals } from "../i18n/index.js";
import { isProduction } from "../config/env.js";
import { siteData } from "../data/siteData.js";
import { paths } from "../config/paths.js";
import { getTimezoneLabel, getTimezoneOptions } from "../utils/timezones.js";

const sourceStyles = [
  "/styles/globals.css",
  "/styles/header/base.css",
  "/styles/header/responsive.css",
  "/styles/home/hero.css",
  "/styles/home/dashboard.css",
  "/styles/home/sections.css",
  "/styles/home/home-layout.css",
  "/styles/home/roadmap-and-links.css",
  "/styles/home/auth.css",
  "/styles/home/footer.css",
  "/styles/home/responsive.css",
];

function loadAssetManifest() {
  const manifestPath = path.join(paths.public, "assets", "manifest.json");
  if (!isProduction || !existsSync(manifestPath)) {
    return {
      styles: sourceStyles,
      script: "/scripts/app.js",
    };
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  return {
    styles: [manifest.css],
    script: manifest.js,
  };
}

const assets = loadAssetManifest();

export function viewLocals(req, res, next) {
  res.locals = {
    ...res.locals,
    ...createViewLocals(req),
    siteData,
    assets,
    auth: req.user || null,
    timezoneOptions: getTimezoneOptions(),
    getTimezoneLabel,
  };
  next();
}
