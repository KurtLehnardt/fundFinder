# CAN-01 — Supabase Postgres + pgvector corpus store

**Team:** Canon
**Release slice:** 1
**Depends on:** CON-01 (Opportunity, EligibilityDetermination contracts)
**Blocks:** CAN-02..06, all retrieval, ELG-*

## Context
v1's corpus is a static `scaffold/data/opportunities.json` (476 grants.gov records, embedded
512-dim, in-memory cosine in `lib/match.ts`). V-E decided the server-side store is **Supabase
Postgres + pgvector** (`resolved-questions.md`; connection in memory `fundfinder-supabase` —
pooler `aws-0-us-west-2.pooler.supabase.com:5432`, `pgvector 0.8.2` + `pg_trgm 1.6` available).
This task stands up the schema + typed access layer and seeds it from the existing 476 records so
downstream work has real data.

## Files in scope
- CREATE `supabase/migrations/*.sql` (repo root) — extensions + tables + indexes.
- CREATE `scaffold/lib/canon/store.ts` (typed DB client using the **transaction pooler :6543** at
  runtime, session :5432 for migrations; password from `FUNDFINDER_DB_PASSWORD`) and
  `scaffold/lib/canon/hybridQuery.ts` (cosine + trigram).
- CREATE `scripts/canon/seed-from-v1.mjs` — load `data/opportunities.json` + `awards.json` into the store.
- Do NOT wire into `app/api/match/route.ts` yet (later slice).

## Definition of done
- [ ] **Store-row type (from CON-01 review):** define `CanonOpportunitySchema` in `scaffold/lib/canon/`
      (NOT in the CON-owned `contracts/opportunity.ts`) as `OpportunitySchema` with the Canon fields
      **required** (`source_id, title, status, key_dates, award_range, retrieved_at, eligibility_rules`).
      The store reads/writes this stricter type; document the normalization rule that Canon writes
      populate the structured fields (not just the v1 `program/deadline/fundingLow/High` mirrors), so
      downstream (ELG/FE) never silently gets `undefined` on a store row.
- [ ] Migration enables `vector` + `pg_trgm`; creates `opportunities` (Opportunity fields + `embedding vector(512)` + generated `tsvector` + `source`, `source_id`, `status`, key dates, `award_low/high`, `raw jsonb`, `retrieved_at`, `snapshot_version`), `eligibility_rules` (opportunity_id, rule, citation_url, `model_inferred bool`), `corpus_snapshots` (version, created_at, source coverage).
- [ ] `store.ts` methods typed to CON-01 `Opportunity`; connection via pooler; never logs the password.
- [ ] `hybridQuery.ts` returns candidates ranked by a documented blend of cosine + trigram/keyword.
- [ ] Seeded with the 476 v1 opportunities (dims match 512) + award history; a roundtrip query returns them.
- [ ] Cross-user isolation is a non-issue here (corpus is shared/public) — documented as such.

## Out of scope
Ingestion scheduling (CAN-02), eligibility-rule *extraction* (CAN-04), live freshness (CAN-05),
wiring retrieval into the request path, any R9 user-data tables (user data stays in localStorage).

## Test plan
`psql` apply migration clean; insert+select roundtrip; `hybridQuery` returns sensible ranking on
seeded data; confirm 512-dim vectors load without truncation.

## Escalate if
- An Opportunity field needed by the store isn't in the CON-01 contract → CON change (orchestrator).
- Pooler connection/prepared-statement limits block the access pattern (transaction pooler disables
  prepared statements — may need `?pgbouncer=true`/`prepare:false`).
