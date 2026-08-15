# Calibration baseline & resume note (2026-08-14)

## CURRENT SHIPPED CALIBRATION (2026-08-15 — supersedes the baseline below)

`lib/match.ts` `CALIBRATION` now ships:

| knob | shipped | old baseline (below) |
|---|---|---|
| candidateFloor | **0.22** | 0.28 |
| candidateCount | **24** | 12 |
| scoreFloor | **30** | 45 |
| weakFieldThreshold | **1** | 2 |

**Why the retune (audit trail — this section is the reconciliation the arch
review asked for):** the baseline below diagnosed cases 1 (AI-healthcare) and 4
(cyber) as *starved* — false weak-fields — because `candidateCount 12` scored too
few candidates and `scoreFloor 45` sat above where real-but-thin matches land
(the AI-health NIH match scores ~35–72 across runs). The shipped values follow
the baseline's own "Next steps" direction (raise candidateCount toward the
scaffold default, lower candidateFloor) and additionally drop `scoreFloor` to 30
and `weakFieldThreshold` to 1 so a single genuine strong match (case 1) is no
longer mislabeled a weak field, while staying well clear of case 5's ~22 score
ceiling (so case 5 stays a correct honest-no). See the `CALIBRATION` doc comment
in `lib/match.ts` for the per-knob rationale.

**The old "keep scoreFloor at 45 … do NOT drop below ~38" and
"weakFieldThreshold=2" guidance in the baseline below is SUPERSEDED** — it
predates this retune and no longer describes what ships.

**OUTSTANDING (not done in this pass):** these shipped values were validated
against the 5 demo cases but NOT re-validated end-to-end against the full 31-entry
`evals/golden-set.jsonl`. A full golden-set re-validation (per "How to re-measure"
below — ~10 min, spends live API keys, needs the dev server on :3001) is the
remaining audit step before treating the current numbers as golden-set-verified.
Whoever next changes `CALIBRATION` must update THIS section in the same commit.

## Environment gotcha (IMPORTANT)
Port **3000 is taken by Grafana** on this machine, so `next dev` binds **:3001**.
- Test the app at `http://localhost:3001`, NOT :3000.
- `scripts/4-precompute.mjs` hardcodes `localhost:3000` → it must be pointed at :3001
  (or free port 3000) before precompute, or it will hit Grafana and get 401s.

## Baseline (knobs: candidateFloor 0.28 / candidateCount 12 / scoreFloor 45 / weakFieldThreshold 2)
Measured live against :3001, corpus = 476 grants.gov opportunities (SBIR solicitation
API down; no procurement data).

| Case | Strong | Weak-field | Verdict | Top signal |
|---|---|---|---|---|
| 1 AI-healthcare | 1 | YES | too thin (should be 3-7); false weak-field | NIH SBIR 52, ONC 38 (right agencies) |
| 2 Manufacturing | 2 | no | passes | NSF Adv Mfg 52, Air Force Aerospace 45 |
| 3 Water | 2 | no | passes | NSF Infrastructure 52, NSF Sensing 48, Reclamation, EPA |
| 4 Cyber | 1 | YES | too thin; false weak-field | Army BAA 62 (right) |
| 5 Marketplace | 0 | YES | CORRECT — honest weak-field, all "none" | max score 22 |

## Diagnosis
- Case 5 (the differentiator) is already correct and stable.
- Cases 1 & 4 are starved. Prior worker lowered `candidateCount` 30→12, so Claude only
  scores 12 candidates. Real matches cluster at scores 45-62 with a cliff to <=28; there
  simply aren't enough scored candidates clearing scoreFloor=45.

## Next steps (resume here)
1. First lever: raise `candidateCount` 12 → 30 (restore scaffold default). Re-measure all 5.
2. If cases 1/4 still thin: lower `candidateFloor` 0.28 → ~0.24 to admit more candidates.
3. Keep scoreFloor at 45 (case-5 max is 22 — comfortable margin; do NOT drop below ~38).
4. weakFieldThreshold=2 is fine IF cases 1-4 reach >=2 strong. Watch case 1/4 specifically.
5. CHECK BOTH DIRECTIONS every pass — case 5 must stay weak-field (0 strong).
6. When all five behave (1-4 have real strong matches w/ right agencies; 5 weak-field),
   run precompute (remember :3001 port fix), then ship.

## How to re-measure (driver)
`scripts/dev-calibrate.mjs` posts all 5 test-case texts to the running dev server and
prints strong-match counts + top matches + weak-field flag per case. Usage:
```
npm run dev              # binds :3001 (Grafana holds :3000)
node scripts/dev-calibrate.mjs   # targets :3001
```
Each case is a live Claude round-trip (~2 min); a full pass is ~10 min and spends the
app's ANTHROPIC + OPENAI API keys.
