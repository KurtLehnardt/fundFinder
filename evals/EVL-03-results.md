# EVL-03 results — blind interview + false-exclusion evals

**Run date:** 2026-08-15 · **Golden set:** `evals/golden-set.jsonl` (31 entries)
**Golden-set sha256 (live, this run):** `f79c6e579f39431cc2b48cc8073569e529473be796cf0af46041a5e7a4cb04e4`
**Frozen v1.0 sha256 (evals/README.md):** `f79c6e57…cb04e4` (full: `f79c6e579f39431cc2b48cc8073569e529473be796cf0af46041a5e7a4cb04e4`)
**Match:** YES — this run executed against the frozen v1.0 reference, unmodified.

## How to run

From the repo root (a `node_modules` symlink to `scaffold/node_modules` was added at the repo root
so `--import tsx` resolves from there — see "Environment note" below):

```bash
node --import tsx evals/interview-eval.mjs
node --import tsx evals/false-exclusion-eval.mjs
```

`interview-eval.mjs` makes live OpenAI calls (`gpt-4o-mini`, the funded `INTERVIEW_MODEL` —
never overridden) — one `generateQuestions()` call plus one judge call per entry, ~62 calls total,
takes a few minutes. `false-exclusion-eval.mjs` is pure logic, no network calls, runs in well under
a second.

**Exit-code convention:**
- `false-exclusion-eval.mjs` exits **0** only if the primary invariant (zero false exclusions) holds
  **and** its own sanity/R8.4/unknown-gate checks pass (a failure there means the harness itself is
  broken, not necessarily a product bug). It exits **1** if either fails.
- `interview-eval.mjs` exits **0** whenever it completes a full run over all 31 entries — a low pass
  rate is informative, not a harness failure, per the task's test plan ("a nonzero failure count is
  informative, not necessarily a script failure"). It exits **1** only on a hard setup failure
  (missing `OPENAI_API_KEY`, unreadable golden set).

**Environment note:** this worktree's repo root has no `package.json`/`node_modules` of its own
(only `scaffold/` does). `node --import tsx <script>` resolves the `tsx` loader relative to the
process's **current working directory**, not relative to the file being run — so invoking it from
the repo root with only `scaffold/node_modules` present fails with `ERR_MODULE_NOT_FOUND`. This
worktree's own claim in the task brief ("resolution follows the importing file's location") is true
for the `import "../scaffold/lib/..."` lines *inside* the scripts, but not for the `--import tsx` CLI
flag itself. Fixed locally by adding a gitignored `node_modules` symlink at the repo root
(`ln -s scaffold/node_modules node_modules`) so the documented invocation works exactly as written;
alternatively `cd scaffold && node --import tsx ../evals/<script>.mjs` works without the symlink. Not
a code bug — a repo-layout gap between two nominally-independent top-level directories (`evals/` and
`scaffold/`) that share no root package.json.

---

## Part (a) — `evals/interview-eval.mjs`

### Headline numbers (raw, unmodified script output)

| Metric | Value |
|---|---|
| Entries run | 31/31 (no `InterviewGenerationError`s, no judge-call failures) |
| Pass (zero violations across all checks) | **2/31 (6.5%)** |
| Average holistic "worth founder's time" score | **2.29/5** |
| Code-level gate-first violations | **0/31** |
| Code-level routing-relevant/structured violations | **0/31** |
| Judge-flagged "re-asks a stated fact" | 27/31 entries had ≥1 question flagged |

**Read this pass rate with the caveat below before treating 6.5% as a true quality measurement — see
"Judge reliability finding."** The two pure code-level regression checks (gate-first ordering;
routing-relevant + structured) passed on **every single entry, 31/31, zero violations** — every
recorded failure came from the LLM-judge check (re-asks and/or holistic score), and that judge has a
material false-positive problem documented below.

### What passed cleanly (not in doubt)

- `generateQuestions()` never threw an `InterviewGenerationError` and never timed out across 31 live
  calls.
- Gate-first ordering (`normalize()`'s `TARGET_RANK`/`GATE_RANK` sort) held on every entry that
  generated an `eligibility_gate` question — the lowest-priority question was always
  `eligibility_gate` first. Zero regressions.
- Every returned question had a valid `routing_target` enum value; every `single_select`/
  `multi_select` question had ≥1 option plus `allow_free_text: true`; every `free_text` question had
  zero options. Zero regressions.

### Judge reliability finding (important — read before trusting the 6.5% number)

I manually cross-checked the judge's "re-asks a stated fact" flag against the actual generated
questions and the actual golden-set description for **12 of the 31 entries** (chosen to cover the
range of failure patterns — see the entry list below). Findings:

1. **The judge's own explanations sometimes directly contradict its own flag.** Example —
   `health-it-01-ai-nurse-admin`: the model asked exactly two questions, both legitimate unstated
   gates (US ownership, SAM/UEI registration — the description never mentions either). The judge
   flagged both as `reasked_question_ids`, with the explanation: *"Both questions ask for information
   that is **not provided** in the description but are common requirements for federal funding
   applications."* That explanation argues AGAINST a re-ask, yet the question IDs were still placed in
   the re-ask list. The identical self-contradictory pattern ("not provided in the description" cited
   as the reason for a re-ask flag) recurs verbatim across at least `climate-03-water-loss-sensors`,
   `education-05-youth-activity-marketplace`, and several others — this looks like a systematic judge
   defect, not isolated noise.
2. **The judge flagged non-redundant ownership questions as "implied" on entries that explicitly say
   "US for-profit"** (`dualuse-sw-16-generic-ai-platform`, `climate-24-grid-battery`,
   `education-25-k12-edtech-forprofit`, `climate-29-agtech-precision`). This is a real miscalibration:
   the golden set itself teaches, via `defense-hw-08-foreign-owned-drone`'s own `taca_notes`, that
   **US incorporation/registration is explicitly NOT the same fact as majority US-citizen ownership**
   ("incorporation in the US is NOT the gate — ownership is"). A company can be a "US for-profit" and
   still be 70%-foreign-owned (that is literally what `defense-hw-08` is). So asking the ownership
   question on a "US for-profit" description is correct, gate-first behavior, not a re-ask — the judge
   scored it as a violation anyway.
3. One **genuinely correct** flag I confirmed: `defense-hw-08-foreign-owned-drone`'s description
   states *"70% owned by a foreign parent corporation... the remaining 30% is held by US-citizen
   employees"* — an explicit, unambiguous answer to the ownership gate — yet `generateQuestions()`
   still asked *"Is your company more than 50% owned AND controlled by US citizens or permanent
   residents?"* as its only question. This is a real, reproducible violation of `generateQuestions.ts`
   prompt rule 3 ("NEVER RE-ASK A STATED FACT... ownership... If it already states or clearly implies
   an answer, do NOT ask"). See "Bugs noticed, not fixed" below.

Given this, **I do not believe 6.5%/2.29-of-5 is a trustworthy measurement of true interview quality**
— it is inflated by a judge with a real false-positive rate on its primary check. A more reliable
signal from this run is the 0/31 code-level violation rate (gate-first + structured hold perfectly)
plus the small number of *manually confirmed* genuine issues below. I did not rewrite the judge mid-run
(the task asked me to run gpt-4o-mini as the judge and report what it says, not hand-tune it until it
agrees with me) — but the dispatcher should not take the 6.5% pass rate as a calibrated quality score
without accounting for this.

### Genuine findings from the manual audit (12/31 entries spot-checked)

Entries manually verified: `health-it-01`, `defense-hw-02`, `defense-hw-08`, `biotech-21`,
`climate-03`, `education-05`, `dualuse-sw-16`, `consumer-17`, `climate-20`, `climate-24`,
`education-25`, `climate-29`.

- **1 confirmed real re-ask violation:** `defense-hw-08-foreign-owned-drone` (detailed above) — asks
  the ownership gate the description already answers explicitly. Reproduction:
  `generateQuestions("SkySentry Systems builds fixed-wing surveillance drones. It is a US-registered
  company but 70% owned by a foreign parent corporation headquartered overseas; the remaining 30% is
  held by US-citizen employees. It is seeking federal R&D funding to mature its autonomy stack.")`
  returns a single question asking exactly the fact already stated.
- **1 mild relevance miss:** `climate-20-municipal-utility` — the description states the applicant is
  "a public utility owned by a city government" (entity type is unambiguous; the model correctly did
  NOT ask an entity_type question). But it then asked the SBIR-flavored ownership gate ("more than 50%
  owned and controlled by US citizens or permanent residents") — a question that doesn't
  meaningfully apply to a government entity (SBIR's individual-citizen-ownership test isn't the right
  frame for a municipal owner). Minor, not a hard rule violation, but a real Alignment-axis miss (asks
  a question the founder can't really answer usefully).
- **A recurring low-confidence pattern (not a rule violation, a design nit):** on most `detailed`
  entries with an explicit headcount well under 500 (e.g. "10-person," "18-person," "28-person"), the
  model still asks "does your company have 500 or fewer employees, including affiliates?" This is not
  technically a re-ask (the ≤500-with-affiliates test is a different, stricter fact than the raw
  headcount alone), but it reads as low-value to a founder who already said their headcount is nowhere
  near the cap. Occurs on `climate-03`, `education-05`, `dualuse-sw-16`, `climate-24`, `education-25`,
  `climate-29`, `defense-hw-02`, and (per the raw judge output, not manually re-verified) likely others
  in the failing set. Worth Team Interview's attention as a prompt-tuning opportunity, not a
  correctness bug.

### Full failing-entry list (raw judge output, unmodified — see caveat above)

All 29 failing entries and their recorded violation(s) are reproduced verbatim from the script's own
stdout below (entries not listed — `climate-10-phase2-no-phase1`,
`climate-defense-15-ambiguous-microgrid` — passed with zero violations):

```
health-it-01-ai-nurse-admin: re-asks q1,q2 (MANUALLY VERIFIED: judge false positive — see above)
defense-hw-02-aero-manufacturing: re-asks q1,q2,q3; score 1/5
climate-03-water-loss-sensors: re-asks q1,q2,q3; score 1/5 (MANUALLY VERIFIED: judge false positive on q1/q3)
dualuse-sw-04-cyber-threat-detection: re-asks q1,q2,q3; score 1/5
education-05-youth-activity-marketplace: re-asks q1,q2,q3; score 1/5 (MANUALLY VERIFIED: judge false positive on q1/q3)
biotech-06-precision-onco-therapeutic: re-asks q1,q3
biotech-07-nonprofit-research-institute: re-asks q1,q3
defense-hw-08-foreign-owned-drone: re-asks q1 (MANUALLY VERIFIED: genuine violation)
health-it-09-no-sam-registration: re-asks q1,q3
education-11-university-ed-research: re-asks q1,q2,q3; score 1/5
dualuse-sw-12-oversized-firm: re-asks q2,q3; score 2/5
biotech-13-solo-founder-no-entity: re-asks q1,q3; score 2/5
biotech-14-sttr-no-research-partner: re-asks q1,q2
dualuse-sw-16-generic-ai-platform: re-asks q1,q2,q3; score 1/5 (MANUALLY VERIFIED: judge false positive on q1/q3)
consumer-17-dating-app: re-asks q1,q2,q3; score 1/5 (MANUALLY VERIFIED: judge false positive — entity type and ownership are NOT stated)
health-it-18-one-line-vague: re-asks q1
climate-19-one-line-vague: re-asks q1
climate-20-municipal-utility: re-asks q1,q2; score 1/5 (MANUALLY VERIFIED: q1 is a relevance miss not a clean re-ask; q2 SAM/UEI is a legitimate question)
biotech-21-tribal-enterprise: re-asks q1 (MANUALLY VERIFIED: judgment call, not clean-cut — tribal ownership doesn't obviously equal individual-citizen ownership per the golden set's own note on this entry)
defense-hw-23-hypersonics-materials: re-asks q1,q2
climate-24-grid-battery: re-asks q1,q2,q3; score 1/5 (MANUALLY VERIFIED: judge false positive on q1/q3)
education-25-k12-edtech-forprofit: re-asks q1,q2,q3; score 1/5 (MANUALLY VERIFIED: judge false positive on q1/q3)
dualuse-sw-26-ml-infrastructure: re-asks q1,q2
health-it-27-telehealth-medium: re-asks q1,q2,q3
biotech-28-ai-drug-discovery-ambiguous: re-asks q1,q2
climate-29-agtech-precision: re-asks q1,q2,q3; score 1/5 (MANUALLY VERIFIED: judge false positive on q1/q3)
defense-hw-30-us-incorporated-foreign-founder: re-asks q1
defense-hw-31-closed-solicitation-freshness: re-asks q1,q2; score 2/5
defense-hw-32-one-line-vague: re-asks q1
```

Entries not manually re-verified (17 of the 29 failing entries) are reported as the judge produced
them — treat with the same skepticism established above; a full manual re-audit of all 31 was out of
time budget for this task but would be the natural next step before trusting this metric for a
regression gate.

---

## Part (b) — `evals/false-exclusion-eval.mjs`

**PRIMARY METRIC: 0 false exclusions.** Exit code 0.

### Scope

The ~14 golden-set entries with an `excluded` or `conditionally_eligible` sub-bucket
(`evals/README.md`'s "Eligibility cases" table): `health-it-01`, `defense-hw-02`, `biotech-06`,
`biotech-07`, `defense-hw-08`, `health-it-09`, `climate-10`, `education-11`, `dualuse-sw-12`,
`biotech-13`, `biotech-14`, `climate-20`, `education-25`, `defense-hw-31`.

### Entity-type mapping (golden set → `CompanyProfile.EntityType`)

| golden `entity_type` | `CompanyProfile` `EntityType` | notes |
|---|---|---|
| `for_profit_small_business` | `for_profit_small_business` | direct |
| `nonprofit` | `nonprofit` | direct |
| `institution_of_higher_education` | `higher_education` | rename |
| `state_or_local_government` | `state_or_local_government` | direct |
| `tribal_entity` | `tribal` | rename |
| `individual` | `individual` | direct |
| `foreign_owned_entity` | `for_profit_small_business` + `us_owned: false` | two facts — ownership, not entity type, is what excludes it |
| `unknown` | *(field omitted)* | `CompanyProfile.entity_type` is optional; "not stated" = absent, there is no "unknown" enum value |

### Results summary

| Section | Pass | Fail | Skip |
|---|---|---|---|
| Sanity (verified rule → `excluded`) | 7 | 0 | — |
| R8.4 (same rule, `model_inferred` → never `excluded`) | 7 | 0 | — |
| R8.4 via the real universal overlay (no hand-built rule) | 2 | 0 | — |
| **Primary metric (zero false exclusions)** | **5** | **0** | — |
| Supplementary unknown-gate (one-line-vague, entity_type omitted) | 3 | 0 | — |
| Skipped (no matching `RulePredicate` without inventing one) | — | — | 5 |

**Zero false exclusions found. Zero harness sanity/R8.4/unknown-gate failures.** All 7 sanity cases
correctly excluded on a verified rule (confirming the harness can trigger real exclusions, not a
vacuously-green suite); all 7, when the identical rule was downgraded to `model_inferred`, correctly
flipped to `unknown` (R8.4 held on every hand-built case); the 2 cases exercised purely through the
real universal overlay (`defense-hw-08`'s foreign ownership, `dualuse-sw-12`'s 800-employee count) also
correctly rendered `unknown`, matching `screen.test.ts`'s own equivalent tests; all 5 non-exclusion
primary-metric cases (`health-it-01`, `defense-hw-02`, `health-it-09` ×2, `biotech-13`) stayed out of
`excluded`; all 3 supplementary unknown-gate cases (bare profile against an SBIR-flavored opportunity)
correctly rendered `unknown`, never a guess.

### Skipped entries (5) — no existing `RulePredicate` fits without inventing one

| Entry | Program | Reason |
|---|---|---|
| `biotech-06-precision-onco-therapeutic` | NIH STTR | STTR partnering-institution + 30/40 work-split requirement has no `CompanyProfile` field ("has a partnering research institution") and no `RulePredicate` shape fits it. |
| `biotech-14-sttr-no-research-partner` | STTR | Same as above. |
| `climate-10-phase2-no-phase1` | Direct-to-Phase-II (DoD/NIH) | Whether a solicitation offers DtP2 authority is program-level information, not a `CompanyProfile` fact about the applicant. |
| `defense-hw-08-foreign-owned-drone` | DoD/IC procurement | FOCI mitigation availability is topic/program-specific security-clearance information, not a `CompanyProfile` fact. |
| `defense-hw-31-closed-solicitation-freshness` | Named prior-year topic (if closed) | This is an R8.3 solicitation freshness/status exclusion (closed vs. open), not a `CompanyProfile` eligibility gate — every `RulePredicate` kind evaluates a company fact, none evaluate opportunity status. Out of scope for `screen()` entirely. |

None of these were force-mapped and no new `RulePredicate` kind was added to `screen.ts` (out of
scope, owned by Team Eligibility).

### Notable caveat carried over from `evals/README.md`

`education-25-k12-edtech-forprofit`'s rule citation (the claim that ED/IES operates an SBIR program)
is flagged in the README as **PENDING owner verification**, not yet independently re-confirmed against
a primary source. It was still modeled in the sanity/R8.4 pair here — that exercises the engine's logic
only, not a claim that the underlying federal rule text is confirmed.

---

## Bugs noticed, not fixed (owned by other teams, out of scope per the task)

1. **`generateQuestions.ts` — confirmed re-ask violation on `defense-hw-08-foreign-owned-drone`.** The
   description states majority (70%) foreign ownership explicitly; `generateQuestions()` still asks the
   US-ownership gate question verbatim. Violates the prompt's own rule 3 ("NEVER RE-ASK A STATED
   FACT"). Reproduction is in the "Genuine findings" section above. Not fixed — `generateQuestions.ts`
   is owned by Team Interview.
2. **`generateQuestions.ts` — mild relevance miss on `climate-20-municipal-utility`.** Correctly skips
   an entity_type question (entity type is unambiguous from the description) but then asks the
   SBIR-flavored individual-ownership gate on a municipal-government applicant, where that framing
   doesn't really apply. Not fixed — same file, same team.
3. **No bugs found in `screen.ts`.** All 24 checks across sanity/R8.4/primary-metric/unknown-gate
   passed; the false-exclusion primary metric is clean at 0.

## Harness limitation I'm flagging on myself (not a product bug)

The interview-eval's LLM judge (`gpt-4o-mini`, per the task's own choice of judge model) has a material
false-positive rate on its "re-asks a stated fact" check, including several self-contradictory
explanations (see "Judge reliability finding" above). I did not modify the judge to make it agree with
my own reading mid-run — the task called for running it and reporting what it says — but the raw
6.5% pass rate / 2.29-of-5 average score should not be read as a calibrated interview-quality number
without the manual-audit context above. A tighter judge prompt (e.g. requiring the judge to quote the
exact sentence from the description it believes answers each flagged question, which would have caught
the "not provided in the description... reasked" self-contradictions mechanically) would be the natural
next iteration — out of scope to build here since the task specified `gpt-4o-mini` as the judge and
asked for its output, not a redesign of the judge.
