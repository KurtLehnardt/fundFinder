# INT-02 — answer → enriched-description merge

**Team:** Interview
**Release slice:** R1 (pre-search interview)
**Depends on:** INT-01 (R1 question generation), CON-01 (§3 contracts)
**Blocks:** FE-03 (interview UI + request-path wiring)

## Context
INT-01 (`scaffold/lib/interview/generateQuestions.ts`) turns a founder's company
description into 3–5 gate-first, routing-relevant `InterviewQuestion`s, each carrying a
`maps_to_profile_field` naming the `CompanyProfile` field its answer enriches. INT-02 is the
counterpart: take the founder's original description plus the `InterviewAnswer`s they gave to
those questions and produce an **enriched `CompanyProfile`** (structured fields populated with
correct provenance) and an **enriched description string** that feeds the expensive search. The
merge is joined by `question_id === InterviewQuestion.id` so each answer can read its target
field. Provenance is the whole point of the product (§11): a founder-supplied answer is
`user_stated`; the merge must never fabricate a fact the founder did not give, and must never let
an inferred value clobber a `user_stated`/`verified` fact.

## Files in scope
- `scaffold/lib/interview/mergeAnswers.ts` (NEW — the merge module)
- `scaffold/lib/interview/__tests__/mergeAnswers.test.ts` (NEW — exhaustive unit tests)
- `tasks/INT-02-answer-merge.md` (this file)

No other files may be modified. Import types from `../contracts` and
`./generateQuestions` — do not edit them.

## Definition of done
- [ ] `mergeAnswers.ts` exports a pure function that takes a base `CompanyProfile` (carrying at
      least `id` + `raw_text`), the `InterviewQuestion[]` from INT-01, and the founder's
      `InterviewAnswer[]`, and returns `{ profile: CompanyProfile; enrichedDescription: string }`.
- [ ] Answers are joined to questions by `question_id === question.id`; the target field is read
      from that question's `maps_to_profile_field`.
- [ ] An **answered** question whose `maps_to_profile_field` names a real `CompanyProfile`
      structured field sets that field with provenance carried from the answer (a normal typed
      answer → `user_stated`, confidence from the answer). The output profile round-trips through
      `CompanyProfileSchema.parse` without throwing.
- [ ] Field type coercion is conservative and fabrication-free: string fields set directly; array
      fields (`geography_designations`, `naics_codes`, `certifications`, `expanded_terms`) become
      arrays; number fields (`employee_count`, `trl`) only set on a valid in-range parse; boolean
      fields (`us_owned`, `sam_registered`, `prior_federal_funding`) only set on a recognized
      yes/no token; enum fields (`entity_type`, `certifications`) only set when the value is a
      member of the enum. Anything that cannot be coerced without inventing a fact is **left
      unset** (still recorded in `interview_answers` + folded into the description).
- [ ] **Never-overwrite guard (§11):** an incoming `model_inferred` answer may fill an empty field
      or replace a `model_inferred` field, but must NOT overwrite an existing `user_stated` or
      `verified` field. An incoming `user_stated`/`verified` answer may supersede.
- [ ] **Skipped** answers (`skipped === true`) and questions with **no matching answer** leave all
      structured fields unchanged.
- [ ] The free-text `other` escape hatch is handled: the free-text string is preserved as the
      value for string / string-array fields; for enum fields an `other` value is NOT forced into
      the enum (field left unset), but the answer is still recorded and folded into the
      description.
- [ ] Every non-skipped answer is recorded once in `profile.interview_answers` (merged/deduped by
      `question_id`; re-merging is idempotent).
- [ ] `enrichedDescription` is **deterministic** (no LLM): the founder's original `raw_text.value`
      is preserved verbatim at the front, followed by a compact factual rendering of each answered
      Q/A pair. It introduces **no** facts beyond the original text and the founder's answers.
- [ ] Exhaustive unit tests cover every bullet above and pass under `npm test`.
- [ ] `npx tsc --noEmit` clean; `npm test` green.

## Out of scope
- **No request-path wiring** — do not touch `IntakeForm.tsx`, `SearchProgress.tsx`,
  `app/api/match/route.ts`, or `lib/match.ts` (a parallel task owns these). Integration into the
  request flow is FE-03.
- No new feature flag (flags gate UI surfaces; this is pure logic). Do not edit `lib/flags/*`.
- No changes to `generateQuestions.ts` or any `lib/contracts/*` file.
- No R3 "enhance description" rewrite behavior; no verification (R2); no LLM prose smoothing.
- No network calls. The module must be synchronous and hermetic.

## Test plan
Node's built-in runner via `tsx --test` (matches the repo: `npm test` →
`tsx --test lib/**/__tests__/**/*.test.ts`; tests use `node:test` + `node:assert/strict`, see
`scaffold/lib/contracts/__tests__/companyProfile.test.ts`). §8.4 unit-test type. Cases:
1. answered eligibility_gate → mapped field set, provenance `user_stated`.
2. skipped answer → field unchanged.
3. no matching answer for a question → field unchanged.
4. free-text `other` on a string field → value preserved; on an enum field → field unset but
   answer recorded.
5. no fabrication → an unanswered field is never populated; enriched description contains only
   original text + answered content.
6. never-overwrite → existing `user_stated`/`verified` field not clobbered by a `model_inferred`
   answer; a `user_stated` answer supersedes a `model_inferred` field.
7. `maps_to_profile_field === null` → answer recorded + folded into description, no structured
   field set.
8. unknown/nonexistent target field name → ignored safely, no throw.
9. number/boolean coercion: valid parse sets field; invalid parse leaves it unset.
10. output profile round-trips `CompanyProfileSchema.parse`.
11. idempotency: merging the same answers twice yields the same profile + description.

## Escalate if
- The merge cannot satisfy both "populate structured fields" and "never fabricate / never
  overwrite a user-stated fact" without a policy call not covered above.
- Any definition-of-done item would require editing a file outside "Files in scope" (esp. the four
  protected files) — STOP and report rather than touching them.
