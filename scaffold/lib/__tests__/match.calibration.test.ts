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
  // E1: raised 30 -> 33 so case-5's education/STEM GRANT noise (~<=32) cannot
  // over-match as "strong" — protecting the sacred honest-no.
  assert.equal(CALIBRATION.scoreFloor, 33);

  assert.equal(tierFromScore(100), "likely");
  assert.equal(tierFromScore(60), "likely"); // >= 60 (E1: lowered from 75 — a dead tier on the 968-opp corpus, whose score ceiling is ~78)
  assert.equal(tierFromScore(59), "verify");
  assert.equal(tierFromScore(33), "verify"); // >= scoreFloor
  assert.equal(tierFromScore(32), "adjacent"); // case-5's grant spikes land here (permitted adjacent)
  assert.equal(tierFromScore(25), "adjacent"); // >= 25
  assert.equal(tierFromScore(24), "none");
  assert.equal(tierFromScore(0), "none");
});

test("historyFor — an opportunity id with no award rows returns undefined (never throws)", () => {
  assert.equal(historyFor("this-id-has-no-award-rows-xyz"), undefined);
  assert.equal(historyFor("this-id-has-no-award-rows-xyz", "utah"), undefined);
});
