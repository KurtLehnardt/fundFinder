# R4b-cost — Cost-per-search measurement

**Team:** Perf
**Release slice:** R4b (ships with R4)
**Depends on:** CON-01 (contracts barrel — `OpportunityMap`, `ModelRoutingTable` shapes), CON-03
(feature-flag registry pattern)
**Blocks:** none (the rest of R4b's latency waterfall work can build on this instrumentation, but
does not require it to start)

## Context
R4b's step 1 is "profile before optimizing" (`prompts/fundfinder-orchestrator-prompt.md` §R4b):
instrument every call, record tokens in/out and wall-clock duration, and publish a baseline before
touching pipeline code. `northstar.md` §4 (Observability) asks for this directly ("monitor token
costs"), and §5.2 (Cost ceiling) needs real numbers before any `RunBudget` ceiling can be set
sensibly. Right now nothing captures actual `usage` from the Anthropic/OpenAI API responses —
`lib/claude.ts`'s three calls and `lib/embed.ts`'s one call all discard `response.usage`. This task
adds that capture, prices it, and aggregates a per-search cost/latency breakdown — measurement
only, no optimization and no budget enforcement.

## Files in scope
- CREATE `scaffold/lib/metering/pricing.ts` — dated per-model price table + source comment.
- CREATE `scaffold/lib/metering/meter.ts` — usage capture, cost calc, per-search aggregation,
  structured log emission. Pure/defensive — no framework imports.
- CREATE `scaffold/lib/metering/__tests__/pricing.test.ts`
- CREATE `scaffold/lib/metering/__tests__/meter.test.ts`
- CREATE `scaffold/scripts/cost-measure.mjs` — runs real searches directly against
  `buildOpportunityMap` (no dev server) for manual/dispatcher use.
- MODIFY `scaffold/lib/claude.ts` — capture `usage` from each of the three Anthropic calls
  (`extractProfile`, `explainMatches`, `explainWeakField`).
- MODIFY `scaffold/lib/embed.ts` — capture `usage` from the OpenAI embeddings response.
- MODIFY `scaffold/lib/match.ts` — thread a cost meter through `buildOpportunityMap` (and the
  `weakField()` helper), log a structured line per search, attach the optional debug object.
- MODIFY `scaffold/lib/types.ts` — add the optional debug field to the app-facing `OpportunityMap`
  type (additive only — do not touch `lib/contracts/opportunityMap.ts`'s zod schema; see note
  below).
- MODIFY `scaffold/lib/flags/registry.ts` and `scaffold/lib/flags/env.ts` — one new flag.
- MODIFY `scaffold/package.json` — one new npm script for the measurement tool.
- Read-only: `lib/contracts/modelRouting.ts` (task-name vocabulary to reuse), `lib/contracts/
  runBudget.ts` (shape reference only — do not implement enforcement), `lib/flags/accessor.ts`,
  `lib/analytics/track.ts` (the "validated, gated, never-throws" pattern to mirror).

Do not modify anything under `lib/contracts/` — those are CON-01-owned frozen shapes. If you find
you need to change one, stop and escalate (per the "Escalate if" section below) rather than editing
it.

## Design (read this before writing code — it resolves the ambiguities up front)

**Why an optional `meter` param, not a changed return type.** `extractProfile`, `explainMatches`,
`explainWeakField`, and `embed` all keep their existing signatures and return shapes — add one
optional trailing parameter (e.g. `meter?: CostMeter`) to each. This is additive: every existing
call site, every existing test, and `data/precomputed.json`'s frozen shape all keep working
unchanged if the param is omitted.

**Record usage before it can be lost.** Call `meter.record(...)` immediately after the API call
resolves (`msg.usage`, `json.usage`) — *before* `parseJson()` or any other step that can throw. A
downstream JSON-parse failure must never cause an already-spent call's cost to go unrecorded.
`explainMatches`'s batches run concurrently via `Promise.allSettled`; record each batch's usage as
its own call resolves (inside `scoreGroup`, not after `allSettled`), so a batch that fails after
its API call still has its spend captured. Aggregate all batches under one `candidate_analysis`
stage entry (summed tokens, a `calls` count, and latency = wall-clock of the whole fan-out, not a
sum of per-batch latencies — they run concurrently).

**`CostMeter` must never be able to break a search.** Every public method on it (`record`,
`summary`, and the structured-log helper) catches its own errors internally and degrades silently
(log a `console.warn` and drop that one data point) rather than throwing — mirror
`lib/analytics/track.ts`'s "a bad analytics call must never crash the app it's instrumenting"
philosophy exactly. In `lib/match.ts`, wrap the meter usage in a try/catch anyway as defense in
depth (belt-and-suspenders) — a metering bug must never be the reason a search fails.

**Structured server log: always, unconditionally.** Log one line per completed search (including
the early-exit `weakField()` path) regardless of the flag below — `console.log("[cost]",
JSON.stringify(summary))` (or similar) is fine; there's no real logging backend yet (see
`track.ts`'s `defaultSink` for precedent). This is (a) from the dispatcher's ask.

**Debug object on the result: gated, additive, off by default.** Add a new flag to
`lib/flags/registry.ts` + `lib/flags/env.ts` (follow the exact existing pattern — see
`r10_analytics` as the most similar recent example): name it `r4b_cost_debug`, requirement `"R4b"`,
description something like "Attach a per-search cost/latency breakdown to the API response for a
debug/admin view. Cost figures must never reach the end-user UI without this flag", envVar
`NEXT_PUBLIC_FLAG_R4B_COST_DEBUG`. In `buildOpportunityMap`, only set the debug field on the
returned object when `isFlagEnabled("r4b_cost_debug")` is true. This is (b) from the dispatcher's
ask — "do NOT show cost to end users; gate any UI behind a debug flag."

Attach the field on the *app-facing* type only, the same way ELG-04 added `eligibility` to `Match`
in `lib/types.ts` (see the comment block there) — **not** to
`lib/contracts/opportunityMap.ts`'s `OpportunityMapSchema` (that's CON-01's frozen zod contract;
touching it needs escalation, not this task). Concretely: export a `SearchCostDebug` type from
`lib/metering/meter.ts`, and in `lib/types.ts` add `costDebug?: SearchCostDebug` next to where
`Match`'s `eligibility?: ...` is added, following the same "TS-only, cache-safe" reasoning already
documented in that file's comment.

**Stage naming.** Reuse `lib/contracts/modelRouting.ts`'s `ModelTask` string values where they
overlap, so stage names in the cost breakdown line up with the routing table's vocabulary:
`profile_extraction`, `candidate_analysis`, `weak_field_explanation`. Add one more for the
embedding call — call it `query_embedding` (it isn't a `ModelTask` since that enum is
Anthropic-only; a plain string is fine, don't touch the contract to add it).

**Pricing table — look up real, current numbers; do not guess or reuse training-data figures.**
`lib/claude.ts`'s `MODEL` constant is `"claude-sonnet-4-6"`; `lib/embed.ts`'s is
`"text-embedding-3-small"`. Use `WebFetch`/`WebSearch` to pull current published per-token pricing
for both from Anthropic's and OpenAI's own pricing pages. In `pricing.ts`, key the table by the
exact model-id strings above, and put a comment on the table with: the source URL(s), and the date
you retrieved the numbers (today). This table WILL go stale — that's expected and is why the
comment matters more than the numbers. If a model id isn't found on the pricing page under that
exact name (e.g. it's an internal/alias id), say so in the comment and use the closest published
Sonnet-class-model rate, noting the substitution explicitly — do not silently invent a number.

**Latency capture.** Time each stage with `performance.now()` (or `Date.now()`) immediately
bracketing the call, not the whole function — e.g. the `profile_extraction` stage's latency is just
the `extractProfile()` call's wall-clock, not `extractProfile` + the query-text assembly that
follows it. Also record total wall-clock for the whole `buildOpportunityMap` call in the summary.

**Cache token fields.** The Anthropic SDK's `usage` object may include
`cache_creation_input_tokens` / `cache_read_input_tokens` even though nothing here uses prompt
caching yet (both should be `0`/`undefined` today). Capture them on the stage record if present
(future-proofing for R10.3's "cache hit/miss"), but do not invent pricing for them — treat them as
informational-only fields on the log/debug object, not part of `costUsd`, and say so in a comment.

## Definition of done
- [ ] `lib/metering/pricing.ts` exports a price table keyed by the two exact model-id strings in
      use, each with input $/token and output $/token (or per-million, your call, just be
      consistent and documented), a `pricingAsOf` date string, and a comment citing the source
      URL(s) and retrieval date.
- [ ] `lib/metering/meter.ts` exports (at minimum): a `SearchCostDebug` type (stages array + total
      cost + total latency + `pricingAsOf`), a `StageCost` type (stage name, provider, model,
      input/output tokens, cost, latency, call count), a `CostMeter` with a `record(...)` method
      per call and a way to produce the final `SearchCostDebug`, and a way to emit the structured
      log line. All of it defensive per the Design section above — verify with a test that a
      throwing/malformed input to `record()` does not propagate.
- [ ] `extractProfile`, `explainMatches`, `explainWeakField` (`lib/claude.ts`) and `embed`
      (`lib/embed.ts`) each accept the new optional `meter` param and record real `usage` from the
      API response, captured before any parsing that could throw.
- [ ] `buildOpportunityMap` (`lib/match.ts`) creates one `CostMeter` per call, threads it through
      every stage (including the `weakField()` early-exit path), logs the structured line
      unconditionally, and attaches `costDebug` to the returned object only when `r4b_cost_debug`
      is enabled.
- [ ] New flag `r4b_cost_debug` registered in both `lib/flags/registry.ts` and `lib/flags/env.ts`,
      defaulting off, following the existing pattern exactly (no ad hoc `process.env.NEXT_PUBLIC_*`
      reads anywhere else).
- [ ] `lib/types.ts`'s exported `OpportunityMap` type carries the optional `costDebug` field;
      `lib/contracts/opportunityMap.ts` is untouched.
- [ ] `scripts/cost-measure.mjs` imports `buildOpportunityMap` directly (relative import, e.g.
      `../lib/match.ts`, run via `node --import tsx scripts/cost-measure.mjs` — do NOT fetch
      `localhost` / require a running dev server, unlike `scripts/4-precompute.mjs`), sets
      `process.env.NEXT_PUBLIC_FLAG_R4B_COST_DEBUG = "true"` before importing `lib/match.ts` so
      `costDebug` populates, runs against a small set of company descriptions passed as CLI args or
      a small inline array (make them **distinct from the 5 cases in `scripts/dev-calibrate.mjs`
      and `scripts/4-precompute.mjs`** so a reviewer can't confuse this with the demo-day
      precomputed set), prints a per-search stage/cost/latency table to stdout, and writes the raw
      `{ description, map.summary, costDebug }` results to a JSON file (e.g.
      `/tmp/r4b-cost-results.json`) for the dispatcher to turn into the findings doc. Add an npm
      script for it in `package.json` (`"cost:measure": "node --import tsx scripts/cost-measure.mjs"`,
      matching the `canon:*` script pattern).
- [ ] `npx tsc --noEmit`, `npm test`, and `npm run build` all pass in `scaffold/`.
- [ ] Do **not** run `scripts/cost-measure.mjs` against real API keys yourself — that step (and the
      findings doc) is the dispatcher's job, done after this PR is verified, per the explicit
      user authorization scoped to that step only. It's fine (and encouraged) to sanity-check the
      script compiles/runs its argument-parsing and JSON-writing logic without real keys (it will
      throw on the missing `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` — that's an acceptable, expected
      failure mode to observe, not something to work around).

## Out of scope
- Any latency *optimization* (parallelization, caching, model routing changes, prompt trimming) —
  this task is measurement only. `lib/contracts/modelRouting.ts`'s placeholder model ids are not
  to be changed.
- `RunBudget` enforcement / graceful degradation when a run approaches its cost ceiling (§5.2) —
  this task produces the numbers that a future task would enforce against.
- Any UI component rendering `costDebug` — there is no debug/admin view to build yet; the object
  just needs to exist on the API response when the flag is on.
- R10.3 traces/persistence (`Run.elapsed_ms`, prompt versions, Canon snapshot version) — this is
  narrower: token cost + latency only, not the full run-trace record.
- Prompt-caching implementation — only plumb the (currently-zero) cache token fields through if the
  SDK surfaces them; do not add caching.
- Running the measurement script against real API keys, and `docs/R4b-cost-findings.md` — both are
  the dispatcher's job after this PR is verified (see DoD note above).

## Test plan
- `lib/metering/__tests__/pricing.test.ts`: given known token counts for each of the two priced
  models, the cost calc returns the expected dollar amount (basic arithmetic check against the
  documented table, plus a check that an unrecognized model id degrades safely — e.g. returns
  `0`/`undefined` with a warning rather than throwing — instead of silently mispricing).
- `lib/metering/__tests__/meter.test.ts`: recording several stages (including a fake
  `explainMatches`-style multi-batch stage) aggregates into correct totals; a `record()` call given
  malformed/undefined usage data does not throw and does not corrupt the running total; `summary()`
  called with zero recorded stages returns a well-formed empty result, not a throw.
- Re-run the existing flag tests (`lib/flags/__tests__/registry.test.ts`,
  `lib/flags/__tests__/accessor.test.ts`) — they iterate `FLAG_REGISTRY` generically, so the new
  `r4b_cost_debug` entry should pass through them without a new test file, but confirm this by
  running `npm test` and checking they still pass with the new flag present.
- No test in this task set may call the real Anthropic or OpenAI APIs (no `ANTHROPIC_API_KEY`/
  `OPENAI_API_KEY` should be required for `npm test` to pass) — the pure-function pricing/meter
  logic is what's under test, not the live API integration.
- Manual: `npm run build` succeeding is your signal that `lib/match.ts`'s API route
  (`app/api/match/route.ts`) still compiles against the changed `buildOpportunityMap` signature and
  the changed `OpportunityMap` type.

## Escalate if (§8.3, plus task-specific ones)
- You find you need to modify anything under `lib/contracts/` to make this work — stop; that's a
  CON-01-owned frozen shape, and reshaping it (even additively) needs sign-off.
- The Anthropic SDK version pinned in `package.json` (`@anthropic-ai/sdk` `^0.32.1`) doesn't expose
  a `usage` field on the message response in the shape assumed above — stop and report the actual
  shape rather than guessing.
- You can't reach the web to look up current pricing (sandboxed environment) — stop and report
  that rather than inventing numbers; note clearly in your final report which model(s) need
  pricing filled in by the dispatcher.
- `npm test` currently has no test runner wired for a location you need (unlikely — `tsx --test
  lib/**/__tests__/**/*.test.ts` already covers any path under `lib/**/__tests__/`) — confirm
  before assuming you need to touch the `test` script in `package.json`.
