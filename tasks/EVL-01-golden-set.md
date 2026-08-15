# EVL-01 — Golden set (rated eval corpus)

**Team:** Evals
**Release slice:** 1 (starts day one — long pole)
**Depends on:** none
**Blocks:** R1, R4b, and R8 acceptance (§5.4, §9)

## Context
No rated eval set exists. v1 has 5 unrated demo cases in `scaffold/lib/testCases.ts`. §5.4 requires
25–40 rated company descriptions, including eligibility cases, frozen and versioned. Nothing
downstream (interview lift, latency-vs-quality, false-exclusion rate) can be *measured* without it.

## Files in scope
- CREATE `evals/golden-set.jsonl` (one description per line, structured).
- CREATE `evals/rubric.md` (TACA rating rubric) and `evals/README.md` (how to run/version).
- May reuse the 5 v1 cases as a starting subset (re-rated).

## Definition of done
- [ ] 25–40 synthetic descriptions spanning sectors (health IT, defense hardware, climate, biotech,
      education, dual-use software), stages (pre-revenue→Series A), entity types, and quality levels
      (one-line vague → detailed), including deliberately hard cases (matches nothing / matches a
      dozen equally / ambiguous sector).
- [ ] **≥25% are eligibility cases** with a clear categorical answer (nonprofit that can't take SBIR,
      foreign-owned entity, no SAM registration vs. a NOFO that requires one, Phase-II topic with no
      Phase I).
- [ ] Each entry records: should-appear programs, should-NOT-appear programs, correct eligibility
      buckets, and a TACA note (transparency/accuracy/calibration/alignment).
- [ ] Frozen + versioned (content hash / commit tag recorded).
- [ ] A **named human reviewer** is assigned to set the first reference (§5.4 `[DECIDE]`).

## Out of scope
The eval *harness/runner* (CON-05) and CI regression gate (EVL-02). Model-graded automation. Any
real user submissions (consent-gated; none exist yet — §5.3).

## Test plan
Schema-valid JSONL; a second reviewer sanity-checks a sample; version tag committed.

## Escalate if
- No human reviewer can be named (§5.4 `[DECIDE]`) — a golden set no human has rated cannot set the
  reference the first time; regression-only model grading is insufficient for the initial baseline.
