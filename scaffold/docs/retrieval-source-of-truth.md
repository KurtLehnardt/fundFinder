# Retrieval source of truth (H4)

Architectural-review finding **H4** flagged two divergent retrieval scorers
living in the same tree, a calibration-drift risk. This doc records the decision
and what is (and is not) on the serving path.

## The one serving path: in-memory cosine in `lib/match.ts`

**Retrieval that ships to founders is the in-memory cosine similarity over the
bundled static corpus `data/opportunities.json`, in `lib/match.ts`.** Concretely,
`buildOpportunityMap()`:

1. embeds the founder query with `lib/embed.ts`
   (`text-embedding-3-small`, `dimensions: 512`), then
2. scores every opportunity in the bundled corpus with
   `.map(o => cosine(queryVec, o.embedding))`, filters to
   `sim >= CALIBRATION.candidateFloor` (0.22), sorts, and takes
   `CALIBRATION.candidateCount` (24) candidates.

Those knobs are calibrated against the five golden test cases; their audit trail
is `docs/calibration-baseline.md`. **This path is the source of truth and must
stay byte-identical unless a change is accompanied by a golden-set
re-validation.** This cleanup did not touch it.

## Deprecated: the pgvector hybrid retrieval scorer

`lib/canon/hybridQuery.ts` (`hybridSearch()`) was a **second, parallel**
retrieval scorer: a pgvector + `pg_trgm`/`ts_rank` hybrid over the Supabase
`opportunities` table, with its own `0.7 semantic / 0.3 lexical` blend. It was
**built but never wired to the serving path** — a caller-by-caller audit
(`git grep`) found zero non-self, non-test importers, and no test covered it.

Two independently-tunable retrieval scorers is exactly the calibration-drift
risk H4 named: the live cosine floor could be tuned while the hybrid blend
silently diverged. **It has been removed** (git history preserves the
implementation) to kill the drift and shrink the compiled surface. The live path
is unaffected.

## Still live, and NOT part of this change

- **Supabase corpus + the daily CAN sync cron** stay. They exist for data
  **curation/ingest** — `scripts/canon/*.mjs` writes normalized, embedded
  snapshots via `lib/canon/store.ts` (`.github/workflows/canon-sync.yml`,
  see `docs/canon.md`). They **do not serve retrieval today**; nothing reads the
  corpus back on the request path. `store.ts` remains in use by those scripts
  (and by `lib/canon/{rules,version,freshness}.ts`).
- **Freshness is a separate concern and stays live.**
  `lib/eligibility/freshness.ts` imports `CANON_SYNC_CADENCE_HOURS` (value) and
  types from `lib/canon/version.ts`, plus the `FreshnessResult` type from
  `lib/canon/freshness.ts`. None of that is retrieval scoring; it was untouched.

## Reviving pgvector later

If federated / server-side retrieval over the Supabase corpus becomes the
serving path, it must not silently replace the calibrated cosine path. Reviving
it requires a **calibration / golden-set re-validation**:

1. Restore the hybrid scorer (from git history) or re-implement it.
2. Re-derive its blend weights and any candidate floor against
   `evals/golden-set.jsonl`, alongside the existing `CALIBRATION` knobs in
   `lib/match.ts` — the two scorers must be shown to agree on the golden set
   before either is trusted, or one must be retired.
3. Land it behind a default-off flag (the CON-03 pattern:
   `lib/flags/registry.ts` + `lib/flags/env.ts`) so the calibrated default path
   stays byte-unchanged when the flag is off.
4. Update `docs/calibration-baseline.md` and this doc in the same change.
