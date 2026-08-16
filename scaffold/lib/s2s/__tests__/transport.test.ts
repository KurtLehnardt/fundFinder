import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  MockTransport,
  selectTransport,
  assertNonProductionEndpoint,
  TransportNotAvailableError,
  ProductionEndpointRefusedError,
} from "../transport";
import type { OrgS2SConfig } from "../config";

/**
 * T-C — transport + endpoint guard (the SAFETY CORE). Hermetic: no network, and
 * an injected clock/counter so the mock is fully deterministic.
 */

const ISO = "2026-08-16T12:00:00.000Z";
const fixedClock = () => ISO;

// ---------------------------------------------------------------------------
// MockTransport — labeled mock receipt, no credentials, no network (HR-3, HR-5)
// ---------------------------------------------------------------------------

describe("MockTransport", () => {
  test("kind is 'mock'", () => {
    assert.equal(new MockTransport().kind, "mock");
  });

  test("submit returns a labeled mock receipt (is_mock + submitted_to + human_note)", async () => {
    const t = new MockTransport({ now: fixedClock, startSeq: 1 });
    const receipt = await t.submit("<soap:Envelope/>");
    assert.equal(receipt.is_mock, true);
    assert.equal(receipt.submitted_to, "MOCK");
    assert.equal(receipt.status, "MOCK_COMPLETE");
    assert.equal(receipt.received_at, ISO);
    assert.match(receipt.human_note, /MOCK — nothing was submitted to any federal system\./);
    assert.match(receipt.tracking_id, /^MOCK-\d{4}$/);
    assert.equal(receipt.tracking_id, "MOCK-0001");
  });

  test("tracking ids are deterministic from the injected counter", async () => {
    const t = new MockTransport({ now: fixedClock, startSeq: 7 });
    assert.equal((await t.submit("x")).tracking_id, "MOCK-0007");
    assert.equal((await t.submit("x")).tracking_id, "MOCK-0008");
  });

  test("submit reads NO credentials: a cfg argument is ignored entirely", async () => {
    // A cfg with a PRODUCTION-looking endpoint must NOT cause the mock to touch,
    // validate, or reject it — the mock ignores cfg completely.
    const cfg = {
      orgUei: "ABC123",
      endpointUrl: "https://api.grants.gov/prod",
      transportKind: "sandbox",
    } as unknown as OrgS2SConfig;
    const receipt = await t_submit(cfg);
    assert.equal(receipt.is_mock, true);
    assert.equal(receipt.submitted_to, "MOCK");
  });

  async function t_submit(cfg: OrgS2SConfig) {
    const t = new MockTransport({ now: fixedClock });
    return t.submit("<soap:Envelope/>", cfg);
  }

  test("status returns a labeled mock status, never polling a network", async () => {
    const t = new MockTransport({ now: fixedClock });
    const receipt = await t.submit("x");
    const status = await t.status!(receipt.tracking_id);
    assert.equal(status.is_mock, true);
    assert.equal(status.tracking_id, receipt.tracking_id);
    assert.equal(status.status, "MOCK_COMPLETE");
  });
});

// ---------------------------------------------------------------------------
// selectTransport — mock only; sandbox/live throw (FR-5)
// ---------------------------------------------------------------------------

describe("selectTransport", () => {
  test("returns a MockTransport for 'mock'", () => {
    const t = selectTransport("mock");
    assert.ok(t instanceof MockTransport);
    assert.equal(t.kind, "mock");
  });

  test("throws TransportNotAvailableError for 'sandbox'", () => {
    assert.throws(() => selectTransport("sandbox"), TransportNotAvailableError);
  });

  test("throws TransportNotAvailableError for 'live'", () => {
    assert.throws(() => selectTransport("live"), TransportNotAvailableError);
  });

  test("with a sandbox cfg it STILL throws (not implemented), but guards the endpoint first", () => {
    // A production endpoint is refused specifically (defense-in-depth) even in the
    // not-implemented branch.
    const prodCfg = {
      orgUei: "ABC123",
      endpointUrl: "https://api.grants.gov/prod",
      transportKind: "sandbox",
    } as unknown as OrgS2SConfig;
    assert.throws(() => selectTransport("sandbox", prodCfg), ProductionEndpointRefusedError);

    // A sandbox endpoint passes the guard but the transport is still not available.
    const sandboxCfg: OrgS2SConfig = {
      orgUei: "ABC123",
      endpointUrl: "https://training.grants.gov/apply",
      transportKind: "sandbox",
    };
    assert.throws(() => selectTransport("sandbox", sandboxCfg), TransportNotAvailableError);
  });
});

// ---------------------------------------------------------------------------
// assertNonProductionEndpoint — DEFAULT-DENY (FR-6)
// ---------------------------------------------------------------------------

describe("assertNonProductionEndpoint (default-deny)", () => {
  test("passes for the two sandbox allowlist hosts", () => {
    assert.doesNotThrow(() => assertNonProductionEndpoint("https://training.grants.gov/apply"));
    assert.doesNotThrow(() =>
      assertNonProductionEndpoint("https://api.staging.grants.gov/v1/submit"),
    );
    // Bare-host convenience is also accepted.
    assert.doesNotThrow(() => assertNonProductionEndpoint("training.grants.gov"));
    assert.doesNotThrow(() => assertNonProductionEndpoint("api.staging.grants.gov"));
  });

  test("throws for every production grants.gov host", () => {
    for (const host of ["grants.gov", "www.grants.gov", "api.grants.gov"]) {
      assert.throws(
        () => assertNonProductionEndpoint(`https://${host}/submit`),
        ProductionEndpointRefusedError,
        `production host ${host} must be refused`,
      );
    }
  });

  test("throws for an unknown host (default-deny — allowlist, not denylist)", () => {
    assert.throws(
      () => assertNonProductionEndpoint("https://example.com/apply"),
      ProductionEndpointRefusedError,
    );
    assert.throws(
      () => assertNonProductionEndpoint("https://grants.gov.evil.com/apply"),
      ProductionEndpointRefusedError,
    );
  });

  test("throws for an unparseable URL", () => {
    assert.throws(
      () => assertNonProductionEndpoint("::: not a url :::"),
      ProductionEndpointRefusedError,
    );
    assert.throws(() => assertNonProductionEndpoint(""), ProductionEndpointRefusedError);
  });

  test("host comparison is case-insensitive", () => {
    assert.doesNotThrow(() => assertNonProductionEndpoint("https://TRAINING.Grants.GOV/apply"));
    assert.throws(
      () => assertNonProductionEndpoint("https://API.GRANTS.GOV/x"),
      ProductionEndpointRefusedError,
    );
  });
});
