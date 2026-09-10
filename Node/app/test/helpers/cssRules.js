import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("../..", import.meta.url));
const stylesDir = path.join(appRoot, "public", "styles");

export function styleFiles() {
  const files = [];
  const pending = [stylesDir];
  while (pending.length) {
    const dir = pending.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) pending.push(full);
      else if (entry.name.endsWith(".css")) files.push(full);
    }
  }
  return files.sort();
}

export const relative = (full) => path.relative(appRoot, full).split(path.sep).join("/");

/**
 * Flattens a stylesheet into its style rules. At-rule blocks (@media, @supports)
 * are descended into, so a declaration inside a breakpoint is still audited; the
 * enclosing conditions are carried on `conditions` so a caller can tell them apart.
 * Declaration-only at-rules such as @font-face are returned with their own name as
 * the selector, which keeps them out of the selector-based font audits.
 */
export function parseRules(css, file = "") {
  const rules = [];
  let index = 0;

  const walk = (end, conditions) => {
    let buffer = "";
    while (index < end) {
      const char = css[index];

      if (char === "/" && css[index + 1] === "*") {
        const close = css.indexOf("*/", index + 2);
        index = close === -1 ? end : close + 2;
        continue;
      }

      if (char === "{") {
        const prelude = buffer.trim();
        buffer = "";
        const close = matchingBrace(css, index);
        const body = css.slice(index + 1, close);

        if (prelude.startsWith("@") && /^@(media|supports|layer|container|scope)\b/.test(prelude)) {
          const inner = index + 1;
          const saved = index;
          index = inner;
          walk(close, [...conditions, prelude]);
          index = close + 1;
          void saved;
        } else {
          rules.push({
            file,
            selector: prelude,
            declarations: declarationsOf(body),
            conditions,
            line: css.slice(0, index).split("\n").length,
          });
          index = close + 1;
        }
        continue;
      }

      if (char === "}") {
        index += 1;
        buffer = "";
        continue;
      }

      buffer += char;
      index += 1;
    }
  };

  walk(css.length, []);
  return rules;
}

function matchingBrace(css, open) {
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "/" && css[i + 1] === "*") {
      const close = css.indexOf("*/", i + 2);
      i = close === -1 ? css.length : close + 1;
      continue;
    }
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return css.length;
}

function declarationsOf(body) {
  const out = [];
  let depth = 0;
  let buffer = "";
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];
    // A comment between declarations would otherwise be glued onto the next
    // property name, silently hiding that declaration from every audit.
    if (char === "/" && body[i + 1] === "*") {
      const close = body.indexOf("*/", i + 2);
      i = close === -1 ? body.length : close + 1;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "{") {
      // A nested rule; its declarations belong to the nested selector, not here.
      const close = matchingBrace(body, i);
      i = close;
      buffer = "";
      continue;
    }
    if (char === ";" && depth === 0) {
      pushDeclaration(out, buffer);
      buffer = "";
      continue;
    }
    buffer += char;
  }
  pushDeclaration(out, buffer);
  return out;
}

function pushDeclaration(out, raw) {
  const text = raw.trim();
  if (!text) return;
  const colon = text.indexOf(":");
  if (colon === -1) return;
  const property = text.slice(0, colon).trim().toLowerCase();
  const value = text.slice(colon + 1).trim();
  if (!property || property.startsWith("@")) return;
  out.push({ property, value });
}

export function allRules() {
  return styleFiles().flatMap((file) => parseRules(readFileSync(file, "utf8"), relative(file)));
}

/**
 * The smallest px size a font-size value can actually resolve to.
 *
 * `clamp(a, b, c)` never renders below `a`, so only its first argument is the
 * floor — reading the smallest literal anywhere in the expression would flag a
 * perfectly safe `clamp(14px, 0.8rem + 0.4vw, 16px)`. Values carrying no rem/px
 * literal (em, %, ch, keywords) return null so a caller skips rather than guesses.
 */
export function smallestPx(value) {
  const trimmed = value.trim();
  if (/^(inherit|initial|unset|revert|0)$/.test(trimmed)) return null;

  const clamp = trimmed.match(/^clamp\(([\s\S]*)\)$/i);
  if (clamp) {
    const floor = splitTopLevel(clamp[1])[0];
    return floor === undefined ? null : smallestPx(floor);
  }

  const sizes = [];
  for (const [, num, unit] of trimmed.matchAll(/(-?[\d.]+)(rem|px)\b/g)) {
    const n = Number(num);
    if (Number.isFinite(n)) sizes.push(unit === "rem" ? n * 16 : n);
  }
  if (!sizes.length) return null;
  return Math.min(...sizes);
}

function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let buffer = "";
  for (const char of text) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(buffer.trim());
      buffer = "";
      continue;
    }
    buffer += char;
  }
  parts.push(buffer.trim());
  return parts;
}
