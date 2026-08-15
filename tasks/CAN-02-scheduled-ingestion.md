# CAN-02 — Scheduled ingestion (grants.gov → Supabase)

**Team:** Canon
**Release slice:** 1
**Depends on:** CAN-01 (store + schema)
**Blocks:** CAN-05 (freshness), corpus breadth, ELG data

## Context
v1 ingestion is a **manual one-time** script (`scaffold/scripts/1-fetch.mjs` +
`2-normalize.mjs`): grants.gov `search2` + `fetchOpportunity`, ~15 hardcoded keywords, output
committed as static JSON (`as-built.md`, `canon.md`). The §4.3 hybrid decision (V-E) requires
**scheduled** ingestion into the Supabase store, broadened beyond the demo keywords and refreshed
on a cadence.

## Files in scope
- CREATE `scripts/canon/ingest-grants.mjs` (adapt the working v1 fetch+normalize logic).
- CREATE `.github/workflows/canon-sync.yml` (scheduled GitHub Action cron).
- CREATE `scaffold/lib/canon/normalize.ts` (source→Opportunity contract).
- Reads/writes the Supabase store from CAN-01 (pooler; `FUNDFINDER_DB_PASSWORD`).

## Definition of done
- [ ] Action runs on a documented cron (default daily), fetches grants.gov, normalizes to the
      CON-01 `Opportunity` contract, generates embeddings (OpenAI 512-dim, same model as retrieval),
      **upserts** into Supabase under a new `snapshot_version` + `retrieved_at`.
- [ ] Coverage broadened beyond the 15 demo keywords (comprehensive or configurable) — documented in `canon.md`.
- [ ] Idempotent (re-run doesn't duplicate); per-source failure degrades + alarms (CAN-06), never
      fails the whole sync silently.
- [ ] Secrets from GitHub Action env (OpenAI + DB), never logged.

## Out of scope
SBIR / SAM.gov / USAspending adapters (CAN-03), eligibility-rule extraction (CAN-04), live
freshness checks (CAN-05), wiring retrieval into `app/api/match/route.ts`.

## Test plan
Run ingest against a small keyword slice → rows in Supabase with a snapshot; re-run is idempotent;
embeddings are 512-dim; a simulated source failure alarms rather than aborting.

## Escalate if
- The grants.gov API shape changed (v1 already found `search2` returns summaries only) → adapt, report.
- A source is unreachable (SBIR was 403 in recon) → degrade that source + alarm; do not fail the run.
