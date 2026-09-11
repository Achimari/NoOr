import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const profileStyles = readFileSync(
  new URL("../public/styles/game/profile.css", import.meta.url),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

function rule(selector) {
  const escaped = selector.replace(/[.[\]()+*]/g, "\\$&");
  return profileStyles.match(
    new RegExp(`(?:^|[,{}])\\s*${escaped}\\s*(?:,[^{]*)?\\{([^}]*)\\}`, "m"),
  )?.[1] || "";
}

describe("Profile Today summary layout", () => {
  it("keeps the label, state and disclosure action in three columns", () => {
    const summary = rule(".profile-disclosure-summary");

    assert.match(summary, /display:\s*grid/);
    assert.match(
      summary,
      /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\) auto/,
    );
    assert.doesNotMatch(summary, /flex-wrap/);
  });

  it("keeps long status text inside its middle track and the action at the end", () => {
    assert.match(rule(".profile-disclosure-state"), /min-width:\s*0/);
    assert.match(rule(".profile-disclosure-summary::after"), /justify-self:\s*end/);
  });
});
