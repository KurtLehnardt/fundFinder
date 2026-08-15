# CON-01 — Shared typed contracts module

**Team:** Contracts
**Release slice:** 1 (Contracts + Canon foundation)
**Depends on:** none
**Blocks:** everything (all feature teams)

## Context
v1 has ad-hoc types in `scaffold/lib/types.ts` (`OpportunityMap`, `Match`, `Opportunity`,
`StartupProfile`, `AwardHistory`) with no provenance, no versioning, and none of the §3 contracts
(`ProgressEvent`, `EligibilityDetermination`, `VerificationItem`, `Entitlements`, `RunBudget`,
`AnalyticsEvent`, `Run`, model-routing). These are the integration surface (§3); no feature team
writes code until they land. The existing app (`app/api/match/route.ts` → `lib/match.ts`) must keep
compiling.

## Files in scope
- CREATE `scaffold/lib/contracts/` — one file per contract + `index.ts` barrel:
  `companyProfile.ts` (fields + per-field provenance `user_stated|model_inferred|verified` + confidence),
  `opportunity.ts`, `eligibilityDetermination.ts`, `verificationItem.ts`, `progressEvent.ts`
  (`status` includes `failed`|`timed_out`), `opportunityMap.ts` (formalize + **version** the existing
  shape), `entitlements.ts`, `runBudget.ts`, `analyticsEvent.ts` (schema-level: cannot carry free-text
  description), `run.ts`, `modelRouting.ts`.
- MIGRATE `scaffold/lib/types.ts` to re-export from `contracts/` (keep imports in `lib/match.ts`,
  `lib/claude.ts`, components working).
- CREATE `scaffold/lib/contracts/__tests__/` contract tests.

## Definition of done
- [ ] Every §3 contract exists as a typed schema (zod or equivalent + inferred TS type).
- [ ] `CompanyProfile` provenance is **mandatory** on every field.
- [ ] `ProgressEvent.status` can express `failed` and `timed_out`.
- [ ] `OpportunityMap` carries a version tag.
- [ ] `AnalyticsEvent` type makes it **impossible** to attach description content (compile-time).
- [ ] Contract tests pass (§8.4); `npx tsc --noEmit` clean; existing app still builds.
- [ ] No raw hex / design values here (that's CON-02).

## Out of scope
No feature logic, no UI, no DB schema (CAN-01), no prompt content (CON-04), no analytics *emission*
(PLT-03), no entitlement *enforcement* (PLT-07). Do not change runtime behavior of the v1 pipeline.

## Test plan
Contract tests per schema; a test asserting `AnalyticsEvent` rejects a description field; `tsc`;
confirm `npm run build` (or dev) still succeeds with the migrated `types.ts`.

## Escalate if
- A contract needs a shape §3 does not specify → orchestrator decides + broadcasts.
- The v1 `OpportunityMap`/`Match` output cannot be represented without breaking the live cached
  responses in `data/precomputed.json` (versioning must be additive).
