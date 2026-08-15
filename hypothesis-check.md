# hypothesis-check.md — spec `[HYPOTHESIS]` markers vs. as-built

Checked against `origin/main @ aa3297f`. Verdicts: **confirmed / refuted / reshaped / unknown.**
The spec's hypotheses were inferred from symptoms of the original scaffold and/or the deployed
3-minute wait; the current code (v1) diverges. Each verdict cites the settling file:line.

---

## H1 — "grant-database queries across agencies, the similar-companies lookup, and profile extraction are currently serialized and have no true interdependency" (line 268, R4b)
**REFUTED / RESHAPED.** There are **no live grant-database queries on the request path** to
serialize (see H4). Retrieval is an in-memory cosine scan over a local embedded corpus
(`lib/match.ts:71-76`). The "similar-companies lookup" is a local `data/awards.json` dictionary
read (`historyFor`, `lib/match.ts:40-53`), **not** an API or LLM call. Profile extraction
(`extractProfile`) is a genuine serial LLM call, but it produces the query text that the
embedding (and thus retrieval) depends on — so it *cannot* run concurrently with them; there is
a real dependency, not a missed parallelization.
- The one place with parallelizable LLM work — candidate scoring — is **already concurrent**
  (`explainMatches`, `Promise.allSettled` over batches of 8, `lib/claude.ts:135-145`, added in v1).
- **Consequence:** the R4b task "parallelize independent calls" is largely void as written. The
  remaining serial chain is `extractProfile → embed → retrieve → explainMatches (→ weakField)`,
  and its length is dominated by LLM generation, not by missed concurrency.

## H2 — "cheap subtasks currently run on the analysis model" (line 277, R4b)
**CONFIRMED.** `lib/claude.ts:4` defines a single `MODEL = "claude-sonnet-4-6"` used by all three
calls: `extractProfile` (line 24), `explainMatches` (line 118), `explainWeakField` (line 159).
Extraction and the weak-field write-up are cheap-model work running on the analysis model. There
is no routing table (§3 item 9 is greenfield). **This is a live, valid R4b/routing target.**

## H3 — "the pipeline is one large prompt rather than a composed chain" (line 281, R4b)
**REFUTED.** The pipeline is already a composed chain of discrete stages
(`buildOpportunityMap`, `lib/match.ts:55-137`): extract → embed → rule-gate+cosine → explain
(fanned out into parallel batches) → conditional weak-field. It is **not** a monolithic prompt.
The spec flagged this as "the most invasive task and the most likely to be based on a wrong
guess" — it was. **Do not schedule prompt-decomposition work.** (A different, real decomposition
target may exist — routing extraction to a cheap model, H2 — but the monolith does not.)

## H4 — "the current implementation queries one external search API live per request, with no local corpus" (line 769, §4.1)
**REFUTED — the opposite is true, and this is the headline finding.** There **is** a local
corpus: `data/opportunities.json`, 476 opportunities, pre-embedded at 512-dim, read in-memory
(`lib/match.ts:5,71`). The request path makes **no** government-API call; the only live external
call is the OpenAI query embedding (`lib/embed.ts:13`). Government data is fetched **offline**,
once, by `scripts/1-fetch.mjs` and committed as static JSON.
- **This makes §4.2 a "harden and expand a thin, static, grants.gov-only corpus" job, not a
  greenfield build — and not a live-to-local migration either.** See `canon.md`.
- **But it inverts the risk the spec worried about:** the problem is not live-query latency, it is
  **staleness** — the corpus never refreshes, so freshness (R8.3) and coverage are the real gaps.
  The §4.3 `[DECIDE]` (hybrid) is strongly indicated: keep local retrieval, add a targeted live
  freshness check on surfaced opportunities.

---

## Net effect on the buildout
- **R4b must be re-scoped before any task is written.** Two of its four candidate targets (H1
  parallelize independent calls; H3 split the monolith) are void. The live targets are **model
  routing (H2), streaming (absent today), the extract→explain serial chain, and moving the
  *freshness* check — not the corpus — onto a targeted request-time path.**
- **The Canon (§4) rises in priority.** The as-built already satisfies "local corpus for
  retrieval" but fails "fresh, cited, broad, refreshed." That is where the correctness risk lives.
- No hypothesis is **unknown**; all four are settled by code.
