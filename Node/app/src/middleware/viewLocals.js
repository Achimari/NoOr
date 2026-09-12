import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createViewLocals } from "../i18n/index.js";
import { isProduction } from "../config/env.js";
import { siteData } from "../data/siteData.js";
import { paths } from "../config/paths.js";
import { pageBundles, sharedScripts, sharedStyles, toUrl } from "../config/assetSources.js";
import { getTimezoneLabel, getTimezoneOptions } from "../utils/timezones.js";
import { ICON_NAMES, renderIcon } from "../utils/icons.js";

function loadAssetManifest() {
  const manifestPath = path.join(paths.public, "assets", "manifest.json");
  if (!isProduction || !existsSync(manifestPath)) {
    return {
      styles: sharedStyles.filter((file) => file !== "styles/variables.css").map(toUrl),
      script: toUrl(sharedScripts[0]),
      scripts: sharedScripts.map(toUrl),
      pages: Object.fromEntries(
        Object.entries(pageBundles).map(([pageId, bundle]) => [
          pageId,
          { styles: bundle.styles.map(toUrl), script: bundle.script ? toUrl(bundle.script) : null },
        ]),
      ),
    };
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const pages = Object.fromEntries(
    Object.entries(manifest.pages || {}).map(([pageId, entry]) => [
      pageId,
      {
        styles: entry.css ? [entry.css] : [],
        script: entry.js || null,
      },
    ]),
  );

  return {
    styles: [manifest.css],
    script: manifest.js,
    scripts: [manifest.js],
    pages,
  };
}

const assets = loadAssetManifest();

export function getPageAssets(pageId) {
  return assets.pages?.[pageId] || { styles: [], script: null };
}

export function viewLocals(req, res, next) {
  res.locals = {
    ...res.locals,
    ...createViewLocals(req),
    siteData,
    assets,
    getPageAssets,
    auth: req.user || null,
    timezoneOptions: getTimezoneOptions(),
    getTimezoneLabel,
    renderIcon,
    iconNames: ICON_NAMES,
  };
  next();
}
