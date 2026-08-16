import type { TransportKind, SubmissionReceipt, SubmissionStatus } from "./types";
import type { OrgS2SConfig } from "./config";

/**
 * WS-G / G6 · T-C — the pluggable submission transport + the SAFETY CORE guards.
 *
 * G6 wires exactly ONE transport: the hermetic {@link MockTransport}. There is no
 * `LiveTransport` and no `SandboxTransport` symbol anywhere in `lib/s2s` — the
 * `"sandbox"` / `"live"` kinds exist in the type only so the guarded, unwired seam
 * is *typed*, never so it can fire. `selectTransport("sandbox"|"live")` throws
 * {@link TransportNotAvailableError} (spec §6, §10.1, FR-5).
 *
 * Two structural guarantees make "no live submission" a property of the code, not
 * a convention:
 *   - {@link MockTransport} reads NO credentials and produces ONLY mock receipts
 *     (`is_mock: true`, `submitted_to: "MOCK"`). It never touches the network.
 *   - {@link assertNonProductionEndpoint} is DEFAULT-DENY: only the two documented
 *     sandbox hosts pass; every production host AND every unknown host throws
 *     {@link ProductionEndpointRefusedError}. A production URL can therefore never
 *     survive into a config object or a transport-select call (defense-in-depth,
 *     spec §5.2, §6, FR-6).
 *
 * This module contains NO production federal host, NO WSDL URL, and none of the
 * authenticated-AOR / third-party-submitter operation names (NG-1, HR-6).
 */

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Thrown by {@link selectTransport} for any non-mock kind. G6 ships no non-mock
 * transport, so this is the honest, structural "not implemented" — reachable only
 * by a caller explicitly asking for `"sandbox"` / `"live"` (spec §6, FR-5).
 */
export class TransportNotAvailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransportNotAvailableError";
  }
}

/**
 * Thrown by {@link assertNonProductionEndpoint} for any host that is not on the
 * sandbox allowlist — every production host, every unknown host, and any URL that
 * cannot be parsed. Default-deny is the whole point (spec §6, FR-6, HR-4).
 */
export class ProductionEndpointRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductionEndpointRefusedError";
  }
}

// ---------------------------------------------------------------------------
// Non-production endpoint guard (DEFAULT-DENY)
// ---------------------------------------------------------------------------

/**
 * The ONLY hosts a non-mock transport would ever be permitted to reach — the two
 * documented grants.gov SANDBOX/TRAINING hosts (spec §5.2, memo §2.2). Anything
 * not literally on this list is refused. Every production federal host is
 * deliberately absent from this allowlist, so it falls through to the default-deny
 * throw like any other unknown host — there is no production host constant here.
 */
const SANDBOX_HOST_ALLOWLIST: readonly string[] = [
  "training.grants.gov",
  "api.staging.grants.gov",
];

/**
 * Extract the lowercase host from `url`. Accepts a full URL (`https://host/…`)
 * and, as a convenience, a bare host (`host`). Returns `null` when neither parse
 * succeeds — the caller treats that as "refuse" (default-deny), so an unparseable
 * URL can never be mistaken for an allowed one.
 */
function extractHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    // Not a full URL — try again treating the input as a bare host.
  }
  try {
    return new URL(`https://${url}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * DEFAULT-DENY endpoint guard. Passes (returns void) ONLY for the sandbox
 * allowlist (`training.grants.gov`, `api.staging.grants.gov`). Throws
 * {@link ProductionEndpointRefusedError} for every production host, every unknown
 * host, and any unparseable URL — the safe default is "refuse" (spec §6, FR-6).
 *
 * This runs both at config-read time ({@link loadOrgS2SConfig}) and at
 * transport-select time (defense-in-depth): a production URL cannot survive into a
 * config object OR into a (would-be) transport.
 */
export function assertNonProductionEndpoint(url: string): void {
  const host = extractHost(url);
  if (host === null) {
    throw new ProductionEndpointRefusedError(
      `Refusing endpoint ${JSON.stringify(url)}: not a parseable URL (default-deny).`,
    );
  }
  if (!SANDBOX_HOST_ALLOWLIST.includes(host)) {
    throw new ProductionEndpointRefusedError(
      `Refusing endpoint host ${JSON.stringify(host)}: not on the sandbox allowlist ` +
        `[${SANDBOX_HOST_ALLOWLIST.join(", ")}] (default-deny; production and unknown hosts are refused).`,
    );
  }
}

// ---------------------------------------------------------------------------
// The transport interface
// ---------------------------------------------------------------------------

/**
 * A pluggable submission transport. G6 wires only the mock (below); the interface
 * exists so a future, separately-gated sandbox/live transport could slot in behind
 * the same seam — but none ships here.
 */
export interface SubmissionTransport {
  readonly kind: TransportKind;
  /**
   * Submit a SOAP envelope. `cfg` is accepted for the future seam only — the mock
   * IGNORES it entirely and reads no credentials.
   */
  submit(envelope: string, cfg?: OrgS2SConfig | null): Promise<SubmissionReceipt>;
  /** Optional mock-only status lookup; never polls a real endpoint. */
  status?(trackingId: string): Promise<SubmissionStatus>;
}

// ---------------------------------------------------------------------------
// MockTransport — the only wired transport (hermetic, credential-free)
// ---------------------------------------------------------------------------

/**
 * Options for {@link MockTransport}. Both are injectable so tests are fully
 * deterministic; both default to real-but-still-local values (a monotonic counter
 * and the wall clock). Neither touches the network.
 */
export interface MockTransportOptions {
  /** Injectable clock for deterministic `received_at` / `checked_at`. */
  now?: () => string;
  /** Injectable starting value for the `MOCK-<n>` tracking-id counter. */
  startSeq?: number;
}

/**
 * The hermetic mock transport — the ONLY transport G6 wires. It:
 *   - reads NO credentials (ignores the `cfg` argument entirely, HR-5);
 *   - performs NO network I/O (nothing is submitted to any federal system, HR-3);
 *   - returns ONLY mock receipts (`is_mock: true`, `submitted_to: "MOCK"`, and an
 *     unmissable `human_note`), with a deterministic `MOCK-<n>` tracking id;
 *   - keeps a small in-memory record so the optional {@link status} method can
 *     return a labeled mock status without ever polling anything.
 */
export class MockTransport implements SubmissionTransport {
  readonly kind = "mock" as const;

  private readonly now: () => string;
  private seq: number;
  /** In-memory record of issued mock submissions (demo/status convenience only). */
  private readonly records = new Map<string, SubmissionStatus>();

  constructor(options: MockTransportOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.seq = options.startSeq ?? 1;
  }

  /**
   * "Submit" the envelope — i.e. do NOTHING but mint a clearly-labeled mock
   * receipt. The `_cfg` argument is deliberately unread: the mock needs, wants,
   * and touches no credentials of any kind (HR-5, spec §5.1).
   */
  async submit(_envelope: string, _cfg?: OrgS2SConfig | null): Promise<SubmissionReceipt> {
    const trackingId = `MOCK-${String(this.seq).padStart(4, "0")}`;
    this.seq += 1;
    const receivedAt = this.now();

    const receipt: SubmissionReceipt = {
      tracking_id: trackingId,
      status: "MOCK_COMPLETE",
      is_mock: true,
      submitted_to: "MOCK",
      human_note: "MOCK — nothing was submitted to any federal system.",
      received_at: receivedAt,
    };

    this.records.set(trackingId, {
      tracking_id: trackingId,
      status: "MOCK_COMPLETE",
      is_mock: true,
      checked_at: receivedAt,
    });

    return receipt;
  }

  /**
   * Return the in-memory mock status for a previously-issued tracking id. Never
   * polls a real endpoint; unknown ids resolve to a labeled `RECEIVED` mock so the
   * demo stays honest and offline (spec §7).
   */
  async status(trackingId: string): Promise<SubmissionStatus> {
    const existing = this.records.get(trackingId);
    if (existing) return { ...existing, checked_at: this.now() };
    return {
      tracking_id: trackingId,
      status: "RECEIVED",
      is_mock: true,
      checked_at: this.now(),
    };
  }
}

// ---------------------------------------------------------------------------
// selectTransport — mock only; everything else throws
// ---------------------------------------------------------------------------

/**
 * Select the transport for `kind`. Returns a fresh {@link MockTransport} for
 * `"mock"`. For `"sandbox"` / `"live"` it throws {@link TransportNotAvailableError}
 * — G6 ships no non-mock transport (spec §6, FR-5).
 *
 * Defense-in-depth: if a config is passed for a non-mock kind, its endpoint is run
 * through {@link assertNonProductionEndpoint} FIRST, so a production URL is refused
 * (with {@link ProductionEndpointRefusedError}) even in this not-implemented branch
 * — the guard fires before the "not available" error.
 */
export function selectTransport(
  kind: TransportKind,
  cfg?: OrgS2SConfig | null,
): SubmissionTransport {
  if (kind === "mock") return new MockTransport();

  // Non-mock: refuse. Run the endpoint guard first (defense-in-depth) so a
  // production URL is refused specifically, then report "not available".
  if (cfg) assertNonProductionEndpoint(cfg.endpointUrl);
  throw new TransportNotAvailableError(
    `Transport ${JSON.stringify(kind)} is not available in G6: no non-mock transport is shipped. ` +
      `Only the hermetic mock transport exists (spec §6, FR-5).`,
  );
}
