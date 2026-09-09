
export const sharedStyles = [
  "styles/variables.css",
  "styles/globals.css",
  "styles/shell.css",
  "styles/components/brand.css",
  "styles/components/material.css",
  "styles/components/buttons.css",
  "styles/components/fields.css",
  "styles/components/lists.css",
  "styles/components/tables.css",
  "styles/components/status.css",
  "styles/components/dialogs.css",
  "styles/header/base.css",
  "styles/header/responsive.css",
  "styles/home/hero.css",
  "styles/home/dashboard.css",
  "styles/home/sections.css",
  "styles/home/home-layout.css",
  "styles/home/roadmap-and-links.css",
  "styles/home/footer.css",
  "styles/home/responsive.css",
];

export const pageBundles = {
  "daily-check-in": {
    styles: ["styles/components/reading-modal.css", "styles/pages/daily-check-in.css"],
    script: null,
  },
  "my-prayers": {
    styles: ["styles/components/feed.css", "styles/pages/prayers.css"],
    script: null,
  },
  community: {
    styles: ["styles/components/feed.css", "styles/pages/community.css"],
    script: null,
  },
  settings: {
    styles: ["styles/components/reading-modal.css", "styles/pages/settings.css"],
    script: null,
  },
  profile: {
    styles: ["styles/game/profile.css", "styles/game/explore.css"],
    script: "scripts/pages/profile.js",
  },
  battle: {
    styles: ["styles/game/battle.css", "styles/game/battle-arena.css"],
    script: "scripts/pages/battle.js",
  },
  help: {
    styles: ["styles/game/help.css"],
    script: null,
  },
  statistics: {
    styles: ["styles/pages/statistics.css"],
    script: "scripts/pages/statistics.js",
  },
  login: {
    styles: ["styles/pages/auth.css"],
    script: null,
  },
  onboarding: {
    styles: ["styles/pages/auth.css"],
    script: null,
  },
  achievements: {
    styles: ["styles/game/achievements.css"],
    script: "scripts/pages/achievements.js",
  },
};

export const sharedScripts = ["scripts/app.js", "scripts/account-menu.js"];

export function toUrl(assetPath) {
  return `/${assetPath}`;
}
