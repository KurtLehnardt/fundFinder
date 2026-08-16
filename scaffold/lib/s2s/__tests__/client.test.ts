import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { submitPackage } from "../client";
import { MockTransport } from "../transport";
import type { TransportKind } from "../types";
import { makeAssembled, makeMeta, makeAuthorization } from "./_fixtures";

/**
 * T-C — the orchestrating client + the HR-4 honesty invariant. Hermetic: static
 * fixtures, the flag driven purely via `configOverride`, no network, no model.
 */

const assembled = makeAssembled();
const meta = makeMeta();
const ON = { g6_s2s_submission: "true" } as const;
const OFF = { g6_s2s_submission: "false" } as const;

// Keep the flag's env var out of the picture so the "default OFF" test is hermetic
// regardless of the outer shell/CI.
let savedEnv: NodeJS.ProcessEnv;
before(() => {
  savedEnv = { ...process.env };
  delete process.env.NEXT_PUBLIC_FLAG_G6_S2S_SUBMISSION;
});
after(() => {
  process.env = savedEnv;
});

// ---------------------------------------------------------------------------
// Flag gate
// ---------------------------------------------------------------------------

describe("submitPackage — flag gate", () => {
  test("throws when the flag is OFF via override", async () => {
    await assert.rejects(
      submitPackage(assembled, meta, { authorization: makeAuthorization(), configOverride: OFF }),
    );
  });

  test("throws by DEFAULT (no override, no env) — the flag is OFF by construction", async () => {
    await assert.rejects(submitPackage(assembled, meta, { authorization: makeAuthorization() }));
  });
});

// ---------------------------------------------------------------------------
// Happy path (mock)
// ---------------------------------------------------------------------------

describe("submitPackage — flag ON + valid authorization + mock", () => {
  test("returns a labeled mock receipt", async () => {
    const receipt = await submitPackage(assembled, meta, {
      transportKind: "mock",
      authorization: makeAuthorization(),
      configOverride: ON,
    });
    assert.equal(receipt.is_mock, true);
    assert.equal(receipt.submitted_to, "MOCK");
    assert.equal(receipt.status, "MOCK_COMPLETE");
    assert.match(receipt.human_note, /MOCK — nothing was submitted to any federal system\./);
    assert.match(receipt.tracking_id, /^MOCK-\d{4}$/);
  });

  test("defaults to the mock transport when transportKind is omitted", async () => {
    const receipt = await submitPackage(assembled, meta, {
      authorization: makeAuthorization(),
      configOverride: ON,
    });
    assert.equal(receipt.is_mock, true);
    assert.equal(receipt.submitted_to, "MOCK");
  });

  test("throws when the flag is ON but authorization is missing", async () => {
    await assert.rejects(
      submitPackage(assembled, meta, { authorization: null, configOverride: ON }),
    );
  });
});

// ---------------------------------------------------------------------------
// HR-4 invariant — the ONLY non-throwing cell is {flag on, authorized, mock},
// and no non-mock transport is ever constructed / no submit is ever run for one.
// ---------------------------------------------------------------------------

describe("HR-4 honesty invariant", () => {
  test("drives every {flag}×{auth}×{kind} cell; only {on,authorized,mock} resolves", async () => {
    const flags = [true, false];
    const auths = [true, false];
    const kinds: TransportKind[] = ["mock", "sandbox", "live"];

    // Spy on the mock's submit: it is the ONLY transport that can ever run. If it
    // is reached more than once (or for a non-mock `this`), the invariant is broken.
    const origSubmit = MockTransport.prototype.submit;
    let submitCalls = 0;
    const spy: typeof origSubmit = async function (this: MockTransport, envelope, cfg) {
      submitCalls += 1;
      assert.equal(this.kind, "mock", "the only transport that runs is the mock");
      return origSubmit.call(this, envelope, cfg);
    };
    MockTransport.prototype.submit = spy;

    try {
      for (const flag of flags) {
        for (const authorized of auths) {
          for (const kind of kinds) {
            const call = submitPackage(assembled, meta, {
              transportKind: kind,
              authorization: authorized ? makeAuthorization() : null,
              configOverride: flag ? ON : OFF,
            });
            const isOnlyGoodCell = flag && authorized && kind === "mock";
            if (isOnlyGoodCell) {
              const receipt = await call;
              assert.equal(receipt.is_mock, true);
              assert.equal(receipt.submitted_to, "MOCK");
            } else {
              await assert.rejects(
                call,
                `cell {flag:${flag}, auth:${authorized}, kind:${kind}} must throw`,
              );
            }
          }
        }
      }
    } finally {
      MockTransport.prototype.submit = origSubmit;
    }

    // Reached exactly once — in the single good cell — and never for a non-mock kind.
    assert.equal(submitCalls, 1);
  });

  test("even with legal approval + valid auth, a non-mock kind refuses at the transport (submit never runs)", async () => {
    const origSubmit = MockTransport.prototype.submit;
    let submitCalls = 0;
    const spy: typeof origSubmit = async function (this: MockTransport, envelope, cfg) {
      submitCalls += 1;
      return origSubmit.call(this, envelope, cfg);
    };
    MockTransport.prototype.submit = spy;

    try {
      // The AOR gate is fully satisfied for sandbox (legalReviewApproved:true), so
      // the ONLY thing left to refuse is the transport itself — and it does.
      await assert.rejects(
        submitPackage(assembled, meta, {
          transportKind: "sandbox",
          authorization: makeAuthorization(),
          legalGate: { legalReviewApproved: true },
          configOverride: ON,
        }),
      );
      await assert.rejects(
        submitPackage(assembled, meta, {
          transportKind: "live",
          authorization: makeAuthorization(),
          legalGate: { legalReviewApproved: true },
          configOverride: ON,
        }),
      );
    } finally {
      MockTransport.prototype.submit = origSubmit;
    }

    assert.equal(submitCalls, 0, "no submit runs for any non-mock transport");
  });
});
