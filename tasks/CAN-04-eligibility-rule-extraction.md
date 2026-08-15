# CAN-04 — Structured eligibility-rule extraction with citations

**Team:** Canon
**Release slice:** 1
**Depends on:** CAN-01 (store + `eligibility_rules` table)
**Blocks:** ELG-01 (the R8 screening engine)

## Context
R8 (eligibility) is the correctness floor and is **greenfield** — the only screening in v1 is a
stub `ruleGate` (`scaffold/lib/match.ts:23-31`: an SBIR employee cap + a universities-only regex).
Per R8.4, eligibility rules must be **structured data in the Canon, each with a citation**, and a
model-extracted rule is `model_inferred` until reviewed — it must **never gate exclusion** while
unreviewed. "A founder told they're ineligible on a hallucinated rule is the worst failure this
product can produce."

## Files in scope
- CREATE `scripts/canon/extract-rules.mjs` (per-opportunity rule extraction).
- CREATE `scaffold/lib/canon/rules.ts` (typed to CON-01 `EligibilityDetermination` inputs).
- Writes to the `eligibility_rules` table (CAN-01).

## Definition of done
- [ ] For each opportunity, extract structured rules across the R8.1 classes: entity type;
      size/ownership (SBA standards, SBIR small-business/US-ownership/employee-count); registration
      prereqs (SAM.gov/UEI, SBIR registry, eRA Commons); geography/jurisdiction; program-specific
      gates (Phase-I-before-II, cost-share).
- [ ] **Every rule carries a citation** (source URL + section/quote). A rule with no traceable
      source is dropped or flagged unknown — never stored as fact.
- [ ] Model-extracted rules stored with `model_inferred = true`; documented contract that ELG-01
      **must not exclude** on a `model_inferred` rule (R8.4).
- [ ] Unknown gates are representable as unknown (not a guess in either direction).

## Out of scope
The screening engine + 3-bucket logic (ELG-01), UI (FE-04), the human review workflow that
promotes `model_inferred`→reviewed (later slice), freshness (CAN-05).

## Test plan
Extraction yields cited rules for a sample of grants.gov + SBIR programs; `model_inferred` set;
a rule lacking a citation is rejected; unit test that unknown gates round-trip as unknown.

## Escalate if (standing §8.3)
- A rule cannot be traced to a citable source, or two sources conflict → **stop, report, do not
  synthesize a rule.** Mark unknown rather than guess.
