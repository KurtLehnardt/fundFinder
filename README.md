# Government Opportunity Finder

**fundFinder** is a research-to-action system for founders. Describe your company in plain language, and get back a "Government Opportunity Map" — federal funding and procurement opportunities you should know about, with plain explanations of why each fits (or doesn't). Most importantly: it says plainly when there *isn't* a strong match instead of hallucinating one.

Built for the GOED bounty at AI Builder Day, Aug 15 2026. Hackathon prototype — not production software.

**Live Demo:** [https://fund-finder-blush.vercel.app](https://fund-finder-blush.vercel.app)

## Why This Matters

Calibration is the product. Any system can return five matches for any input. The differentiator — and the brief's explicit scoring criterion — is willingness to say *"there probably isn't a strong match"* and explain why. That path is a designed screen, not an error. Test case 5 (Youth Marketplace) proves it: if your system fabricates matches for a marketplace that doesn't align with federal grant mechanics, you fail.

## Examples & Expected Outcomes

These five test cases are what the system is judged on. Each shows what a well-calibrated match should look like.

| Case | Company | Profile | Expected Outcome |
|------|---------|---------|------------------|
| **1. AI Healthcare** | Utah SaaS, 15 people, $1M ARR, raised $2.5M, seeking $500K–$2M | AI-powered software reducing admin burden for nurses; product development & hospital pilots | Strong matches: HHS, NIH, NSF, SBIR/STTR programs; healthcare IT, AI/R&D, workforce development; historical grant recipients in adjacent categories |
| **2. Advanced Manufacturing** | Utah hardware, 35 people, $3M revenue, raised $8M, seeking $2M–$5M | Lightweight aerospace components; manufacturing scale-up & R&D | Strong matches: DoD, NASA, DOE; procurement, R&D tax credits, aerospace suppliers; similar companies receiving federal awards |
| **3. Climate / Water** | Utah startup, 10 people, $500K revenue, raised $1.5M, seeking $500K–$3M | AI sensor platform reducing municipal water loss; product development & pilot deployments | Strong matches: DOE, EPA; water/environmental, infrastructure, climate tech; research funding + government procurement/pilot programs |
| **4. Cybersecurity** | Utah startup, 22 people, $2M ARR, raised $5M, seeking $1M–$3M | AI threat detection for SMBs; R&D & federal/commercial expansion | Strong matches: DoD, DHS; SBIR/STTR, federal procurement, cyber R&D; historical cybersecurity recipients |
| **5. Youth Marketplace** | Utah startup, 8 people, $750K revenue, raised $1M, seeking $250K–$1M | Marketplace connecting parents with local youth activities; expansion & tech development | **Honest "Probably Not a Fit"**: marketplace model doesn't align with federal grant mechanics. Redirect to SBA, state/local programs, workforce development, education, community development, youth programs, and Utah economic-dev resources. *This case differentiates the system.* |

## Run Locally

```bash
cd scaffold
npm install
```

Create `.env` with:
```
OPENAI_API_KEY=<your-key>
ANTHROPIC_API_KEY=<your-key>
```

Then:
```bash
# Build the government data (run once, ~5 min total)
npm run data:fetch       # Fetch from Grants.gov, SBIR.gov, USAspending
npm run data:normalize   # Collapse into one schema
npm run data:embed       # Embed all programs (~1 min, <$1)

# Run the app
npm run dev
```

For full details on the data pipeline, architecture, and calibration knobs, see [scaffold/README.md](scaffold/README.md).

## How It Works

1. **Founder intake** — Describe your company in natural language.
2. **Semantic expansion** — Translate startup language into government vocabulary (e.g., "software reducing admin burden on nurses" → healthcare IT, labor productivity, health systems, workforce development, clinical technology, AI/R&D).
3. **Hybrid retrieval** — Rules gate hard eligibility (employee count, applicant type, geography), embeddings translate vocabulary, LLM ranks and explains.
4. **Scored opportunity map** — Each match shows why it fits, what could disqualify you, similar companies funded, and next steps. Weaker matches are clearly marked. Weak-field findings are transparent: "this probably isn't a fit, and here's why — try these alternative sources instead."

No vector database. A few thousand programs run in-memory cosine similarity and return in single-digit milliseconds.

## Design Philosophy

- **Say no plainly.** Honesty is the differentiator.
- **Explain everything.** Every match includes "why you fit," "what could disqualify you," and "similar companies funded."
- **Translate government.** Founder language first; jargon only when necessary.
- **Calibrate ruthlessly.** Tune against all five test cases before shipping. Case 5 must return weak-field; cases 1–4 must not.

## Project Structure

```
.
├── README.md                    (this file)
├── scaffold/
│   ├── README.md               (data pipeline & architecture detail)
│   ├── lib/
│   │   ├── testCases.ts        (the five standard test cases)
│   │   └── match.ts            (calibration knobs: thresholds, scoring)
│   ├── docs/
│   │   └── bounty.md           (the GOED brief & rubric)
│   ├── scripts/
│   │   ├── 1-fetch.ts          (Grants.gov, SBIR, USAspending APIs)
│   │   ├── 2-normalize.ts      (collapse into one schema)
│   │   └── 3-embed.ts          (OpenAI embeddings, cached)
│   ├── data/
│   │   ├── *.json              (government data; committed to repo)
│   │   └── precomputed.json    (frozen test-case results for demos)
│   └── pages/api/match.ts      (runtime matching & explanation)
```

## Deployment

```bash
npx vercel
```

Set `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` in Vercel project settings. `data/*.json` is committed and read-only at runtime — the app never calls a government API live.

For demo-day insurance: `npm run data:precompute` freezes all five test cases, so judges get instant renders regardless of venue wifi.

---

**Built with:** Next.js, TypeScript, OpenAI (embeddings), Anthropic Claude (scoring & explanations).

**Acknowledgments:** GOED bounty brief, AI Builder Day 2026.
