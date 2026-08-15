# Canon corpus — scheduled ingestion (CAN-02)

The Canon is the server-side, normalized corpus of funding opportunities (§4 of
`prompts/fundfinder-orchestrator-prompt.md`) that retrieval (§4.5) reads. This
doc covers what CAN-02 ingests, how often, and how failures are handled. The
store schema and one-time v1 import are covered in `CAN-01` (see
`supabase/migrations/00001_canon_corpus_store.sql` and
`scripts/canon/seed-from-v1.mjs`).

## What's ingested

**Source: grants.gov only** (`search2` + `fetchOpportunity`). SBIR/SAM.gov/
USAspending adapters are CAN-03 — out of scope here. See "Gaps" below.

**Coverage: broadened beyond the v1 demo set.** v1 (`scripts/1-fetch.mjs`)
hardcoded ~15 keywords shaped around five specific demo test cases.
`scripts/canon/keywords.mjs` replaces that with ~60 keywords across 10
sectors, so the scheduled run covers meaningfully more of grants.gov's
posted/forecasted catalog rather than just the demo path:

| Category | Keywords |
|---|---|
| `ai_data` | artificial intelligence, machine learning, data science, quantum computing, high performance computing |
| `health` | health information technology, nursing workforce, public health infrastructure, behavioral health, maternal health, rural health care, biomedical research, medical device innovation, infectious disease surveillance, opioid response |
| `manufacturing_materials` | advanced manufacturing, aerospace materials, lightweight structures, semiconductor manufacturing, robotics automation, additive manufacturing, supply chain resilience |
| `infrastructure_environment` | water infrastructure, environmental sensors, climate technology, clean energy, renewable energy, grid resilience, wildfire resilience, disaster preparedness, coastal resilience, brownfield redevelopment, broadband deployment |
| `security_defense` | cybersecurity, threat detection, critical infrastructure security, border security technology, biodefense, space technology |
| `economy_workforce` | small business innovation, workforce development, youth programs, community development, entrepreneurship training, apprenticeship programs, rural economic development, minority business development, veteran owned business |
| `agriculture_food` | sustainable agriculture, food security, precision agriculture, agricultural biotechnology |
| `education` | STEM education, career technical education, early childhood education, higher education research |
| `transportation` | transportation infrastructure, electric vehicle technology, aviation research, maritime technology |
| `housing_community` | affordable housing, homelessness services, tribal community development |

The list is intentionally a starting broad set, not exhaustive — grants.gov's
own catalog spans far more programs than any fixed keyword list will surface.
Widen `KEYWORD_CATEGORIES` in `scripts/canon/keywords.mjs` as gaps are found
(e.g. against the golden set, `EVL-01`); each category can also be run/scaled
independently via `--categories=`.

## How it runs

`scripts/canon/ingest-grants.mjs`, adapted from the working v1
fetch+normalize logic (`scripts/1-fetch.mjs` + `scripts/2-normalize.mjs`):

1. **Fetch** — `search2` per keyword (default: all ~60), dedupe hits by
   opportunity id across keywords, `fetchOpportunity` detail per unique id
   (bounded concurrency).
2. **Normalize** — `lib/canon/normalize.ts` maps the grants.gov shape to the
   CON-01 `Opportunity` contract, populating the STRUCTURED Canon fields
   (`status`, `key_dates`, `award_range`, `source_id`, `title`) from the
   live source data (`oppStatus`/`openDate`/`closeDate`/`synopsis`/
   `forecast`) rather than inferring them after the fact, the way the v1
   static-corpus seed has to.
3. **Embed** — OpenAI `text-embedding-3-small`, `dimensions: 512` — the same
   model/dimensionality the live retrieval path uses to embed the founder's
   query (`lib/embed.ts`, consumed by `lib/match.ts`), so cosine similarity is
   comparable. (The pgvector hybrid scorer that formerly lived in
   `lib/canon/hybridQuery.ts` was deprecated/removed — it never served
   retrieval. See `docs/retrieval-source-of-truth.md`.)
4. **Validate** — `CanonOpportunitySchema.parse(...)` at the write boundary
   (a malformed record is dropped + alarmed, not allowed to corrupt the
   batch).
5. **Upsert** — `lib/canon/store.ts` (`upsertSnapshot` + `upsertOpportunities`)
   writes under a **new** `snapshot_version` (`canon-sync-YYYYMMDD` by
   default) with a fresh `retrieved_at`. Rows are keyed by the stable id
   `grants-<opportunity id>`, so re-running the same day (or any day —
   Grants.gov ids are stable across pulls) **updates the existing row**
   in place; it never duplicates.

Cadence: **daily**, via `.github/workflows/canon-sync.yml`
(`0 9 * * *` UTC), with a `workflow_dispatch` manual trigger that accepts a
`keywords`/`categories` override for ad-hoc/partial runs.

Run locally (secrets already in env — see `lib/canon/store.ts` and
`scripts/3-embed.mjs` header for how they're read; never printed):

```bash
npm run canon:ingest                                   # full broadened list
npm run canon:ingest -- --keywords="quantum computing"  # smoke test
npm run canon:ingest -- --categories=ai_data,health     # sector slice
npm run canon:ingest -- --max-keywords=3                # first N of the default list
npm run canon:ingest -- --snapshot=my-test-001          # pin the snapshot label
```

## Failure handling (§4.4 / §4.6)

**Per-keyword and per-record failures degrade, they don't abort the run.**
Each `search2` call and each `fetchOpportunity` detail call is independently
`try`/caught: a bad keyword or a flaky detail fetch narrows that run's
coverage but the run continues. Failures accumulate into an `alarms` list
that is:

- printed as GitHub Actions `::warning::`/`::error::` annotations (visible in
  the Actions UI without any extra tooling), and
- written into `corpus_snapshots.source_coverage.alarms` for that run, so a
  degraded sync is auditable from the DB alone, not just CI logs — "a failed
  sync must alarm; silently serving a stale corpus is the failure mode that
  produces confidently wrong deadlines" (§4.4).

**A run only fails (non-zero exit / job goes red) if it wrote zero
opportunities** — i.e. the source was fully down or every record failed
validation. A partial degrade (some keywords failed, most succeeded) is a
green run with visible warnings, which is the intended "one source/keyword
failing narrows the map, it doesn't take down the whole sync" behavior.

`ingest-grants.mjs`'s `runSource(name, fn)` wraps a source's entire pipeline
in the same try/catch/alarm pattern, so CAN-03 can add SBIR/SAM.gov/
USAspending as additional `runSource(...)` calls without re-deriving this.

**Escalate rather than degrade:**
- grants.gov `search2` returning something that isn't `{ data: { oppHits:
  [...] } }` throws immediately (rather than silently treating it as zero
  hits) — this is the "API shape changed" case from the CAN-02 escalation
  clause.
- OpenAI embedding failures (auth/quota/dimension mismatch) throw and stop
  the run rather than writing rows with missing or truncated embeddings —
  a corpus row nobody can retrieve is worse than a late row.

## Gaps (as of this snapshot)

- No SAM.gov contracts, SBIR/STTR topics, or USAspending award history
  (CAN-03).
- `eligibility_rules` is written as `[]` on every row — structured rule
  extraction is CAN-04.
- No live per-result freshness check at query time (CAN-05); freshness here
  is "as of `retrieved_at`", not real-time.
- Keyword coverage is a curated list, not the full grants.gov catalog — see
  "What's ingested" above.

These gaps are also recorded per-run in `corpus_snapshots.source_coverage.gaps`
so any consumer of a snapshot can see what it does and doesn't cover without
reading this file.
