import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../public/scripts/app.js", import.meta.url), "utf8");

function slice(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return source.slice(start, end);
}

/* The answer interface, taken from the file it ships in: the selection, the
   handler that saves it, and the status reader the handler leans on. */
const answerModule = [
  slice("function setDailyActionSelection(", "\nif (dailyCheckInRoot) {"),
  slice("async function loadCheckInStatus(", "\nfunction formatTimerPart("),
].join("\n");

function fakeButton() {
  return {
    attributes: {},
    disabled: false,
    setAttribute(name, value) { this.attributes[name] = value; },
    getAttribute(name) { return this.attributes[name] ?? null; },
  };
}

/**
 * Runs one answer through the real handler with the network under our control.
 *
 * `responses` maps an endpoint to what `apiFetch` returns for it; `null` stands
 * for a request that never reached the server at all, which is what an offline
 * phone produces.
 */
async function answer(action, responses, { startingAnswer = null } = {}) {
  const yes = fakeButton();
  const no = fakeButton();
  const toasts = [];
  const calls = [];

  const context = {
    yesButton: yes,
    noButton: no,
    checkInMessage: null,
    checkInTimer: null,
    checkInProgress: null,
    resetTimerId: undefined,
    window: { clearInterval() {}, setInterval() { return 1; } },
    showToast: (message, variant) => toasts.push({ message, variant }),
    renderLeaderboard: () => {},
    apiFetch: async (url) => {
      calls.push(url);
      return responses[url] ?? { ok: false, status: 0, data: {} };
    },
  };

  const sandbox = { ...context, action, startingAnswer, result: null };
  vm.runInNewContext(
    `${answerModule}\nsetDailyActionSelection(startingAnswer);\nresult = updateLeaderboard(action);`,
    sandbox,
  );
  await sandbox.result;

  return { yes: sandbox.yesButton, no: sandbox.noButton, toasts, calls };
}

describe("a daily answer never claims to be recorded when it was not", () => {
  it("marks the answer once the server has accepted it", async () => {
    const out = await answer("increment", {
      "/api/leaderboard/increment": { ok: true, status: 200, data: { leaderboard: [], status: { answer: "YES", canAnswer: false, answeredToday: true } } },
    });

    assert.equal(out.yes.getAttribute("aria-pressed"), "true");
    assert.equal(out.no.getAttribute("aria-pressed"), "false");
    assert.equal(out.yes.disabled, true, "an answered day locks the control");
  });

  it("puts the selection back when the save fails and the status can be re-read", async () => {
    const out = await answer("increment", {
      "/api/leaderboard/increment": { ok: false, status: 500, data: {} },
      "/api/check-in/status": { ok: true, status: 200, data: { answer: null, canAnswer: true, answeredToday: false } },
    });

    assert.equal(out.yes.getAttribute("aria-pressed"), "false");
    assert.match(out.toasts.at(-1).message, /Could not save/i);
  });

  it("puts the selection back when the phone is offline and nothing can be re-read", async () => {
    // The real failure a phone produces: the save never leaves the device, and
    // neither does the status request that would otherwise correct the display.
    const out = await answer("increment", {
      "/api/leaderboard/increment": { ok: false, status: 0, data: {} },
      "/api/check-in/status": { ok: false, status: 0, data: {} },
    });

    assert.equal(
      out.yes.getAttribute("aria-pressed"),
      "false",
      "an unsent answer must not read as recorded to a screen reader",
    );
    assert.match(out.toasts.at(-1).message, /Could not save/i);
  });

  it("restores the answer that was already there, not merely a blank state", async () => {
    const out = await answer("reset", {
      "/api/leaderboard/reset": { ok: false, status: 0, data: {} },
      "/api/check-in/status": { ok: false, status: 0, data: {} },
    }, { startingAnswer: "YES" });

    assert.equal(out.yes.getAttribute("aria-pressed"), "true", "the recorded Yes survives a failed correction");
    assert.equal(out.no.getAttribute("aria-pressed"), "false");
  });

  it("tells an already-answered day apart from a failure", async () => {
    const out = await answer("increment", {
      "/api/leaderboard/increment": { ok: false, status: 409, data: {} },
      "/api/check-in/status": { ok: true, status: 200, data: { answer: "NO", canAnswer: false, answeredToday: true } },
    });

    assert.match(out.toasts.at(-1).message, /already answered/i);
    assert.equal(out.no.getAttribute("aria-pressed"), "true", "the day shows the answer the server actually holds");
  });
});
