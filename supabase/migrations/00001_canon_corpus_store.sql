-- ============================================================================
-- CAN-01 — Supabase Postgres + pgvector corpus store (Team Canon)
-- ----------------------------------------------------------------------------
-- The server-side corpus store for fundFinder v2 (§4 "The Canon").
-- Stands up the schema + indexes that back retrieval (§4.5), eligibility rules
-- (R8.4), and corpus versioning (§4.3 / R10.2).
--
-- Design contract: rows are the CON-01 `Opportunity` shape (lib/contracts/
-- opportunity.ts) with the Canon fields promoted to first-class columns. The
-- store reads/writes the stricter `CanonOpportunitySchema`
-- (scaffold/lib/canon/CanonOpportunity.ts): Canon writes populate the STRUCTURED
-- columns (source_id, title, status, key dates, award_low/high, retrieved_at),
-- not just the v1 mirrors (program / deadline / funding_low/high), so downstream
-- (ELG / FE) never silently gets `undefined` on a store row.
--
-- IDEMPOTENT & ADDITIVE: every statement is `if not exists`. This migration
-- DROPS NOTHING and can be re-applied any number of times with no error and no
-- data loss.
--
-- Cross-user isolation is a NON-ISSUE here (CAN-01 DoD): the corpus is shared,
-- public, government funding data. No per-user rows live in these tables (user
-- data stays in localStorage per R9.0), so there is no RLS/tenant boundary to
-- enforce in this store. Any per-user surface is out of scope (R9 / Team
-- Platform).
--
-- Apply (session pooler, port 5432 — see project memory `fundfinder-supabase`):
--   psql "$DB_URL_SESSION_POOLER" -f supabase/migrations/00001_canon_corpus_store.sql
-- ============================================================================

-- --- Extensions (§4 — hybrid keyword + semantic retrieval) ------------------
-- vector 0.8.2  → pgvector: `vector(512)` column + ANN index for cosine search.
-- pg_trgm 1.6   → trigram similarity() for the lexical half of the hybrid blend.
create extension if not exists vector;
create extension if not exists pg_trgm;

-- ============================================================================
-- corpus_snapshots — §4.3 corpus versioning / R10.2 reproducibility.
-- Every run records the snapshot it read; every opportunity row carries its
-- snapshot_version. A snapshot names a frozen import with its source coverage.
-- ============================================================================
create table if not exists corpus_snapshots (
  version         text primary key,
  created_at      timestamptz not null default now(),
  -- Per-source coverage/gaps for §4.2/§4.6 honesty ("what we cover, what we
  -- don't"): e.g. { "grants.gov": { "opportunities": 476, ... }, "dims": 512 }.
  source_coverage jsonb not null default '{}'::jsonb,
  notes           text
);

-- ============================================================================
-- opportunities — the normalized program record (§3.4 Opportunity + Canon).
-- v1 mirrors (program / eligibility / forecasted / deadline / funding_*) are
-- kept so the legacy shape roundtrips; the Canon structured columns are the
-- authoritative surface Canon writes populate.
-- ============================================================================
create table if not exists opportunities (
  -- Canonical row id = the v1 corpus id (e.g. "grants-358687").
  id               text primary key,

  -- Provenance / identity
  source           text not null,                 -- OpportunitySource enum value
  source_id        text,                          -- stable id within the source system (Grants.gov opp #)
  kind             text,                           -- OpportunityKind enum value

  -- v1 mirror + Canon title
  program          text not null,                 -- v1 program (mirror)
  title            text,                           -- Canon canonical title
  agency           text not null,
  description      text not null,
  eligibility      text,                           -- v1 prose eligibility (mirror; structured rules live in eligibility_rules)

  -- Freshness / status (R8.3)
  status           text,                           -- OpportunityStatus enum value (forecasted|open|closed|rolling|continuous|standing|unknown)
  forecasted       boolean,                        -- v1 mirror
  deadline         text,                           -- v1 mirror (raw source string, may be MM/DD/YYYY)
  open_date        timestamptz,                    -- key_dates.open_date
  close_date       timestamptz,                    -- key_dates.close_date
  response_date    timestamptz,                    -- key_dates.response_date

  -- Award sizing
  funding_low      numeric,                        -- v1 mirror
  funding_high     numeric,                        -- v1 mirror
  award_low        numeric,                        -- Canon award_range.floor
  award_high       numeric,                        -- Canon award_range.ceiling
  award_currency   text default 'USD',

  -- Retrieval / matching
  industry_tags    text[],
  geography        text,
  url              text,
  embedding        vector(512),                    -- 512-dim v1 embedding (no truncation)

  -- Keyword search vector (generated) — the lexical index feeds hybrid retrieval.
  -- Uses the two-arg to_tsvector('english', ...) (IMMUTABLE) so it is valid in a
  -- generated column. industry_tags are intentionally excluded: array_to_string
  -- is not immutable, and the tags add little over the description text.
  keywords         tsvector generated always as (
                     to_tsvector('english',
                       coalesce(title, program, '') || ' ' ||
                       coalesce(agency, '')          || ' ' ||
                       coalesce(description, '')      || ' ' ||
                       coalesce(eligibility, '')
                     )
                   ) stored,

  -- Raw source record (jsonb) — retains the original v1 record (§4.3 "retain the
  -- raw source record") plus parked v1 award_history (see seed script).
  raw              jsonb,

  -- Freshness + versioning (§4.4 / R10.2)
  retrieved_at     timestamptz,                    -- when this record was retrieved into the Canon
  snapshot_version text references corpus_snapshots(version),

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ============================================================================
-- eligibility_rules — structured, cited eligibility gates (R8.4).
-- "Rules live in the Canon, not in model recall." A model-extracted rule is
-- `model_inferred = true` and does NOT gate exclusion until reviewed.
-- NOTE: CAN-01 does NOT seed this table — rule *extraction* is CAN-04. The table
-- exists now so downstream (ELG) has a stable target.
-- ============================================================================
create table if not exists eligibility_rules (
  id                    bigint generated always as identity primary key,
  opportunity_id        text not null references opportunities(id) on delete cascade,
  category              text,                       -- EligibilityRuleCategory enum value
  rule                  text not null,              -- human-readable rule statement
  citation_url          text,                       -- Citation.source_url (R8.4)
  citation_name         text,                       -- Citation.source_name
  citation_quote        text,                       -- Citation.quote
  citation_retrieved_at timestamptz,                -- Citation.retrieved_at
  provenance            text not null default 'model_inferred',  -- user_stated|model_inferred|verified
  model_inferred        boolean not null default true,           -- convenience flag mirroring provenance='model_inferred'
  created_at            timestamptz not null default now()
);

-- ============================================================================
-- Indexes
-- ============================================================================

-- Semantic ANN index on the embedding (cosine). HNSW (pgvector 0.8.2) — better
-- recall than ivfflat, builds incrementally, needs no training rows present.
create index if not exists opportunities_embedding_hnsw
  on opportunities using hnsw (embedding vector_cosine_ops);

-- Keyword search — GIN over the generated tsvector.
create index if not exists opportunities_keywords_gin
  on opportunities using gin (keywords);

-- Trigram — lexical fuzzy match on the title/program text (pg_trgm).
create index if not exists opportunities_program_trgm
  on opportunities using gin (program gin_trgm_ops);
create index if not exists opportunities_title_trgm
  on opportunities using gin (title gin_trgm_ops);

-- Common filters.
create index if not exists opportunities_source_idx    on opportunities (source);
create index if not exists opportunities_status_idx    on opportunities (status);
create index if not exists opportunities_snapshot_idx  on opportunities (snapshot_version);
create index if not exists eligibility_rules_opp_idx   on eligibility_rules (opportunity_id);
