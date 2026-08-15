# INT-01 — R1 pre-search interview: question generation

**Team:** Interview
**Release slice:** 2 (R1 — highest priority)
**Depends on:** CON-01 (CompanyProfile), CON-04 (prompt registry), CAN-04 (the eligibility gates to ask about)
**Blocks:** INT-02 (enrichment merge), FE-03 (interview UI)

## Context
The v2 core insight (R1): ask cheap, routing-relevant questions BEFORE the expensive search. On
submit of the description, a small/fast model produces **3–5 questions whose answers change which
programs match** — and it must **prioritize questions that resolve hard R8 eligibility gates over
ranking-refinement questions** ("Do you have a current SAM.gov registration + UEI?" before "which EHR
vendor?"). Target < 5s. Structured answers (multiple choice + an other/free-text escape where the
answer space is enumerable). This is question GENERATION only.

## Files in scope
- CREATE `scaffold/lib/interview/generateQuestions.ts`
- Register the interview prompt in the CON-04 registry (`scaffold/lib/prompts/`).
- LLM: **OpenAI `gpt-4o-mini`** (the cheap/fast model, funded) — NOT the analysis model (H2/§3 routing).

## Definition of done
- [ ] `generateQuestions(description) → InterviewQuestion[]` (3–5), each **routing-relevant** and
      mapped to a concrete branch (agency / program family / eligibility gate).
- [ ] **Gate-first:** questions resolving R8 gates (entity type, >50% US ownership, employee count,
      SAM/UEI registration) are prioritized over ranking-refinement. Reference the R8.1 gate classes.
- [ ] Structured answers: multiple-choice with an `other`/free-text escape wherever the answer space
      is enumerable (entity type, agencies, TRL, EHR vendor). Never re-ask something the description states.
- [ ] Prompt lives in the registry (versioned/hashed, CON-04). Median latency < 5s (measure + report).
- [ ] `tsc` green.

## Out of scope
The answer→enriched-description merge (INT-02), the interview UI (FE-03), the search/analysis, the
"search anyway" skip (UI concern), R3 enhance modal.

## Test plan
For 3–4 varied descriptions (a clear for-profit, a vague one-liner, an ambiguous-sector one), assert
questions are gate-first + routing-relevant + structured, and none re-ask stated facts; measure latency.

## Escalate if
- The description already contains everything needed to route (produce fewer/zero questions rather than manufacturing them).
