# ELG-01 — R8 eligibility screening engine (three buckets)

**Team:** Eligibility
**Release slice:** 2
**Depends on:** CAN-04 (per-opp `eligibility_rules` + `universalRules.ts` overlay), CON-01 (EligibilityDetermination, CompanyProfile)
**Blocks:** FE-04 (three-bucket display), ELG-02 (freshness integration)

## Context
R8 is the correctness floor: ranking is worthless on top of a set the company can't apply to. Screen
each candidate opportunity against the Canon's structured rules → an `EligibilityDetermination` (CON-01).
This is **pure logic** (no LLM) — evaluate structured rules against the `CompanyProfile`. The Canon
inputs already exist: 946 per-opp `model_inferred` rules (`lib/canon/rules.ts` store I/O) + the
universal overlay (`lib/canon/universalRules.ts`, SAM/UEI conditional + SBIR gates).

## Files in scope
- CREATE `scaffold/lib/eligibility/screen.ts` + `scaffold/lib/eligibility/__tests__/screen.test.ts`
- Read-only: `lib/canon/rules.ts`, `lib/canon/universalRules.ts`, `lib/contracts/eligibilityDetermination.ts`, `lib/contracts/companyProfile.ts`

## Definition of done
- [ ] `screen(profile, opportunity, rules) → EligibilityDetermination` producing the three buckets:
      **eligible** / **conditionally_eligible** (with `required_steps[]` + lead time) / **excluded**
      (with reason + rule, kept in a collapsed list — **never silently dropped**, R8.2).
- [ ] **R8.4 enforced: a `model_inferred` rule alone never yields `excluded`** (may make it
      `conditionally_eligible` or annotate — the CON-01 schema already refuses model-inferred-only
      exclusion; assert it here too). The universal overlay's registration gate → **conditional** (a
      step), never exclusion; SBIR size/ownership gates apply only to SBIR/STTR opps
      (`universalRulesForOpportunity`) and, being authoritative-but-unreviewed, inform but don't
      hard-exclude until human review.
- [ ] **Unknown gates render as unknown** (R8.2) — a gate the profile/rules don't settle is never
      guessed eligible or ineligible; `CompanyProfile` provenance drives this (a `model_inferred`
      profile fact is never sufficient to exclude).
- [ ] Exhaustive unit tests (pure logic) over the golden set's eligibility cases.

## Out of scope
Freshness/status integration (ELG-02, uses CAN-05), the UI (FE-04), ranking/synthesis (the analysis
pass), rule extraction (CAN-04).

## Test plan
Unit tests over the frozen golden set's eligibility cases: nonprofit → excluded (cited rule);
foreign-owned → excluded; no-SAM → conditional (step); model_inferred-only → NOT excluded; unknown
gate → unknown. **Zero false exclusions** is the primary metric (EVL-03).

## Escalate if (§8.3)
- Rules conflict for one opportunity, or an exclusion would rest on an uncited/model_inferred rule.
