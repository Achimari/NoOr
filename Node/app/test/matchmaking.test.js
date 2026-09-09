import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getRatingBand } from "../src/services/matchmakingService.js";
import { PVP } from "../src/domain/constants.js";

describe("rating band widening", () => {
  it("starts narrow", () => {
    const band = getRatingBand(400, 0);

    assert.equal(band.band, PVP.INITIAL_BAND);
    assert.ok(band.maxRating - band.minRating < 400 * 0.2);
  });

  it("widens the longer a player waits", () => {
    const first = getRatingBand(400, 0);
    const later = getRatingBand(400, PVP.BAND_STEP_MS * 3);

    assert.ok(later.band > first.band);
    assert.ok(later.minRating < first.minRating);
    assert.ok(later.maxRating > first.maxRating);
  });

  it("widens monotonically, never narrowing while waiting", () => {
    let previous = -Infinity;

    for (let waited = 0; waited <= PVP.BAND_STEP_MS * 12; waited += PVP.BAND_STEP_MS) {
      const { band } = getRatingBand(400, waited);
      assert.ok(band >= previous, `band must not narrow at ${waited}ms`);
      previous = band;
    }
  });

  it("stops widening at the cap so matching stays meaningful", () => {
    const veryLate = getRatingBand(400, PVP.BAND_STEP_MS * 1000);

    assert.equal(veryLate.band, PVP.MAX_BAND);
  });

  it("keeps a usable absolute spread for very low ratings", () => {
    const band = getRatingBand(10, 0);

    assert.ok(band.maxRating - band.minRating >= 50, "a tiny rating still gets a workable window");
  });

  it("eventually admits a pair that started outside each other's band", () => {
    const alice = 214;
    const bob = 182;

    const atStart = getRatingBand(alice, 0);
    assert.ok(bob < atStart.minRating || bob > atStart.maxRating, "outside the initial band");

    const later = getRatingBand(alice, PVP.BAND_STEP_MS * 2);
    assert.ok(bob >= later.minRating && bob <= later.maxRating, "inside the widened band");
  });

  it("treats a negative wait as no wait rather than inverting the band", () => {
    assert.equal(getRatingBand(400, -5000).band, PVP.INITIAL_BAND);
  });
});
