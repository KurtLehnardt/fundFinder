import { getSql, toVectorLiteral } from "./store";

/**
 * hybridQuery.ts — candidate generation for §4.5 retrieval (Canon).
 *
 * Blends the two complementary signals the corpus supports:
 *
 *   semantic  = cosine similarity between the query embedding and the row's
 *               512-dim `embedding`, computed as `1 - (embedding <=> q)` where
 *               `<=>` is pgvector's cosine DISTANCE. Range ≈ [0,1] for related
 *               docs (higher = closer). Captures meaning ("AI for rural clinics"
 *               ≈ "machine learning in underserved healthcare") that keywords
 *               miss. 0 when no query embedding (or row embedding) is present.
 *
 *   lexical   = the strongest of three keyword/fuzzy signals, all ~[0,1]:
 *                 • pg_trgm similarity(program, q)
 *                 • pg_trgm similarity(title,   q)
 *                 • ts_rank(keywords tsvector, plainto_tsquery(q)) (capped at 1)
 *               Catches exact program names, agency acronyms, and statutory
 *               terms where embeddings are weak. 0 when no query text.
 *
 * BLEND (documented, tunable):
 *   score = w_semantic * semantic + w_lexical * lexical
 *   Defaults: w_semantic = 0.7, w_lexical = 0.3. Semantic leads (it generalizes);
 *   lexical is the corrective that rescues exact-term matches a purely semantic
 *   ranker would bury. Weights are inputs so downstream (retrieval tuning /
 *   Team Evals) can calibrate against the golden set without editing SQL.
 *
 * This is CANDIDATE GENERATION only — eligibility screening (R8) and final
 * ranking/synthesis happen in later stages (§4.5). It does not gate or rank for
 * eligibility.
 */

export interface HybridWeights {
  semantic?: number;
  lexical?: number;
}

export interface HybridQueryInput {
  /** Query embedding (512-dim). Omit for a lexical-only search. */
  queryEmbedding?: number[];
  /** Free-text query for the lexical signal. Omit for a semantic-only search. */
  queryText?: string;
  /** Max candidates to return. Default 24 (matches v1 CALIBRATION.candidateCount). */
  limit?: number;
  /** Blend weights (default semantic 0.7 / lexical 0.3). */
  weights?: HybridWeights;
  /** Restrict to a corpus snapshot (§4.3). Omit to search all snapshots. */
  snapshotVersion?: string;
}

export interface HybridCandidate {
  id: string;
  source: string;
  program: string;
  title: string | null;
  agency: string;
  status: string | null;
  semantic: number;
  lexical: number;
  score: number;
}

export async function hybridSearch(
  input: HybridQueryInput,
): Promise<HybridCandidate[]> {
  const sql = getSql();

  const wSem = input.weights?.semantic ?? 0.7;
  const wLex = input.weights?.lexical ?? 0.3;
  const limit = Math.max(1, Math.floor(input.limit ?? 24));
  const embLiteral = input.queryEmbedding
    ? toVectorLiteral(input.queryEmbedding)
    : null;
  const qText = input.queryText?.trim() ?? "";
  const snapshot = input.snapshotVersion ?? null;

  const rows = await sql<HybridCandidate[]>`
    select
      t.id, t.source, t.program, t.title, t.agency, t.status,
      t.semantic, t.lexical,
      (${wSem}::float8 * t.semantic + ${wLex}::float8 * t.lexical) as score
    from (
      select
        o.id, o.source, o.program, o.title, o.agency, o.status,
        case
          when ${embLiteral}::text is null or o.embedding is null then 0
          else 1 - (o.embedding <=> ${embLiteral}::vector)
        end as semantic,
        case
          when ${qText} = '' then 0
          else greatest(
            similarity(o.program, ${qText}),
            similarity(coalesce(o.title, ''), ${qText}),
            least(ts_rank(o.keywords, plainto_tsquery('english', ${qText})), 1.0)
          )
        end as lexical
      from opportunities o
      where ${snapshot}::text is null or o.snapshot_version = ${snapshot}
    ) t
    order by score desc
    limit ${limit}
  `;

  return rows.map((r) => ({
    ...r,
    semantic: Number(r.semantic),
    lexical: Number(r.lexical),
    score: Number(r.score),
  }));
}
