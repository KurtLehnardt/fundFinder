import { test } from "node:test";
import assert from "node:assert/strict";

import { tierFromScore, historyFor, CALIBRATION } from "../match";

/**
 * Pure calibration helpers of the match pipeline (H6). No LLM / embedding /
 * network — these are exact-boundary unit tests of the tier thresholds and the
 * award-history lookup's missing-id behavior.
 */

test("tierFromScore — exact boundaries around the calibrated thresholds", () => {
  // scoreFloor is the verify/adjacent boundary; keep the test honest if it moves.
  assert.equal(CALIBRATION.scoreFloor, 30);

  assert.equal(tierFromScore(100), "likely");
  assert.equal(tierFromScore(75), "likely"); // >= 75
  assert.equal(tierFromScore(74), "verify");
  assert.equal(tierFromScore(30), "verify"); // >= scoreFloor
  assert.equal(tierFromScore(29), "adjacent");
  assert.equal(tierFromScore(25), "adjacent"); // >= 25
  assert.equal(tierFromScore(24), "none");
  assert.equal(tierFromScore(0), "none");
});

test("historyFor — an opportunity id with no award rows returns undefined (never throws)", () => {
  assert.equal(historyFor("this-id-has-no-award-rows-xyz"), undefined);
  assert.equal(historyFor("this-id-has-no-award-rows-xyz", "utah"), undefined);
});
