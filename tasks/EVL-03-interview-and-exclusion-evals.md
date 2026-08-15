# EVL-03 — Blind interview + false-exclusion evals

**Team:** Evals
**Release slice:** 2 acceptance gate (cross-cutting; measures the §9 R1 and R8 acceptance criteria)
**Depends on:** EVL-01 (frozen `evals/golden-set.jsonl` v1.0, `evals/rubric.md`), INT-01
(`scaffold/lib/interview/generateQuestions.ts`), ELG-01 (`scaffold/lib/eligibility/screen.ts`,
`scaffold/lib/canon/universalRules.ts`)
**Blocks:** R1 acceptance ("questions resolving R8 gates prioritized over ranking-refinement
questions"), R8 acceptance ("zero categorically ineligible opportunities... on the golden set's
eligibility cases", "no exclusion is ever driven by an unreviewed `model_inferred` rule")

## Context

Two automated eval harnesses are missing over the FROZEN golden set (`evals/golden-set.jsonl`,
31 entries, `sha256:f79c6e57…cb04e4`, `evals/README.md`): (a) does INT-01's `generateQuestions()`
produce gate-first, routing-relevant, structured questions that never re-ask a fact already stated;
(b) does ELG-01's `screen()` ever falsely exclude an opportunity on the golden set's 14 eligibility
cases, and does the R8.4 invariant (`model_inferred` never gates exclusion; unknown gates render
`unknown`) hold end to end. `scaffold/lib/eligibility/__tests__/screen.test.ts` already sweeps this
invariant exhaustively with *synthetic* fixtures — EVL-03's false-exclusion eval is the first thing
to run it against the actual frozen golden-set entries, which is what §9's R8 acceptance is graded
against.

## Files in scope

- CREATE `evals/interview-eval.mjs` (or `.ts`, run via `node --import tsx`)
- CREATE `evals/false-exclusion-eval.mjs` (same)
- CREATE `evals/EVL-03-results.md` — short results writeup (pass rates, failing entries, verdict)
- READ ONLY (do not modify): `evals/golden-set.jsonl`, `evals/rubric.md`,
  `scaffold/lib/interview/generateQuestions.ts`, `scaffold/lib/eligibility/screen.ts`,
  `scaffold/lib/canon/universalRules.ts`, `scaffold/lib/contracts/*.ts`,
  `scaffold/lib/eligibility/__tests__/screen.test.ts` (reference for fixture-building patterns)

Do not edit `screen.ts`, `generateQuestions.ts`, `universalRules.ts`, or any `contracts/*.ts` file —
those are owned by Team Eligibility / Team Interview / Team Contracts (§8.1 "one team owns each
file"). If a bug in those files blocks the eval, report it in the results doc; do not fix it here.

## Definition of done

**(a) `evals/interview-eval.mjs` — blind interview quality eval**
- [ ] For every entry in `evals/golden-set.jsonl`, calls `generateQuestions(entry.description)`
      live (funded model `gpt-4o-mini`, per `INTERVIEW_MODEL` in `generateQuestions.ts` — do not
      override the model).
- [ ] **Gate-first (code-level check, no judge needed):** if the entry's `entity_type` is
      `unknown`, or the description does not state a SAM/UEI registration status, employee count,
      or US-ownership fact, assert the first returned question (lowest `priority`) has
      `routing_target === "eligibility_gate"` when any such question was generated at all.
      `generateQuestions.ts` already enforces gate-first ordering as an invariant (see its
      `TARGET_RANK`/`GATE_RANK` sort) — this check catches a regression, it does not re-implement
      the sort.
- [ ] **Routing-relevant + structured (code-level checks):** every question's `routing_target` is
      one of the three enum values; every `single_select`/`multi_select` question has ≥1 option
      plus an `other`/free-text escape (`allow_free_text === true`); every `free_text` question has
      no options.
- [ ] **Never re-asks a stated fact — the one check that needs judgment.** Use `gpt-4o-mini` as an
      LLM judge: given the entry's `description` and the generated question list, does any question
      ask for a fact the description already states plainly (e.g. asking entity type when the
      description says "nonprofit", or asking about SAM registration when the description already
      says "not yet registered in SAM.gov")? Follow `evals/rubric.md`'s spirit — score against what
      a well-informed advisor would flag, not exact wording.
- [ ] Also let the judge give a holistic 1–5 on "questions are routing-relevant and worth a
      founder's time" per entry (catches technically-compliant-but-useless questions the code
      checks can't).
- [ ] Report: overall pass rate (entries with zero violations across all checks), and for every
      failing entry — the entry id, which check(s) failed, and why.
- [ ] Handle `InterviewGenerationError` (timeout, malformed model output) per entry without
      aborting the whole run — record it as a failure for that entry, keep going.

**(b) `evals/false-exclusion-eval.mjs` — false-exclusion eval**
- [ ] Restrict to the golden-set entries whose `eligibility_bucket_expectations` contains at least
      one non-`eligible` bucket (the ~14 eligibility cases documented in `evals/README.md` §"Eligibility
      cases").
- [ ] For each `(entry, program) → {bucket, rule, reason}` pair, build a `CompanyProfile` fixture
      from the entry (map the golden `entity_type` string to the `CompanyProfile` `EntityType` enum
      — note the golden set's vocabulary differs slightly, e.g. `institution_of_higher_education` →
      `higher_education`, `foreign_owned_entity` → `for_profit_small_business` + `us_owned: false`;
      document the mapping table in the script) and a `ScreeningRule` that encodes the stated `rule`
      text using one of `screen.ts`'s existing `RulePredicate` kinds (`entity_type_in`/
      `entity_type_not_in`, `us_ownership_required`, `max_employees`, `sam_registration_required`,
      `prior_award_required`, `certification_required`, `geography_in`). Where the universal overlay
      already covers the gate (SAM/UEI, SBIR ownership, SBIR size), don't hand-build a rule for it —
      call `screen()` with an SBIR/STTR-flavored `opp()` (per `universalRulesForOpportunity`) and let
      the overlay apply, same as `screen.test.ts` does.
- [ ] Where an entry's rule genuinely cannot be mapped to an existing predicate without inventing a
      new one, **skip it and say so explicitly** in the results doc with the entry id and reason —
      do not force a wrong mapping and do not add a new `RulePredicate` kind (out of scope; that's
      a `screen.ts` change).
- [ ] Model the golden entry's expected `excluded` cases with a `verified`-provenance rule (the
      golden set's answer key represents a human-curated, citable determination — the equivalent of
      a reviewed rule) and assert `screen()` actually returns `excluded` for those (sanity check —
      confirms the harness triggers real exclusions, not just an eval that can never fail).
- [ ] **Primary metric — zero false exclusions:** for every case whose golden-set expected bucket is
      `eligible`, `conditionally_eligible`, or `unknown`, assert `screen()` never returns `excluded`.
      Report any violation with entry id, program, expected vs. actual bucket, and the rule involved.
- [ ] **R8.4 check:** for each case that legitimately exercises a categorical gate, re-run with the
      same rule downgraded to `provenance: "model_inferred"` and assert the bucket is never
      `excluded` (must be `unknown`).
- [ ] **Unknown-gate check:** for cases where the golden entry's expected bucket is `unknown` (gate
      genuinely undetermined), assert `screen()` returns `unknown`, not a guess in either direction.
- [ ] Pure logic, no LLM calls, no live DB/Canon — same style as `screen.test.ts`.
- [ ] Report a pass/fail table per case plus an overall verdict: any false exclusion is a build-
      blocking failure for R8 acceptance.

**Both**
- [ ] `evals/EVL-03-results.md` summarizes both harnesses: how to run them (`node --import tsx
      evals/interview-eval.mjs` / `evals/false-exclusion-eval.mjs`, from repo root), pass rates,
      every failing/skipped entry with a one-line reason, and the golden-set hash the run was
      executed against (§5.4 "every run executed under test records which golden-set version it ran
      against").
- [ ] `cd scaffold && npx tsc --noEmit` and `npm test` still pass unmodified (the eval scripts live
      outside `scaffold/`, so they must not be swept into `scaffold`'s own test glob or break its
      typecheck).

## Out of scope

- Modifying `evals/golden-set.jsonl` (frozen) or `evals/rubric.md`.
- Modifying `screen.ts`, `generateQuestions.ts`, `universalRules.ts`, or any `contracts/*.ts` file.
- The CI regression gate / harness-runner infrastructure (that's a separate CON-05/EVL-02 concern) —
  this task delivers the two scripts and a results doc, not a wired-up CI check.
- The full R1 "with interview vs. without interview" blind lift comparison from §9's R1 acceptance
  criterion — this task scores interview *question quality* in isolation (gate-first, routing-
  relevant, structured, no re-asks), not a full pipeline A/B on match quality.
- R2's verification-triage classifier eval and R3's unsupported-claims eval (separate Team Evals
  measures, §6).
- Any change to `CompanyProfile`, `Opportunity`, or `EligibilityDetermination` schemas — if a golden
  entry can't be represented under the current contracts, skip and report, don't widen the contract.
- Live Canon/DB queries — false-exclusion fixtures are constructed in-script, not pulled from the
  real corpus.

## Test plan

- Run `node --import tsx evals/interview-eval.mjs` and `node --import tsx
  evals/false-exclusion-eval.mjs` from the repo root; both must exit 0 only if their primary
  invariant holds (false-exclusion eval: zero false exclusions; interview eval: report pass rate,
  a nonzero failure count is informative, not necessarily a script failure — document the exit-code
  convention actually used).
- `cd scaffold && npx tsc --noEmit` — clean.
- `cd scaffold && npm test` — all existing unit tests (including `screen.test.ts`'s exhaustive
  false-exclusion sweep) still pass, confirming the harness didn't need to touch the code under test.
- A sample of both scripts' per-entry output is spot-checked by review against `evals/golden-set.jsonl`
  and `evals/rubric.md` directly (the dispatcher does this, not the worker).

## Escalate if

- `OPENAI_API_KEY` is missing/invalid at run time (interview eval cannot run without it).
- The live `sha256` of `evals/golden-set.jsonl` does not match the frozen v1.0 hash recorded in
  `evals/README.md` (`f79c6e57…cb04e4`) — the set has drifted and the eval would be scored against
  the wrong reference.
- A golden-set eligibility case cannot be mapped to an existing `RulePredicate` without inventing a
  new predicate kind — skip and report per "Definition of done," do not modify `screen.ts`.
- `generateQuestions()` or `screen()` appears to have an actual bug (not a harness-construction
  issue) — report it with the failing entry and reproduction, do not patch the owning team's file.
- Any false exclusion is found — this is the eval doing its job, not a task failure, but it is a
  build-blocking finding for R8 acceptance and must be reported prominently in the results doc and
  to the dispatcher, not quietly noted in a checklist.
