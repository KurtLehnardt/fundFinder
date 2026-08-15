# Granted — Architectural Review: Consolidated Findings

Synthesis of 7 parallel scope reviews (architecture, backend/perf/cost, data/Canon, eligibility/anti-fabrication, frontend/UX/a11y, security, tests). Deduplicated and **severity-normalized** to one bar: CRITICAL = a live correctness/honesty violation, security hole, or broken flagship journey. HIGH = significant bug / major cost-latency problem / missing critical coverage / notable UX-a11y break. MEDIUM = optimization / moderate issue. LOW = polish. (Reviewers' own "CRITICAL" ratings for *missing tests* and the *documented* pgvector gap are normalized to HIGH.)

## What's genuinely solid (verified, not findings)
- **The eligibility engine is real R8.4-safe anti-fabrication.** `screen.ts` + the CON-01 schema `.parse()` backstop make a model-inferred / universal / unreviewed rule (or an inferred failing fact) *unable* to produce `excluded` — it throws rather than render. Exhaustively tested. The bridge never fabricates; quote-grounding is enforced in code, not just prompt.
- **No security holes.** No secret exposure (LLM/DB keys server-only; only the Supabase anon key is public; no service_role anywhere), no auth bypass (mock/demo/entitlements/billing are honest client-only stubs that gate nothing server-side), no PII leaving the client boundary, no XSS/injection (no `dangerouslySetInnerHTML`/`eval`; LLM output is JSON-parsed + React-escaped).
- **Metering, progress, and screening are defensive** — none can fail a search. Cost is behind a flag. Flag/contract discipline is strong *where wired*.

---

## CRITICAL (1) — fix first

### C1 · `ruleGate()` silently drops opportunities before screening — live false exclusions
- **Where:** `lib/match.ts:32-41` (`ruleGate`), applied at `:126`.
- **What:** A legacy v1 filter runs *before* the ELG-01 engine and removes opps that then reach **no bucket at all** (violating R8.2 "never silently drop"). Two branches: (1) `opp.source==="sbir" && emp>500` excludes on a **model_inferred** employee count (R8.4 violation; dormant today — corpus is 100% grants.gov); (2) a greedy regex `/only.*(institutions of higher education|state governments|tribal)/ && emp>0` over free-text eligibility — **LIVE: matches 40/476 opps with verified false positives** (e.g. `grants-353936` is open to nonprofits *and* IHEs, dropped as "IHE-only").
- **Impact:** The product's core promise — never silently drop, never fabricate — is broken in production; the three-bucket "honest" display is fed an already-secretly-pruned set.
- **Fix:** Make `screen()` the sole eligibility authority. Delete both exclusion branches (reduce `ruleGate` to non-eligibility retrieval heuristics, or remove it). Size/entity mismatches must become `unknown`/`conditional` via the engine, or a *visible* `excluded`, never a pre-screen drop.

---

## HIGH (10)

### H1 · Silent search dead-end on error/timeout (flagship journey) — *flagged by 3 reviewers*
- **Where:** `components/IntakeForm.tsx` `run()` (only surfaces errors on JSON `!res.ok`); `app/api/match/route.ts` stream ending without a `result` line.
- **What:** A non-JSON 5xx, a timeout, or a stream that closes without a `result` clears the spinner with **no results and no error** — the primary journey dead-ends silently.
- **Fix:** Treat "stream ended without result" and non-JSON failures as explicit errors in `run()`; show a retry affordance.

### H2 · `maxDuration=120` vs measured ~99–109s and Vercel plan — novel search can fail wholesale
- **Where:** `app/api/match/route.ts:7`; latency per `docs/R4b-cost-findings.md`.
- **What:** ~11s margin under the ceiling on a non-deterministic workload → the tail truncates into a hard timeout that discards a fully-computed result. **On a Vercel Hobby plan (60s cap) *every* novel search times out.** No per-call Anthropic timeout (SDK default ~600s), so the platform kill always wins.
- **Fix:** Land H3 (two-pass) to cut the tail; confirm the deploy plan allows 120s; stream partial results as batches resolve; set an explicit Anthropic client `timeout` below the function budget. **(Borderline CRITICAL if prod is on Hobby — verify.)**

### H3 · Two-pass scoring — the single biggest cost & latency lever (~3×)
- **Where:** `lib/claude.ts:80-142` (`explainMatches`), driven by `lib/match.ts:139`.
- **What:** The full 4-part narrative (~900 output tokens) is generated for **all 24** candidates, incl. `none`-tier ones never shown. R4b: this stage is **94% of cost, 84% of latency.**
- **Fix:** Pass A = cheap score-only over 24 (small `max_tokens`, possibly haiku); Pass B = full narrative only for score ≥ 25 (typically 4–10). ~3× reduction. Re-run `cost:measure`.

### H4 · pgvector/Canon built but never called; ~6MB corpus bundled into the function
- **Where:** `lib/canon/{hybridQuery,store,freshness,version}.ts` (zero runtime callers); live retrieval is in-memory cosine over `data/opportunities.json` in `lib/match.ts:124-131`.
- **What:** Two divergent retrieval scorers → calibration drift when switched; the daily CAN-02 cron grows a Supabase corpus nothing serves; the static JSON inflates cold starts.
- **Fix:** Decide the retrieval source of truth. Either wire pgvector into the live path (and re-validate calibration) or explicitly deprecate the unused stack; either way remove the drift risk and document the choice.

### H5 · Observability entirely unwired
- **Where:** `AnalyticsProvider` never mounted in the layout tree; no funnel builder ever called.
- **What:** Even with `r10_analytics` on, no event fires — including `run_abandoned`, the spec's "single most important event." The app is flying blind on the funnel/cost it was built to measure.
- **Fix:** Mount `AnalyticsProvider`; emit the funnel events at the real call sites (search start/result/abandon, honest-no, interview shown).

### H6 · Zero tests on the core pipeline + streaming route + no component/E2E infra
- **Where:** `lib/match.ts` `buildOpportunityMap`, `app/api/match/route.ts`, and 100% of the UI (no RTL/Playwright in devDependencies).
- **What:** The entry point that assembles every result — and the exact place C1's bug lives — has no test, mocked or otherwise; no journey is covered end-to-end.
- **Fix (Phase 3 test-build):** Unit-test `buildOpportunityMap` with mocked LLMs asserting *never fabricates / never false-excludes / streams milestones / degrades on aux failure*; NDJSON route parse tests; add Playwright (or RTL) + script the critical journeys.

### H7 · `generateQuestions` untested; the EVL-03 re-ask bug has no regression guard
- **Where:** `lib/interview/generateQuestions.ts`; the fixed `defense-hw-08` bug in `evals/EVL-03-results.md`.
- **Fix:** Hermetic unit tests for gate-first ordering + structured-escape invariants; a regression test that the ownership gate is not re-asked when the description states foreign ownership.

### H8 · Dark-mode badge/chip contrast is illegible (~1.4–1.9:1)
- **Where:** `bg-success/warning/info text-foreground` chips in `components/OpportunityCard.tsx`, `EligibilityBuckets.tsx`, `app/globals.css`; ships live via `prefers-color-scheme` (`darkMode:"media"`).
- **What:** Near-white text on fixed light semantic fills → tier badges on *every* card and every eligibility bucket badge are unreadable in OS dark mode.
- **Fix:** Give the semantic fills dark-mode token values (or fix the on-color) so badge text clears AA in both themes; add these pairings to `check:contrast`.

### H9 · Demo/precompute pipeline broken → the 5 judge cases are stale and bypass ELG-04
- **Where:** `scripts/4-precompute.mjs` calls `res.json()` on the now-NDJSON `/api/match`; `data/precomputed.json` matches have **no `eligibility` field**.
- **What:** The demo cases can't be regenerated and don't reflect the current pipeline (no eligibility buckets) — directly relevant to the hackathon demo.
- **Fix:** Update the script to read the NDJSON stream; regenerate the 5 cases so they include screening.

### H10 · CAN-04 rules are advisory-only — the DB rules never affect a bucket
- **Where:** `lib/eligibility/screen.ts` `fromEligibilityRule` sets no `predicate`; verified against `ELG-03-findings.md` (0 per-opp rules affected any of 160 determinations).
- **What:** Wiring the DB in today would change nothing; the 946 extracted rules are inert. (Safe per R8.4, but a large capability gap.)
- **Fix:** Add a predicate-structuring layer (or a reviewed-rule path) so per-opp rules can inform `conditional`/`unknown`. Scope carefully — must not enable model-inferred exclusion.

---

## MEDIUM (grouped — Phase 4)
- **Cost/robustness (backend):** no request cancellation (abandoned search still spends ~$0.22; thread `AbortSignal`); `explainWeakField` throw discards computed matches (`match.ts:186-189` — wrap in try/catch); `extractProfile` JSON-parse fragility (no repair/retry); `profile_extraction` still on sonnet vs the cheap-model routing contract; `BATCH=8` latency floor; redundant per-batch prompt tokens + no `cache_control`; no repeat-search/embedding cache; 83s progress dead-zone frozen at 52% (emit per-batch milestones).
- **Security:** denial-of-wallet (unauth'd, unthrottled `/api/match` + `/api/interview`, no max description length → cap length + rate-limit); prompt-injection envelope for the untrusted description (integrity-only blast radius; clamp score server-side).
- **Honesty/display:** freshness caveat computed but dropped before render (`OpportunityMap.tsx:107-115` + `annotateFreshness` called with no snapshot → always "stale"); `whyIneligible` is uncited model recall with a red accent (label it a model assessment).
- **Architecture:** billing tier has two sources of truth (`BillingProvider` vs `useEntitlements→getBillingTier`, non-reactive); completed runs never persisted (`ff.runs.v1` dead → reload loses the ~2-min result); eligibility bridge ignores the founder's own SAM/UEI (SAM-registered users still told to register); `OpportunityMap` never schema-validated at the API boundary; `CALIBRATION` drifted from `docs/calibration-baseline.md` (scoreFloor 30 vs "don't drop below ~38") with no audit trail.
- **UX/a11y (frontend):** `useDialogA11y` focus regression from unstable `onClose` dep; interview "generating" has no cancel/timeout; modals/drawer don't make the background `inert`; "unlocked" Auto Apply hint ("Included in your plan") contradicts the "not available yet" modal; description Delete wipes all versions with no confirm.
- **Tests:** `screen.ts` uei_required / certification fail-branch / unknown-outranks-conditional precedence untested; `universalRules.isSbirSttr()` regex; billing 3-tier→2-tier gating only tested at free default; `mockAuth.ts` (278 lines) untested; `/api/interview` "never 5xx" contract unverified; false-exclusion eval covers only 14/31 golden entries.

## LOW (polish — Phase 4)
Raw `err.message` leaked to client (names env vars); silent candidate loss on model id-drop; `explainMatches` output cast not schema-validated; no CSP/security headers; OAuth `next` redirect doesn't explicitly reject `//`; **alpha-on-token classes (`text-foreground/70`, `border-…/15`) render at full opacity in this Tailwind setup → muted text isn't actually muted** (login card/toggle, drawer divider); drawer accordion can't collapse the open section; Delete-my-data ≡ Close-account + lingering "cleared" message; SearchProgress live region announces rotating facts for 2 min; latent duplicate ids/radio-name in reused `SettingsForm`; sidebar-mode fixed hamburger overlaps hero at 360px; "Use this" overwrites typed text without the sample-pick confirm; `screen()` trusts the `provenance` label wholesale (no current mint path); SAM 21-day lead-time hard-coded; `geography_in.allowed_locations` declared but unimplemented.

---

## Phase 3 (Critical + High branch) — proposed scope
C1 (delete `ruleGate` exclusions) · H1 (dead-end error handling) · H2+H3 (two-pass scoring + timeout/partial-results — the same change fixes both) · H8 (dark-mode badge contrast) · H9 (regenerate demo cases) · H5 (mount analytics) · **H6+H7 (the test build: pipeline + route unit tests, generateQuestions + re-ask regression, and a Playwright journey harness)**. H4 (pgvector decision) and H10 (predicate layer) are High but larger/architectural — recommend a scoped decision with the user before implementing (may belong in a follow-up rather than the demo-hardening branch).

## Phase 4 (Medium + Low branch) — everything above under MEDIUM/LOW.
