# Calibration baseline & resume note (2026-08-14)

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
