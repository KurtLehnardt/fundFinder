import { assertNonProductionEndpoint } from "./transport";

/**
 * WS-G / G6 · T-C — the per-org S2S config / credential model.
 *
 * This models the SHAPE of a future, separately-gated sandbox path so it is typed
 * and reviewed — but G6 wires NO transport that consumes it against a real host,
 * and the default (mock) path never reads it at all (spec §5, HR-5).
 *
 * Hard rules encoded here (spec §5.2, §10.3):
 *   - The config is the ORG's OWN, org-supplied. NEVER fundFinder's credentials,
 *     NEVER hardcoded, NEVER a production host.
 *   - It is SERVER-ONLY. Its env vars are plain `process.env.*` names and MUST
 *     NEVER be `NEXT_PUBLIC_*` — a `NEXT_PUBLIC_*` var is inlined into the client
 *     bundle at build time, which is exactly what must never happen to org config.
 *     (Contrast the `g6_s2s_submission` FLAG, which IS `NEXT_PUBLIC_` because it
 *     only gates UI visibility, not credentials.)
 *   - `clientCertRef` is a REFERENCE — an env-var NAME / handle the org resolves
 *     out-of-band from its own secret store — NOT a secret value. Nothing here
 *     reads a secret value, and the mock transport ignores this object entirely.
 *   - `loadOrgS2SConfig` is NULL-BY-DEFAULT: with no env set it returns `null`. It
 *     returns a config only when a COMPLETE per-org sandbox config is present AND
 *     its endpoint passes {@link assertNonProductionEndpoint}. A production endpoint
 *     → THROW (a production host can never survive into a config object).
 */

// ---------------------------------------------------------------------------
// Env var names (documented; server-only; NEVER NEXT_PUBLIC_)
// ---------------------------------------------------------------------------

/**
 * The (server-only, non-`NEXT_PUBLIC_`) env var NAMES this loader reads. Documented
 * as constants so the names live in one place; the VALUES are the org's own and are
 * never committed. `CLIENT_CERT_REF` itself holds a *reference* (an env-var name /
 * handle), not a secret.
 */
export const ORG_S2S_ENV_VARS = {
  /** The org's OWN UEI. */
  UEI: "ORG_S2S_UEI",
  /** The sandbox endpoint URL — MUST pass the non-production guard. */
  ENDPOINT_URL: "ORG_S2S_ENDPOINT_URL",
  /** A REFERENCE (name/handle) to the org's PKI client cert — NOT a secret value. */
  CLIENT_CERT_REF: "ORG_S2S_CLIENT_CERT_REF",
} as const;

// ---------------------------------------------------------------------------
// OrgS2SConfig
// ---------------------------------------------------------------------------

/**
 * Per-org S2S configuration. Org-supplied, server-only, sandbox-only, and `null`
 * on the default path (the mock transport ignores this entirely). See the module
 * doc block for the hard rules — most importantly: this holds a cert REFERENCE,
 * never a secret value, and its source env vars are NEVER `NEXT_PUBLIC_*`.
 */
export interface OrgS2SConfig {
  /** The org's OWN UEI (matches the package's org). */
  orgUei: string;
  /** The sandbox endpoint URL. MUST pass {@link assertNonProductionEndpoint}. */
  endpointUrl: string;
  /**
   * A REFERENCE to the org's own commercial PKI client cert — an env-var NAME /
   * handle the org resolves out-of-band from its own secret store, NOT a secret
   * value inlined here. G6 wires no transport that reads it; it is typed for the
   * future sandbox seam only. The mock never reads this.
   */
  clientCertRef?: string;
  /**
   * Always `"sandbox"`. `"mock"` needs no config at all; `"live"` is never produced
   * by G6. Typing this as a literal keeps a live config structurally unconstructible.
   */
  transportKind: "sandbox";
}

// ---------------------------------------------------------------------------
// loadOrgS2SConfig — null-by-default, production-refusing
// ---------------------------------------------------------------------------

/**
 * Load the per-org sandbox config from the (server-only) environment, or return
 * `null`.
 *
 * Returns `null` unless BOTH required vars ({@link ORG_S2S_ENV_VARS.UEI} and
 * {@link ORG_S2S_ENV_VARS.ENDPOINT_URL}) are present and non-empty. When they are,
 * the endpoint is run through {@link assertNonProductionEndpoint}: a sandbox host
 * yields the config; a PRODUCTION (or unknown, or unparseable) host THROWS
 * {@link ProductionEndpointRefusedError} — a production endpoint can never survive
 * into a returned config (spec §5.2, §10.3, FR-6).
 *
 * The default path sets none of these vars, so this returns `null` and the mock
 * path proceeds with no config and no credentials.
 *
 * @param env - the environment to read (defaults to `process.env`). Injectable so
 *   tests need not mutate the global environment. NEVER reads a `NEXT_PUBLIC_*` var.
 */
export function loadOrgS2SConfig(env: NodeJS.ProcessEnv = process.env): OrgS2SConfig | null {
  const orgUei = (env[ORG_S2S_ENV_VARS.UEI] ?? "").trim();
  const endpointUrl = (env[ORG_S2S_ENV_VARS.ENDPOINT_URL] ?? "").trim();

  // Null-by-default: an incomplete config is simply "no config" (never a partial,
  // never a guessed default).
  if (orgUei.length === 0 || endpointUrl.length === 0) return null;

  // A production (or unknown / unparseable) endpoint THROWS here — it can never be
  // returned inside a config object.
  assertNonProductionEndpoint(endpointUrl);

  // `clientCertRef` is an optional REFERENCE (name/handle), not a secret value.
  const clientCertRefRaw = (env[ORG_S2S_ENV_VARS.CLIENT_CERT_REF] ?? "").trim();
  const clientCertRef = clientCertRefRaw.length > 0 ? clientCertRefRaw : undefined;

  return {
    orgUei,
    endpointUrl,
    clientCertRef,
    transportKind: "sandbox",
  };
}
