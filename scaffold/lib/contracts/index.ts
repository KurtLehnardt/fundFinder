/**
 * §3 — Shared typed contracts (barrel).
 *
 * The single integration surface every feature team imports from. Each contract
 * is a zod schema + inferred TS type. Runtime validation via the `*Schema`
 * exports; static typing via the inferred type exports.
 *
 * §3 → file map:
 *   §3.1  CompanyProfile          → companyProfile.ts
 *   §3.2  ProgressEvent           → progressEvent.ts
 *   §3.3  VerificationItem        → verificationItem.ts
 *   §3.4  Opportunity             → opportunity.ts
 *   §3.5  EligibilityDetermination→ eligibilityDetermination.ts
 *   §3.6  OpportunityMap          → opportunityMap.ts
 *   §3.7  Entitlements            → entitlements.ts
 *   §3.8  Design tokens           → OUT OF SCOPE for CON-01 (CON-02)
 *   §3.9  Model routing table     → modelRouting.ts
 *   §3.10 RunBudget               → runBudget.ts
 *   §3.11 AnalyticsEvent          → analyticsEvent.ts
 *   §3.12 Run                     → run.ts
 *
 * Shared primitives (provenance, citations, timestamps) → primitives.ts
 */

export * from "./primitives";
export * from "./companyProfile";
export * from "./progressEvent";
export * from "./verificationItem";
export * from "./opportunity";
export * from "./eligibilityDetermination";
export * from "./opportunityMap";
export * from "./entitlements";
export * from "./modelRouting";
export * from "./runBudget";
export * from "./analyticsEvent";
export * from "./run";
