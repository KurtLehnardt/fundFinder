# ELG-03 — Screening engine integration findings

End-to-end / integration validation of the ELG-01 screening engine
(`lib/eligibility/screen.ts`) against the **real Canon rules**: the
per-opportunity `model_inferred` rows in Supabase (`eligibility_rules`) plus the
code-level universal overlay (`lib/canon/universalRules.ts`), evaluated over a
bounded, **READ-ONLY** sample of real opportunities. No writes. No LLM.

Test file: `lib/eligibility/__tests__/screen.integration.test.ts`

## What was proven (the two non-negotiable invariants)

- **(1) ZERO false exclusions** — no sampled real opportunity, against any test
  profile, landed in bucket `excluded`. **CONFIRMED.**
- **(2) R8.4 across the real rule set** — no per-opportunity `model_inferred`
  rule ever appeared in `failed_rules`; `failed_rules` was empty for every
  determination. **CONFIRMED.** (Real rows are prose with no structured
  predicate, so — mapped to predicate-less `ScreeningRule`s with
  `_origin: "per_opp"` — they are advisory and can never gate a bucket.)

Every determination additionally round-tripped through
`EligibilityDeterminationSchema.parse(...)` without throwing.

## Live run (with `FUNDFINDER_DB_PASSWORD` sourced)

Corpus: `aws-0-us-west-2.pooler.supabase.com`, READ-ONLY.

| Metric | Value |
| --- | --- |
| Sample source | rule-bearing opportunities (`id in (select opportunity_id from eligibility_rules)`) |
| Opportunities sampled (N) | 40 |
| ...with >= 1 eligibility rule | 40 / 40 |
| Total `eligibility_rules` rows seen | 63 |
| ...`model_inferred = true` | 63 / 63 |
| Rule provenances seen | `model_inferred` (only) |
| Rule categories seen | entity_type, geography, other, program_specific, registration |
| Profiles screened per opportunity | 4 (minimal, fuller-eligible, no-SAM, SBIR-violator) |
| Determinations produced | 160 (40 opps × 4 profiles) |

### Bucket distribution (160 determinations)

| bucket | count |
| --- | --- |
| eligible | 80 |
| conditionally_eligible | 80 |
| unknown | 0 |
| **excluded** | **0** |

Interpretation: the two profiles with `sam_registered = true` (fuller-eligible,
SBIR-violator) screen `eligible` across all 40 opps; the two without an active
SAM registration (minimal → unknown SAM, no-SAM → false) screen
`conditionally_eligible` (the universal SAM.gov gate becomes a `required_step`
with a lead time — never an exclusion). No SBIR/STTR opportunities were in this
sample (`unknown = 0`; the "SBIR-violator" profile therefore never triggered the
authoritative-but-unreviewed SBIR size/ownership gates on these opps). All 63
real per-opportunity rules are `model_inferred` prose and were correctly treated
as advisory (skipped) — none reached `failed_rules` or `unknown_rules`.

## Guard behaviour (CI safety)

- **Without the secret** (`env -u FUNDFINDER_DB_PASSWORD`): the suite **SKIPS**
  (node:test `skip` with a printed reason), it does **not** fail — exit code `0`,
  `skipped 1`.
- **On DB unreachable**: a short-timeout (`select 1`, 8s) connectivity probe is
  wrapped in try/catch; on failure the test logs a diagnostic and skips
  (`t.skip`), never fails.
- **With the secret**: live assertions run — exit code `0`, `pass 1`.

## Fixture edge cases added (additive; no existing assertion weakened)

Appended to `lib/eligibility/__tests__/screen.test.ts`:

1. DB-shaped per-opp rule (`model_inferred`, no predicate, `_origin: per_opp`) is
   advisory — never gates, appears in neither `failed_rules` nor `unknown_rules`.
2. A whole SET of predicate-less `model_inferred` rules never excludes (mirrors
   the real corpus shape).
3. `entity_type_not_in` — reviewed disallow match → `excluded`; miss → `eligible`
   (previously-untested predicate branch).
4. `max_employees` boundary — count == max passes (`<=`); count == max+1
   (reviewed) → `excluded`.
5. `geography_in` designation — reviewed mismatch → `excluded`; case-insensitive
   match → `eligible`; free-text-only / absent designation → `unknown`.
6. SBIR opp + predicate-less `model_inferred` rules + unknown ownership →
   `unknown` (universal SBIR ownership gate), `failed_rules` empty.

## Verification summary

- `npx tsc --noEmit` — clean (exit 0).
- `npx tsx --test lib/eligibility/__tests__/*.test.ts` (secret sourced) —
  25 pass, 0 fail.
- Integration test with secret — pass (exit 0). Without secret — skip (exit 0).
- No R8.4 violations found on real data. No DB writes performed (READ-ONLY).
