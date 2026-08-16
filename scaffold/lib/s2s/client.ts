import type { FlagName } from "../flags/registry";
import { isFlagEnabled } from "../flags/accessor";
import type {
  AorAuthorization,
  AssembledPackage,
  LegalGate,
  SubmissionMeta,
  SubmissionReceipt,
  TransportKind,
} from "./types";
import { assertSubmissionAuthorized } from "./authorize";
import { toGrantApplicationXml, toSoapEnvelope } from "./xml";
import { selectTransport } from "./transport";

/**
 * WS-G / G6 · T-C — the orchestrating submission client: the single entry point
 * the components team wires behind the `g6_s2s_submission` flag (spec §0.3).
 *
 * `submitPackage` runs a FIXED chain, each step throwing on failure, in an order
 * chosen so no honesty guarantee can be skipped (spec §8.3, §10):
 *   (1) the flag gate — `g6_s2s_submission` is OFF by default, so nothing runs
 *       without an explicit opt-in;
 *   (2) the AOR gate — a recorded, scoped human attestation is required;
 *   (3) the deterministic XML + SOAP mapping;
 *   (4) transport selection + submit — MOCK ONLY. `selectTransport("sandbox"|"live")`
 *       throws, so there is NO code path by which this reaches a non-mock transport
 *       (HR-4). The default kind is `"mock"`.
 *
 * Every receipt this can return is a MOCK receipt (`is_mock: true`,
 * `submitted_to: "MOCK"`) — nothing is ever submitted to any federal system.
 */

/** Options for {@link submitPackage}. */
export interface SubmitOptions {
  /** Which transport to use. Defaults to `"mock"` — the only wired transport. */
  transportKind?: TransportKind;
  /** The recorded per-package AOR attestation (or `null` — which the gate refuses). */
  authorization: AorAuthorization | null;
  /**
   * The server-only legal-review gate. Only consulted for a non-mock transport
   * (which G6 never ships). Defaults to `{ legalReviewApproved: false }`.
   */
  legalGate?: LegalGate;
  /**
   * Test/config seam for the flag accessor — an explicit override map keyed by flag
   * name that takes precedence over `process.env`. Most callers omit this and rely
   * on the env var alone.
   */
  configOverride?: Partial<Record<FlagName, string | undefined>>;
}

/**
 * Run the full submission chain for an assembled package and return a (mock)
 * {@link SubmissionReceipt}. See the module doc block for the fixed step order and
 * its honesty rationale.
 *
 * With the default (mock) transport this is fully exercisable WITHOUT any
 * credentials. It throws when the flag is OFF, when the AOR gate refuses, or when a
 * non-mock transport is requested (there is none) — never reaching a live path.
 */
export async function submitPackage(
  assembled: AssembledPackage,
  meta: SubmissionMeta,
  opts: SubmitOptions,
): Promise<SubmissionReceipt> {
  const kind: TransportKind = opts.transportKind ?? "mock";

  // (1) Flag gate — OFF by default. Nothing runs without an explicit opt-in.
  if (!isFlagEnabled("g6_s2s_submission", opts.configOverride)) {
    throw new Error(
      "g6_s2s_submission is OFF: S2S submission is a default-OFF, demo-only capability and cannot run.",
    );
  }

  // (2) AOR gate — a recorded, scoped human attestation is required (throws otherwise).
  assertSubmissionAuthorized(
    assembled,
    meta,
    opts.authorization,
    kind,
    opts.legalGate ?? { legalReviewApproved: false },
  );

  // (3) Deterministic XML + SOAP mapping (pure; gap-preserving; mock-only shape).
  const xml = toGrantApplicationXml(assembled, meta);
  const envelope = toSoapEnvelope(xml, meta);

  // (4) Transport select + submit. MOCK ONLY — `selectTransport("sandbox"|"live")`
  // throws, so this never reaches a non-mock transport (HR-4).
  const transport = selectTransport(kind);
  return transport.submit(envelope);
}
