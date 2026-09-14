import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../public/scripts/pages/profile.js", import.meta.url), "utf8");

function element({ value = "", hidden = false, dataset = {} } = {}) {
  return {
    value, hidden, dataset, disabled: false, textContent: "", handlers: {},
    addEventListener(event, handler) { this.handlers[event] = handler; },
    setAttribute(name, value) { this[name] = value; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { top: 240 }; },
    focus() {},
  };
}

function mount({ locked = false, confirmed = true, response } = {}) {
  const fields = Object.fromEntries(["strength", "dexterity", "intelligence"].map((stat, index) => [stat, element({ value: index ? "3" : "4" })]));
  const totals = Object.fromEntries(["strength", "dexterity", "intelligence", "wisdom"].map(stat => [stat, element()]));
  const derived = Object.fromEntries(["maxHealth", "basicDamage", "speed", "maxMana"].map(stat => [stat, element()]));
  const save = element({ hidden: locked });
  const reset = element();
  const remaining = element();
  const error = element({ hidden: true });
  const allocation = element({ dataset: { locked: String(locked) } });
  const root = element({ dataset: { owner: "true" } });
  const selectors = {
    "[data-allocation]": allocation,
    "[data-allocation-save]": save,
    "[data-allocation-reset-stats]": reset,
    "[data-allocation-remaining]": remaining,
    "[data-allocation-error]": error,
  };
  for (const [stat, field] of Object.entries(fields)) selectors[`[data-allocation-input="${stat}"]`] = field;
  for (const [stat, field] of Object.entries(totals)) selectors[`[data-stat-total="${stat}"]`] = field;
  for (const [stat, field] of Object.entries(derived)) selectors[`[data-derived="${stat}"]`] = field;
  root.querySelector = selector => selectors[selector] || null;
  root.querySelectorAll = selector => selector === "[data-stat-total]" ? Object.values(totals) : [];
  const toasts = [];
  const requests = [];
  const window = { scrollX: 0, scrollY: 500, scrollBy() { throw new Error("No layout changed, so scrolling is unnecessary"); }, location: { reload() { throw new Error("Profile must not reload after saving"); } } };
  const document = { querySelector: selector => selector === "[data-profile]" ? root : null, body: {}, activeElement: save };
  vm.runInNewContext(source, {
    document, window,
    showToast: (message) => toasts.push(message),
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: response.ok, status: response.status || 200, json: async () => response.data };
    },
  });
  return { fields, totals, derived, save, reset, remaining, error, allocation, toasts, requests, window };
}

const game = {
  base: { strength: 5, dexterity: 3, intelligence: 2 },
  stats: { strength: 7, dexterity: 3, intelligence: 2, wisdom: 1 },
  derived: { maxHealth: 156, basicDamage: 22, speed: 3, maxMana: 30 },
  allocation: { total: 10, locked: false, confirmed: true },
};

describe("profile save feedback", () => {
  it("applies saved stats, releases controls and shows a toast without navigation", async () => {
    const ui = mount({ response: { ok: true, data: { game } } });
    ui.fields.strength.value = "5";
    ui.fields.intelligence.value = "2";
    await ui.save.handlers.click();

    assert.deepEqual(ui.toasts, ["Points saved"]);
    assert.equal(Number(ui.totals.strength.textContent), 7);
    assert.equal(Number(ui.derived.maxMana.textContent), 30);
    assert.equal(ui.save.disabled, false);
    assert.equal(ui.save.textContent, "Save points");
    assert.equal(ui.window.scrollY, 500);
    assert.equal(ui.requests.length, 1);
  });

  it("unlocks a reset allocation in place and leaves all ten points available", async () => {
    const resetGame = { ...game, base: { strength: 0, dexterity: 0, intelligence: 0 }, allocation: { ...game.allocation, confirmed: false } };
    const ui = mount({ locked: true, response: { ok: true, data: { game: resetGame } } });
    await ui.reset.handlers.click();

    assert.deepEqual(ui.toasts, ["Stats reset. Reassign your ten base points."]);
    assert.equal(ui.fields.strength.value, "0");
    assert.equal(ui.fields.strength.disabled, false);
    assert.equal(ui.remaining.textContent, "10 points left");
    assert.equal(ui.save.hidden, false);
    assert.equal(ui.save.disabled, true);
    assert.equal(ui.save.textContent, "Confirm points");
    assert.equal(ui.allocation.dataset.locked, "false");
  });

  it("keeps entered values and offers a retry when saving fails", async () => {
    const ui = mount({ response: { ok: false, data: { error: "Could not save your points." } } });
    ui.fields.strength.value = "5";
    ui.fields.intelligence.value = "2";
    await ui.save.handlers.click();

    assert.equal(ui.fields.strength.value, "5");
    assert.equal(ui.error.hidden, false);
    assert.equal(ui.save.disabled, false);
    assert.deepEqual(ui.toasts, []);
    assert.equal(ui.window.scrollY, 500);
  });
});
