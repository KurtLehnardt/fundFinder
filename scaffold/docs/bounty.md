# AI Builder Day 2026 — Build Guide

| Criterion | Weight |
|---|---|
| Usefulness | **30%** |
| Quality of Matching | 25% |
| Intelligence & Insight | 20% |
| User Experience | 15% |
| Technical Execution | 10% |

### Build prompt

```
Build a "Government Opportunity Finder" prototype for a hackathon.
Deliverable: working proof of concept. Rubric: Usefulness 30%, Quality of
Matching 25%, Intelligence & Insight 20%, UX 15%, Technical Execution 10%.

GOAL: a founder describes their company in plain language and gets back a
"Government Opportunity Map" — what federal resources they should know about,
and WHY. Not a database. Not a search engine. The brief's own framing: a
search engine answers "what grants contain the word AI?"; this must answer
"I'm an AI healthcare startup in Utah with 15 employees, $1M ARR and a $2M
R&D need — what should I know about?"

CORE THESIS — CALIBRATION: the differentiating behavior is willingness to
say "there probably isn't a strong match." The brief states explicitly that
it will reward systems that say this rather than hallucinating a match.
The ranking function must be able to return near-empty and explain why.

=== NON-GOALS (do not build these; the brief lists them as out of scope) ===
- Integrating every federal agency
- Guaranteeing eligibility
- A complete application system
- Every state program
- A production-ready platform
- Scraping every government website
- A "perfect" recommendation engine
Do not spend time on data engineering. The brief says a compelling prototype
using 2-4 high-quality sources beats superficial integration of everything.

=== DATA (cache locally FIRST — no live API calls during the demo) ===
Priority order. Ship the first three well before adding others.
1. Grants.gov search2 endpoint (no auth) — current + FORECASTED opportunities,
   agencies, funding categories, eligibility, deadlines, descriptions
2. SBIR.gov — solicitations, topics, awards, companies, technology areas
3. USAspending.gov API V2 (no auth) — recipients, agencies, award types,
   geography, NAICS codes, amounts
If time allows:
4. SAM.gov Federal Assistance Listings API (new 2026) — the broader universe:
   grants, loans, scholarships, insurance, program descriptions, eligibility
5. SAM.gov Contract Opportunities — current federal procurement. Needed
   because the government can be a CUSTOMER, not just a funder, and test
   cases 2, 3 and 4 expect procurement results.
6. Optional Utah data — state economic development, innovation programs,
   university programs, local programs, Utah procurement. Worth caching a
   small set specifically to make the test-case-5 redirect concrete.

=== ARCHITECTURE ===
Government Data
  -> NORMALIZATION into one schema:
     agency | program | opportunity | eligibility | funding_range |
     deadline | industry_tags | geography | historical_awards
  -> INTELLIGENCE LAYER: hybrid. Use keyword search AND rules AND embeddings
     AND LLM reasoning together. Do not rely on embeddings alone — rules
     handle hard eligibility gates (small business status, US-based, employee
     count), embeddings handle vocabulary translation, the LLM writes the
     explanation and catches what neither caught.
  -> MATCHING / RANKING
  -> FOUNDER EXPERIENCE: recommendations + explanations + next steps

=== PIPELINE ===
1. INTAKE. Founder describes the company in natural language. Extract:
   company description, industry, technology, location, employees, revenue,
   funding stage, capital raised, R&D activities, product maturity, target
   customers, capital requirements, use of funds.
2. ADAPTIVE FOLLOW-UP. "The system asks only the questions it needs." Ask
   ONLY for fields both missing and material to matching. Never re-ask
   something already stated. Cap at 2-3 questions.
3. SEMANTIC EXPANSION — the technical heart of the challenge. Translate
   startup language into government language. The brief's own example:
   "software that reduces the administrative burden on nurses" must reach
   healthcare, AI, workforce development, health IT, hospital operations,
   labor productivity, digital health, and clinical technology. Expand into
   agency vocabulary, program classifications, NAICS codes, and statutory
   eligibility categories.
4. MATCH + RANK against the normalized corpus.
5. CLASSIFY into exactly these four tiers:
   Likely Fit | Potential Fit - Verify Eligibility | Adjacent Opportunity |
   Probably Not a Fit
6. EXPLAIN (see output spec).

=== OUTPUT: "Your Government Opportunity Map" ===
Summary header first:
   N high-potential opportunities | $X+ potential funding identified |
   N relevant agencies | N closing within 90 days

Then opportunity cards, each containing IN THIS ORDER:
   Program | Agency | Potential value (range) | Deadline
   - Match score with a VISIBLE criteria checklist, e.g.
     92% Match: US-based small business / AI technology / healthcare
     application / active R&D component / commercialization potential /
     funding requirement consistent with the program
   - Why we think you're a fit
   - What could make you ineligible      <- MANDATORY, real content
   - What you should verify
   - Similar companies funded            <- historical award intelligence
   - What to do next (application / registration / contact / research)

HISTORICAL INTELLIGENCE BELONGS ON EVERY CARD, not in a side panel. From
USAspending + SBIR, for each opportunity: N companies with similar
technologies, total historical awards, median award, N recipients in Utah,
N in the same vertical, and a table of Company / Program / Agency / Amount /
Year. The brief calls this the line between a grant search engine and real
intelligence.

ALSO SURFACE:
- AGENCY INTELLIGENCE: which federal agencies matter most to this company
  and why.
- ADJACENT / UNEXPECTED OPPORTUNITIES: things the founder would never have
  searched for. Explicitly scored under Intelligence.
- PROCUREMENT: federal agencies that buy what this company sells.

HARD CONSTRAINT: never present an AI-generated assessment as a definitive
determination of eligibility. Hedged language throughout ("you may fit",
"appears to align", "verify with the program officer"). The "what could
make you ineligible" section must contain specific, real concerns — never
boilerplate.

UX: minimal government jargon. Translate bureaucracy into founder language
everywhere. Simple, fast, clear information hierarchy. A founder should
understand the whole map in 30 seconds.

=== ACCEPTANCE CRITERIA: the five standard test cases ===
Every team is judged on the same five. Pre-compute and HAND-VERIFY each.
Listed with what the brief says it wants to see.

1. AI HEALTHCARE — Utah SaaS, 15 employees, $1M ARR, raised $2.5M, needs
   $500K-$2M for product development and hospital pilots.
   Expect: healthcare opportunities, AI/R&D opportunities, SBIR/STTR,
   workforce-related opportunities, relevant HHS/NIH/NSF programs,
   historical recipients.

2. ADVANCED MANUFACTURING — Utah hardware, 35 employees, $3M revenue,
   raised $8M, needs $2M-$5M for manufacturing scale-up and R&D.
   Expect: manufacturing, aerospace/defense, DoD/NASA/DOE programs, R&D
   programs, PROCUREMENT opportunities, similar companies receiving awards.

3. CLIMATE / WATER — Utah, 10 employees, $500K revenue, raised $1.5M, needs
   $500K-$3M for product development and municipal pilots.
   Expect: water/environmental programs, DOE/EPA opportunities, climate
   technology, infrastructure programs, research funding, government
   procurement/pilot opportunities.

4. CYBERSECURITY — Utah, 22 employees, $2M ARR, raised $5M, needs $1M-$3M
   for R&D and federal/commercial expansion.
   Expect: cybersecurity programs, DoD/DHS opportunities, SBIR/STTR,
   federal procurement, historical cybersecurity recipients.

5. YOUTH-ACTIVITIES MARKETPLACE — Utah, 8 employees, $750K revenue, raised
   $1M, needs $250K-$1M for expansion and technology development.
   INTENTIONALLY HARDER. The brief says the correct answer may be that
   traditional federal grants are a poor fit. This case MUST NOT return
   fabricated strong matches. Correct behavior: mostly "Probably Not a Fit",
   an honest explanation of why this company profile doesn't align with
   federal grant mechanisms, and a redirect toward the categories the brief
   names — workforce development, education, youth programs, small business,
   local/community development, technology, economic development — plus
   state/local/Utah programs and SBA resources where those genuinely fit.

=== BONUS (only after the core works) ===
Opportunity alerts, similar-company discovery, 12-month funding strategy,
agency map, opportunity graph (startup -> technology -> agency -> program ->
award -> similar companies -> application), application assistant with
checklist and required registrations.

```

### Demo beats
1. Paste the AI-healthcare description → Opportunity Map with 5–7 scored matches.
2. Open one match → the four-part explanation, especially the ineligibility section.
3. **Paste case 5 → system returns "Probably Not a Fit" with reasoning.** Pause here.
4. Close on the redirect: here's where this founder *should* look instead.
