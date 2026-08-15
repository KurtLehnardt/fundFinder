# ELG-02 — freshness integration for eligibility determinations

**Team:** Eligibility
**Release slice:** 2
**Depends on:** ELG-01 (`lib/eligibility/screen.ts` → `EligibilityDetermination`), CAN-05 (`lib/canon/freshness.ts` `checkFreshness`), CAN-06 (`lib/canon/version.ts` `currentSnapshot`/`checkSyncHealth`)
**Blocks:** FE-04 (three-bucket display shows the freshness caveat)

## Context
§4.5 + CAN-05 / §11 anti-fabrication: an `EligibilityDetermination` (ELG-01) is only as trustworthy
as the Canon data it was screened against. A determination computed against a STALE corpus — or one
whose opportunity's live status could not be re-verified — must be **visibly flagged**, never presented
as if it were current. This task adds a **pure-logic annotator** that decorates a determination (via a
wrapper type) with data-freshness metadata drawn from the CAN-05 / CAN-06 freshness API, so the UI can
render an honest "as of …" line and a plain-language caveat when the data is stale/unverifiable.

This is **pure composition logic — NO LLM, NO new network path.** The annotator consumes freshness
signals that a caller has already fetched (or passes a `FreshnessResult` / `CurrentSnapshotResult` in),
so it stays deterministic and unit-testable. It does **not** call `route.ts`, does **not** wire into
the request path, and does **not** modify `screen.ts` or any shared contract.

## Files in scope
- CREATE `scaffold/lib/eligibility/freshness.ts` — the annotator (e.g. `annotateFreshness(determination, { freshness?, snapshot? , now? }) → EligibilityDeterminationWithFreshness`).
- CREATE `scaffold/lib/eligibility/__tests__/freshness.test.ts` — pure unit tests.
- Read-only: `lib/canon/freshness.ts` (`FreshnessResult`, `checkFreshness`), `lib/canon/version.ts`
  (`CurrentSnapshotResult`, `DataAge`, `SyncHealthResult`, `checkSyncHealth`), `lib/contracts/eligibilityDetermination.ts`.

## Definition of done
- [ ] A wrapper type (e.g. `EligibilityDeterminationWithFreshness`) that carries the original
      `EligibilityDetermination` UNCHANGED plus a `freshness` block: at minimum `data_as_of` (ISO, from
      the snapshot's `retrieved_at`), `is_stale` (boolean), and a plain-language `caveat` string that is
      **present iff** the determination should be treated with caution.
- [ ] Staleness is derived from the CAN-05/CAN-06 API — do NOT re-implement the cadence/age math.
      Consume `CurrentSnapshotResult.data_age` / `checkSyncHealth` for corpus staleness, and
      `FreshnessResult.freshness_unavailable` / past-`close_date` for per-opportunity liveness.
- [ ] `is_stale === true` (and a caveat) when EITHER the corpus snapshot is beyond cadence / ALARM,
      OR the opportunity's live status was `freshness_unavailable`, OR the opportunity is now closed
      (`days_remaining <= 0`). Fresh + verified → `is_stale === false`, no caveat (or an empty/`null` one).
- [ ] Pure function: `now` injectable for deterministic tests; identical inputs → identical output.
      The original determination object is never mutated and never has its bucket changed.
- [ ] Unit tests covering: fresh corpus + live-open opp → not stale; stale corpus (age > cadence) →
      stale + caveat; `freshness_unavailable` opp → stale + caveat naming the source outage; closed opp
      (days_remaining <= 0) → stale + caveat; no-snapshot (`snapshot: null`) → treated as stale.

## Out of scope
- Wiring into `route.ts` / `match.ts` / any request path (a later slice; **DO NOT TOUCH** those files).
- The UI rendering (FE-04). Modifying `screen.ts` or any CON-01 contract. Any new network/LLM call.
- Re-deriving freshness math (that lives in CAN-05/CAN-06 — consume it).

## Test plan
`tsx --test` unit tests, fixtures only (build `FreshnessResult` / `CurrentSnapshotResult` objects by
hand; no DB, no network). Assert the caveat is plain-language and only present when flagged. Verify with
`npx tsc --noEmit` + `npm test`.

## Escalate if (§8.3)
- The CAN-05/CAN-06 API cannot express one of the required staleness signals without a change to those
  files (they are read-only here) → STOP and report to main rather than editing them.
