# task-graph.md — fundFinder v2 dependency graph

**System of record: `tasks/*.md`** (owner decided 2026-08-15: no GitHub issues mirror).

Task IDs: `{TEAM}-{NN}-{slug}`. Teams (§6): CON Contracts · CAN Canon · INT Interview ·
ELG Eligibility · PIP Pipeline · PRF Perf · FE Frontend · VER Verification · ITL Intel ·
APL Apply · PLT Platform · EVL Evals. Detailed task **files** (`tasks/*.md`, §0.4 template)
are generated per slice as it's scheduled, to avoid churn from earlier slices' learnings;
this graph is the authoritative structure. Reflects recon (`as-built.md`, `hypothesis-check.md`,
`canon.md`) and the V-C/V-E decisions.

## Voided / re-scoped by recon (do NOT schedule as written)
- **R4b "parallelize independent live queries" (H1) — VOID.** No live grant queries on the
  request path; scoring is already concurrent.
- **R4b "split the monolithic prompt" (H3) — VOID.** Already a composed chain.
- **R4b real levers instead:** model routing (H2 confirmed, `PRF-02`), streaming (`PIP-01`/`PRF-03`),
  moving the *freshness check* onto a targeted request path (`CAN-05`), caching (`PRF-04`).
- **Canon §4.2 — not greenfield, not live-migration:** harden + broaden + *refresh* a thin static
  file corpus. Store stays a **server-side data file, no DB** (V-E).

---

## Slice 1 — Contracts + Canon foundation  *(blocks everything)*
| ID | Title | Depends | Blocks |
|---|---|---|---|
| CON-01 | Shared typed contracts module (§3: CompanyProfile+provenance, Opportunity, EligibilityDetermination, VerificationItem, ProgressEvent, OpportunityMap v-tag, Entitlements, RunBudget, AnalyticsEvent, Run, model-routing table) | none | ALL |
| CON-02 | Design-token contract + `no-raw-hex` lint (R7.2/7.6) | none | FE-* |
| CON-03 | Feature-flag infra, default-off per requirement (§8.2) | none | every slice's flag |
| CON-04 | Prompt registry: version + content hash, no inline prompts (R10.2) | none | INT/VER/PRF prompts |
| CON-05 | Eval-harness skeleton + golden-set schema hookup (w/ EVL) | CON-01 | EVL-01 |
| CON-06 | Install + pin R7.5 skill in tooling config | none | FE-* |
| CAN-01 | **Supabase Postgres + pgvector** corpus store: schema (Opportunity + embeddings + cited rules) + loader + snapshot version (V-E, R10.2) | CON-01 | CAN-02..07, retrieval |
| CAN-02 | Scheduled ingestion job (GitHub Action cron): grants.gov normalize→store (broaden v1 `scripts/`) | CAN-01 | CAN-05, freshness |
| CAN-03 | Source adapters: SBIR (awards now; solicitations when API up), SAM.gov entity/contracts (key), USAspending stub *(Q3 wiring deferred)* | CAN-02 | ELG rules, ITL |
| CAN-04 | Structured **eligibility-rule extraction w/ citations**; `model_inferred` marking (R8.4) | CAN-01 | ELG-01 |
| CAN-05 | Live freshness-check service (status/deadline on surfaced opps) + per-source circuit breaker + TTL cache (§4.3/4.4/4.6) | CAN-02 | ELG-02, PRF-06 |
| CAN-06 | Corpus versioning + data-age API + failed-sync alarm (§4.4) | CAN-01 | FE data-age, R10 |
| EVL-01 | Golden set (25–40 descs, ≥25% eligibility cases, TACA rubric, frozen/versioned) (§5.4) | none (parallel) | R1/R4b/R8 acceptance |
| EVL-02 | Regression gate + CI hook (§8.4) | CON-05, EVL-01 | merge gates |

**Critical path:** CON-01 → CAN-01 → CAN-04 (rules) → *(enables slice 2 ELG)*.
**Parallelizable:** CON-02, CON-03, CON-04, CON-06, EVL-01 run alongside CON-01; CAN-02/CAN-05/CAN-06 fan out after CAN-01.

## Slice 2 — R7 + R1 + R8 + R9.0 + R10.1  *(entry flow, rebuilt once)*
| ID | Title | Depends | Blocks |
|---|---|---|---|
| FE-01 | Apply USWDS 60/30/10 tokens; retire v1 custom palette (R7.2) | CON-02 | FE-02..05 |
| FE-02 | R7.1 sample picker: "See an example" button + list-item picker + **confirm before overwrite** (rebuild `IntakeForm.tsx`) | FE-01 | — |
| FE-03 | R1 interview UI: structured multi-select, skip-in-one-click, editable enriched desc; mobile (R7.4) | FE-01, INT-01 | search entry |
| FE-04 | R8 three-bucket display (eligible / conditional+steps / excluded-collapsed) | ELG-01 | — |
| FE-05 | Copy-honesty pass (R7.7) + a11y baseline (R7.6) + responsive (R7.4) | FE-01 | slice §9.1 |
| INT-01 | R1 question generation — cheap/fast model, <5s, routing-relevant, **gate-first** (R8) prompt | CON-01, CON-04 | FE-03, INT-02 |
| INT-02 | Answer→enriched-description merge w/ provenance | INT-01 | search |
| ELG-01 | Screening engine → EligibilityDetermination (3 buckets, unknown handling, never-drop) | CAN-04 | FE-04, ELG-02 |
| ELG-02 | Freshness in actionable set (uses CAN-05) | ELG-01, CAN-05 | — |
| ELG-03 | Unit/integration tests on rule evaluation (§8.4) | ELG-01 | merge |
| PLT-01 | R9.0 mock auth from `prompts/mock-auth-bundle.md`: place files, `NEXT_PUBLIC_MOCK_AUTH`, provider iface, consent-at-input (timestamped/off), "Delete my data", storage-fail degrade | CON-03 | — |
| PLT-02 | Tests: mock-auth gates nothing; **no server-side path retains descriptions** (recon assertion) | PLT-01 | R9.0 accept |
| PLT-03 | R10.1 funnel events (named, no description content), abandonment+elapsed | CON-01 | rollback triggers |
| EVL-03 | Blind interview with/without eval; R8 false-exclusion eval | EVL-01, INT-02, ELG-01 | R1/R8 accept |

**Critical path:** CAN-04 → ELG-01 → FE-04 ; INT-01 → INT-02.  **Parallel:** FE-01/FE-02, PLT-01/PLT-03.
**Rollback trigger (§8.2):** interview-completion < X% OR wait-abandonment > Y% (R10.1 events) → revert R1 flag.

## Slice 3 — R4 + R4b  *(one slice; Pipeline lands before Perf, §8.1)*
| ID | Title | Depends | Blocks |
|---|---|---|---|
| PIP-01 | Event-driven progress: SSE/stream transport + ProgressEvent emission wired **into** stages; failed/timed_out states | CON-01 | FE-06, PRF-* |
| PIP-02 | Partial results streaming (first matches <20s) + **cancel that aborts in-flight work & stops token spend** | PIP-01 | — |
| PRF-01 | **Waterfall profile** — instrument every call, publish p50/p95 baseline **before any opt** | PIP-01 | PRF-02..05 |
| PRF-02 | Model-routing enforcement (extraction/interview/triage→cheap; analysis→sonnet) per table (H2) | PRF-01 | — |
| PRF-03 | Stream synthesis tokens (TTFT <10s) | PIP-01 | — |
| PRF-04 | Caching: prompt/context; **per-user collision-safe** extraction/repeat cache; gov-API TTL | PRF-01 | — |
| PRF-05 | Token trimming (quality-neutral, golden-set verified) | PRF-01, EVL-01 | — |
| PRF-06 | RunBudget enforcement in executor + per-source circuit breakers | PRF-01, CAN-05 | — |
| PRF-07 | CI performance gate (p95 regression fails build) | PRF-01 | merge |
| FE-06 | R4 progress UI: **interruptible CSS-transition** bar, tabular elapsed timer, staggered partial results, failure states, live regions | PIP-01, CON-02 | — |
| EVL-04 | Latency+quality delta harness (every opt reports both) | EVL-01 | PRF merges |

**Critical path:** PIP-01 → PRF-01 → {PRF-02..06} → PRF-07.  **Parallel:** FE-06 with PRF opts; each PRF opt flags independently (§8.2).
**Acceptance (R4b):** p95 ≤ 60s medium desc, TTFT < 10s; no quality regression; cost/search reported.

## Slice 4 — R2  (verify-these-for-me)
| ID | Title | Depends | Blocks |
|---|---|---|---|
| VER-01 | Triage classifier (auto_verifiable/user_only/judgment), conservative bias (prompt registry) | CON-01, CON-04 | VER-02 |
| VER-02 | Search-backed verification: source link + retrieved-at ts; **allowlist-bounded fetch** (§5.5); fail→downgrade to user_only | VER-01 | — |
| VER-03 | Verification UI distinct from analysis (info-blue), batch + per-item | VER-02, CON-02 | — |
| EVL-05 | Classifier misclassification eval (user_only→auto_verifiable = primary metric) | EVL-01, VER-01 | accept |

## Slice 5 — R3  (enhance description)
| ID | Title | Depends | Blocks |
|---|---|---|---|
| INT-03 | Guided-rewrite modal (2–3 turns), live diff, reject-per-addition, **no invented facts** (flag unconfirmed inline), hard-exit-keeps-draft | CON-01, CON-02 | — |
| EVL-06 | R3 unsupported-claims eval | EVL-01, INT-03 | accept |

## Slice 6 — R9  (accounts + billing; ahead of R5/R6)
| ID | Title | Depends | Blocks |
|---|---|---|---|
| PLT-04 | Real Google OAuth behind AuthProvider iface; remove mock + flag | PLT-01 | — |
| PLT-05 | Server-side run persistence (migrate from localStorage), stable-URL revisit, re-run-with-diff, resumable interview | PLT-04, CON-01 | — |
| PLT-06 | Anonymous-run claim post-signup without re-run | PLT-05 | — |
| PLT-07 | Billing: tiers, **Entitlements server-side** (test: no Pro content in free payload), RunBudget per tier, downgrade behavior | PLT-04 | ITL/APL gating |
| PLT-08 | R10.2/R10.3 traces + prompt/corpus version per run (reproducibility) | CON-04, CAN-06 | — |

## Slice 7 — R5  (Pro: peer intelligence)
| ID | Title | Depends | Blocks |
|---|---|---|---|
| ITL-01 | Public award-data grounding (SBIR.gov + USAspending); per-company history from records only | CAN-03, PLT-07 | ITL-02 |
| ITL-02 | Differentiation brief; **org-not-people**; every claim sourced-or-omitted | ITL-01 | — |
| ITL-03 | Free(count-only)/Pro(named+analysis) gating via Entitlements | PLT-07 | — |

## Slice 8 — R6  (assisted apply — thin; last)
| ID | Title | Depends | Blocks |
|---|---|---|---|
| APL-01 | **S2S/portal feasibility MEMO** — re-verify current federal docs, legal-review gate (research, NO code; runs early/parallel) | none | APL-02 |
| APL-02 | Package builder for 2–3 pilot programs (forms, prefilled fields, drafts, checklist, deadlines) | APL-01, PLT-07 | — |
| APL-03 | **Review-and-attest** screen (field + provenance); human submits always; export/deep-link handoff | APL-02 | — |

---

## Cross-cutting (all slices)
- **EVL** owns the golden set + regression gate; measures interview lift, triage misclassification, R3 unsupported claims, R8 false exclusions.
- **CON** governs contract changes (orchestrator approval + broadcast; no team widens a shared type).
- **§8.3 escalation** standing stop-conditions apply to every task; **§9.1 human validation** gates slices 2, 3, and 8.
- **Free path never regresses; every Pro gate reads Entitlements server-side; no secret in client bundle** — asserted every slice.

## Overall critical path
CON-01 → CAN-01 → CAN-04 → ELG-01 → INT-02/FE-03 *(slice 2 ships)* → PIP-01 → PRF-01 → PRF opts *(slice 3 ships)* → R2 → R3 → PLT-04/07 *(R9)* → ITL *(R5)* → APL *(R6)*.
Golden set (EVL-01) is the long pole that must start on day 1 — it gates acceptance of R1, R4b, and R8.
