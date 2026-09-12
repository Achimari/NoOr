import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The closed Sacred Press icon registry.
 *
 * Every icon is vendored from official Phosphor source by
 * `scripts/vendor-phosphor-icons.py` into `icon-registry.json`. Phosphor's
 * *regular* weight is a 1.5px stroke on a 24px grid — drawn upstream as filled
 * outlines on a 256 unit grid — so scaling that one weight into a single 24
 * viewBox gives the whole family one geometry and one weight by construction.
 *
 * The registry is closed on purpose. An unknown name throws rather than
 * rendering a fallback shape: a circle where an icon should be is a defect that
 * ships silently, and this product had exactly that before.
 */

const registryPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "views",
  "components",
  "ui",
  "icon-registry.json",
);

const registry = JSON.parse(readFileSync(registryPath, "utf8"));

export const ICON_NAMES = Object.freeze(Object.keys(registry.icons).sort());

const escapeAttribute = (value) =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Renders one registry icon as inline SVG.
 *
 * Decorative by default (`aria-hidden="true"`, `focusable="false"`), because an
 * icon beside a visible label is noise to a screen reader. Pass `label` only
 * when the icon is the *only* thing naming its control; it then becomes an
 * `img` with an accessible name instead of being hidden.
 */
export function renderIcon(name, { className = "", label = "" } = {}) {
  const icon = registry.icons[name];
  if (!icon) {
    throw new Error(
      `Unknown icon "${name}". The registry is closed; add it to scripts/vendor-phosphor-icons.py ` +
        `and re-run that script. Known icons: ${ICON_NAMES.join(", ")}`,
    );
  }

  const classes = ["ui-icon", className].filter(Boolean).join(" ");
  const accessibility = label
    ? `role="img" aria-label="${escapeAttribute(label)}"`
    : 'aria-hidden="true" focusable="false"';

  return (
    `<svg class="${escapeAttribute(classes)}" ${accessibility} ` +
    `viewBox="0 0 ${registry.targetGrid} ${registry.targetGrid}" ` +
    `width="${registry.targetGrid}" height="${registry.targetGrid}" fill="currentColor">` +
    `<g transform="scale(${registry.scale})">${icon.d}</g>` +
    `</svg>`
  );
}
