import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { assertSubmissionAuthorized, SubmissionNotAuthorizedError } from "../authorize";
import type { AorAuthorization, LegalGate } from "../types";
import { makeAssembled, makeMeta, makeAuthorization, OPP_ID } from "./_fixtures";

/**
 * T-C — the AOR-authorization gate. A pure, credential-free attestation check.
 * Hermetic: static fixtures, no network, no model (spec §6, FR-7).
 */

const assembled = makeAssembled();
const meta = makeMeta();
const NO_LEGAL: LegalGate = { legalReviewApproved: false };
const LEGAL_OK: LegalGate = { legalReviewApproved: true };

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

describe("assertSubmissionAuthorized refuses", () => {
  test("null authorization → throws (unchecked box is the absence of authorization)", () => {
    assert.throws(
      () => assertSubmissionAuthorized(assembled, meta, null, "mock", NO_LEGAL),
      SubmissionNotAuthorizedError,
    );
  });

  test("attested:false → throws (schema forces the literal true)", () => {
    const bad = { ...makeAuthorization(), attested: false } as unknown as AorAuthorization;
    assert.throws(
      () => assertSubmissionAuthorized(assembled, meta, bad, "mock", NO_LEGAL),
      SubmissionNotAuthorizedError,
    );
  });

  test("empty org_uei → throws", () => {
    const bad = makeAuthorization({ org_uei: "   " });
    assert.throws(
      () => assertSubmissionAuthorized(assembled, meta, bad, "mock", NO_LEGAL),
      SubmissionNotAuthorizedError,
    );
  });

  test("opportunity-id mismatch (scope ≠ meta) → throws", () => {
    const bad = makeAuthorization({ scope: { opportunity_id: "OPP-OTHER" } });
    assert.throws(
      () => assertSubmissionAuthorized(assembled, meta, bad, "mock", NO_LEGAL),
      SubmissionNotAuthorizedError,
    );
  });

  test("assembled/meta opportunity disagreement → throws (inputs must agree)", () => {
    const otherMeta = makeMeta("OPP-DIFFERENT");
    // authorization is scoped to OPP-DIFFERENT so clause (4a) is what fires.
    const auth = makeAuthorization({ scope: { opportunity_id: "OPP-DIFFERENT" } });
    assert.throws(
      () => assertSubmissionAuthorized(assembled, otherMeta, auth, "mock", NO_LEGAL),
      SubmissionNotAuthorizedError,
    );
  });
});

// ---------------------------------------------------------------------------
// Success (mock)
// ---------------------------------------------------------------------------

describe("assertSubmissionAuthorized passes", () => {
  test("a valid mock authorization scoped to the opportunity → void (no throw)", () => {
    assert.doesNotThrow(() =>
      assertSubmissionAuthorized(assembled, meta, makeAuthorization(), "mock", NO_LEGAL),
    );
  });

  test("the mock path does NOT require the legal gate", () => {
    // legalReviewApproved:false is fine for mock — clause (5) only applies to non-mock.
    assert.doesNotThrow(() =>
      assertSubmissionAuthorized(assembled, meta, makeAuthorization(), "mock", NO_LEGAL),
    );
  });
});

// ---------------------------------------------------------------------------
// Non-mock ADDITIONALLY requires the legal gate (clause 5)
// ---------------------------------------------------------------------------

describe("assertSubmissionAuthorized — non-mock requires the legal gate", () => {
  test("sandbox without legal approval → throws even with a valid authorization", () => {
    assert.throws(
      () => assertSubmissionAuthorized(assembled, meta, makeAuthorization(), "sandbox", NO_LEGAL),
      SubmissionNotAuthorizedError,
    );
  });

  test("sandbox WITH legal approval + valid authorization → void", () => {
    // Note: the GATE alone permits this; the TRANSPORT still refuses to exist
    // (selectTransport('sandbox') throws) — that is what makes HR-4 structural.
    assert.doesNotThrow(() =>
      assertSubmissionAuthorized(assembled, meta, makeAuthorization(), "sandbox", LEGAL_OK),
    );
  });

  test("live without legal approval → throws", () => {
    assert.throws(
      () => assertSubmissionAuthorized(assembled, meta, makeAuthorization(), "live", NO_LEGAL),
      SubmissionNotAuthorizedError,
    );
  });
});

// A tiny guard so OPP_ID stays the fixtures' single source of truth.
test("fixtures are internally consistent", () => {
  assert.equal(meta.opportunity_id, OPP_ID);
  assert.equal(assembled.opportunity_id, OPP_ID);
});
