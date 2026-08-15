# Government Opportunity Finder

A founder describes their company in plain language. The system translates that into
federal government vocabulary, matches it against real opportunities, explains every
match — and says plainly when there isn't one worth chasing.

Built for the GOED bounty at AI Builder Day, Aug 15 2026.

## The thesis

Calibration is the product. Any team can return five matches for any input. The brief
explicitly rewards systems that say *"there probably isn't a strong match"* rather than
hallucinating one — and test case 5 is designed to catch teams that can't. The scoring
path here can return near-empty and explain why, and that path is a designed screen
(`weakFieldFinding`), not an error state.

## Setup

```bash
npm install
cp .env.example .env.local     # OPENAI_API_KEY is already in your ~/.zshrc
```

Two keys are needed:
- `OPENAI_API_KEY` — embeddings (`text-embedding-3-small`), build time and runtime
- `ANTHROPIC_API_KEY` — extraction and explanation (`claude-sonnet-4-6`)

## Build the data (run once, on your laptop)

```bash
npm run data:fetch       # ~3 min. Government APIs. Slow and occasionally flaky.
npm run data:normalize   # collapses every source into one schema
npm run data:embed       # ~1 min, well under $1
npm run dev
```

Then, once matching looks right:

```bash
npm run data:precompute  # freeze the five judged test cases
```

## Architecture

```
Government APIs  ──(scripts/1,2,3 — offline, on your laptop)──▶  data/*.json
                                                                     │
Founder input ──▶ extract + expand (Claude) ──▶ embed query (OpenAI) │
                                                      │              │
                                          rules gate ─┴─ cosine ─────┘
                                                      │
                                          top 30 candidates
                                                      │
                                          score + explain (Claude)
                                                      │
                                          calibration threshold
                                                   ╱      ╲
                                       matches            weak-field finding
```

The running app never calls a government API. Everything expensive happens offline.

**Hybrid intelligence layer, per the brief:** rules handle hard eligibility gates
(employee count, applicant type — binary facts embeddings get wrong), embeddings handle
vocabulary translation, Claude scores and writes explanations.

**No vector database.** A few thousand programs is an in-memory cosine loop returning in
single-digit milliseconds. Pinecone would cost two hours and buy nothing.

## Calibration

All the knobs are in `lib/match.ts`:

| Knob | Does |
|---|---|
| `candidateFloor` | minimum cosine similarity to be a candidate |
| `candidateCount` | how many candidates Claude scores |
| `scoreFloor` | minimum score to count as a real match |
| `weakFieldThreshold` | fewer strong matches than this → weak-field finding |

**Tune against all five test cases before touching the UI.** Case 5 must produce a
weak-field finding; cases 1–4 must not. Getting case 5 right by breaking case 1 is the
trap — check both directions after every change.

## Demo-day insurance

`npm run data:precompute` freezes all five test cases into `data/precomputed.json`. The
API route checks that cache first, so judges pasting a test case get an instant render
regardless of venue wifi. Novel input still takes the live path.

## Deploy

```bash
npx vercel
```

Add `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` in the Vercel project settings — your
`.zshrc` isn't visible to their build machines. `data/*.json` is committed and read-only
at runtime, which is exactly what Vercel wants.

## Design notes

The tier verdict is the spine — literally, a 3px colored bar on every card. Type is
Bricolage Grotesque for display, Inter for body, IBM Plex Mono for the data and codes
(institutional heritage, and it makes agency names and deadlines scannable).

The weak-field finding inverts to a dark panel. A founder being told "don't bother" should
feel like they received the most valuable answer in the product, not an apology.

## What's deliberately not built

Per the brief's own out-of-scope list: every federal agency, guaranteed eligibility, an
application system, every state program, production readiness, auth, or a vector DB.
