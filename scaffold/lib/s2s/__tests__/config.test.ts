import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadOrgS2SConfig, ORG_S2S_ENV_VARS } from "../config";
import { ProductionEndpointRefusedError } from "../transport";

/**
 * T-C — the per-org config model. Hermetic: an explicit `env` object is passed to
 * `loadOrgS2SConfig`, so `process.env` is never mutated. Server-only, null-by-
 * default, production-refusing, cert REFERENCE not secret (spec §5.2, HR-5).
 */

/**
 * Build a synthetic env for the loader. `NodeJS.ProcessEnv` is augmented (by
 * Next/@types/node) to require `NODE_ENV`, so a bare object literal will not type;
 * this narrow cast lets a test pass exactly the vars under test and nothing else.
 */
const env = (vars: Record<string, string | undefined>): NodeJS.ProcessEnv =>
  vars as NodeJS.ProcessEnv;

// ---------------------------------------------------------------------------
// null-by-default
// ---------------------------------------------------------------------------

describe("loadOrgS2SConfig — null by default", () => {
  test("returns null with no env vars set", () => {
    assert.equal(loadOrgS2SConfig(env({})), null);
  });

  test("returns null when the config is incomplete (partial is never a config)", () => {
    assert.equal(loadOrgS2SConfig(env({ [ORG_S2S_ENV_VARS.UEI]: "ABC123DEF456" })), null);
    assert.equal(
      loadOrgS2SConfig(
        env({ [ORG_S2S_ENV_VARS.ENDPOINT_URL]: "https://training.grants.gov/apply" }),
      ),
      null,
    );
    // Blank strings are treated as absent.
    assert.equal(
      loadOrgS2SConfig(
        env({
          [ORG_S2S_ENV_VARS.UEI]: "   ",
          [ORG_S2S_ENV_VARS.ENDPOINT_URL]: "https://training.grants.gov/apply",
        }),
      ),
      null,
    );
  });
});

// ---------------------------------------------------------------------------
// production endpoint → throw (a production host cannot survive into a config)
// ---------------------------------------------------------------------------

describe("loadOrgS2SConfig — refuses a production endpoint", () => {
  test("throws for a production grants.gov endpoint", () => {
    assert.throws(
      () =>
        loadOrgS2SConfig(
          env({
            [ORG_S2S_ENV_VARS.UEI]: "ABC123DEF456",
            [ORG_S2S_ENV_VARS.ENDPOINT_URL]: "https://api.grants.gov/prod",
          }),
        ),
      ProductionEndpointRefusedError,
    );
  });

  test("throws for an unknown host (default-deny)", () => {
    assert.throws(
      () =>
        loadOrgS2SConfig(
          env({
            [ORG_S2S_ENV_VARS.UEI]: "ABC123DEF456",
            [ORG_S2S_ENV_VARS.ENDPOINT_URL]: "https://example.com/apply",
          }),
        ),
      ProductionEndpointRefusedError,
    );
  });
});

// ---------------------------------------------------------------------------
// complete sandbox config → returns it
// ---------------------------------------------------------------------------

describe("loadOrgS2SConfig — a complete sandbox config", () => {
  test("returns a sandbox config when both required vars are present + endpoint is sandbox", () => {
    const cfg = loadOrgS2SConfig(
      env({
        [ORG_S2S_ENV_VARS.UEI]: "ABC123DEF456",
        [ORG_S2S_ENV_VARS.ENDPOINT_URL]: "https://training.grants.gov/apply",
      }),
    );
    assert.ok(cfg, "config is returned");
    assert.equal(cfg.orgUei, "ABC123DEF456");
    assert.equal(cfg.endpointUrl, "https://training.grants.gov/apply");
    assert.equal(cfg.transportKind, "sandbox");
    // No cert ref was supplied -> undefined (never a fabricated/default secret).
    assert.equal(cfg.clientCertRef, undefined);
  });

  test("carries clientCertRef as an opt-in REFERENCE (a name/handle, not a secret)", () => {
    const cfg = loadOrgS2SConfig(
      env({
        [ORG_S2S_ENV_VARS.UEI]: "ABC123DEF456",
        [ORG_S2S_ENV_VARS.ENDPOINT_URL]: "https://api.staging.grants.gov/v1/submit",
        [ORG_S2S_ENV_VARS.CLIENT_CERT_REF]: "ORG_PKI_CERT_HANDLE",
      }),
    );
    assert.ok(cfg);
    // The value is the REFERENCE string itself (an env-var name/handle), not a cert.
    assert.equal(cfg.clientCertRef, "ORG_PKI_CERT_HANDLE");
  });

  test("the documented env var names are all server-only (never NEXT_PUBLIC_)", () => {
    for (const name of Object.values(ORG_S2S_ENV_VARS)) {
      assert.ok(!name.startsWith("NEXT_PUBLIC_"), `${name} must not be NEXT_PUBLIC_`);
    }
  });
});
