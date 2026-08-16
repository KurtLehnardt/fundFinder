/**
 * Public entry point for the WS-G / G6 S2S integration layer. Import from
 * `@/lib/s2s` (or `../s2s`), not from the individual files in this directory.
 *
 * G6 CONSUMES the shared `AssembledPackage` (spec §0.1) and adds only the
 * mapping / transport / gate seam — it never assembles a package. This barrel
 * re-exports the public core-contract surface (T-A). Later tasks extend it:
 *   - T-B: `xml.ts` (`toGrantApplicationXml`, `toSoapEnvelope`)
 *   - T-C: `transport.ts` / `authorize.ts` / `config.ts` / `client.ts`
 *
 * Everything here is deterministic and honest by construction: no receipt is
 * ever non-mock, no fact is ever fabricated (see `types.ts` / `meta.ts`).
 */

// Core contracts (schemas + inferred types).
export {
  AorAuthorizationSchema,
  SubmissionReceiptSchema,
  SubmissionStatusSchema,
  SubmissionStatusValueSchema,
  SubmissionMetaSchema,
  SUBMISSION_STATUS_VALUES,
} from "./types";
export type {
  TransportKind,
  AorAuthorization,
  SubmissionReceipt,
  SubmissionStatus,
  SubmissionStatusValue,
  SubmissionMeta,
  LegalGate,
  AssembledPackage,
} from "./types";

// Pure Opportunity → SubmissionMeta derivation.
export { toSubmissionMeta } from "./meta";

// Deterministic, gap-preserving AssembledPackage → grants.gov application-XML +
// SOAP-envelope mapping (T-B). UNVERIFIED / re-verify-required, mock-only.
export { SCHEMA_VERSION, toGrantApplicationXml, toSoapEnvelope } from "./xml";

// Pluggable transport + the SAFETY CORE guards (T-C). Mock is the ONLY wired
// transport; sandbox/live throw. `assertNonProductionEndpoint` is default-deny.
export {
  MockTransport,
  selectTransport,
  assertNonProductionEndpoint,
  TransportNotAvailableError,
  ProductionEndpointRefusedError,
} from "./transport";
export type { SubmissionTransport, MockTransportOptions } from "./transport";

// Per-org S2S config model (T-C): org-supplied, server-only, sandbox-only,
// null-by-default, cert REFERENCE not secret.
export { loadOrgS2SConfig, ORG_S2S_ENV_VARS } from "./config";
export type { OrgS2SConfig } from "./config";

// The AOR-authorization gate (T-C): a scoped attestation check, not auth.
export { assertSubmissionAuthorized, SubmissionNotAuthorizedError } from "./authorize";

// The orchestrating, mock-only submission client (T-C).
export { submitPackage } from "./client";
export type { SubmitOptions } from "./client";
