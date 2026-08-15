import Anthropic from "@anthropic-ai/sdk";
import type { StartupProfile, Opportunity, Match, CriterionCheck, Tier } from "./types";

const MODEL = "claude-sonnet-4-6";

function client() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env.local and to your Vercel project settings.");
  return new Anthropic({ apiKey: key });
}

/** Strip markdown fences some models add around JSON. */
function parseJson<T>(raw: string): T {
  const clean = raw.replace(/```json/g, "").replace(/```/g, "").trim();
  return JSON.parse(clean) as T;
}

/**
 * Stage 1 — intake. Pull structured fields out of the founder's description,
 * expand into government vocabulary, and ask only for what's still missing.
 */
export async function extractProfile(description: string): Promise<{ profile: StartupProfile; followUps: string[] }> {
  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: `You extract structured company profiles for a federal funding matcher.

Return ONLY a JSON object, no preamble, no markdown fences:
{
  "profile": {
    "description": string,
    "industry": string, "technology": string, "location": string,
    "employees": number|null, "revenue": string|null, "fundingStage": string|null,
    "capitalRaised": string|null, "rdActivities": string|null,
    "productMaturity": string|null, "targetCustomers": string|null,
    "capitalRequirement": string|null, "useOfFunds": string|null,
    "expandedTerms": string[], "naicsGuesses": string[]
  },
  "followUps": string[]
}

expandedTerms is the most important field. Translate the founder's own words
into the vocabulary the federal government actually uses — agency program
language, statutory eligibility categories, funding mechanisms. Example:
"software that reduces the administrative burden on nurses" should expand to
healthcare, artificial intelligence, workforce development, health information
technology, hospital operations, labor productivity, digital health, clinical
technology. Produce 10-20 terms.

followUps: at most 3 questions, ONLY for fields that are both missing and
material to matching. Never ask for something the founder already stated.
Return an empty array if the description is complete enough.`,
    messages: [{ role: "user", content: description }],
  });

  const text = msg.content.filter((c) => c.type === "text").map((c: any) => c.text).join("");
  return parseJson(text);
}

/**
 * Stage 2 — explain. Given candidate opportunities that already passed rules
 * and similarity, score each and write the four-part explanation.
 */
export async function explainMatches(
  profile: StartupProfile,
  candidates: Opportunity[]
): Promise<Array<{ id: string; score: number; tier: Tier; criteria: CriterionCheck[]; whyFit: string; whyIneligible: string; whatToVerify: string; whatToDoNext: string }>> {
  const SYSTEM = `You assess fit between a startup and federal funding opportunities.

Return ONLY a JSON array, no preamble, no markdown fences:
[{
  "id": string,
  "score": number,          // 0-100
  "tier": "likely"|"verify"|"adjacent"|"none",
  "criteria": [{"label": string, "met": boolean, "note": string}],
  "whyFit": string,
  "whyIneligible": string,
  "whatToVerify": string,
  "whatToDoNext": string
}]

RULES THAT MATTER MORE THAN COVERAGE:

1. You are NOT determining eligibility. Never state a definitive
   determination. Use "appears to align", "you may qualify", "verify with the
   program officer". This is required.

2. whyIneligible must contain SPECIFIC, REAL concerns drawn from the actual
   program and this actual company — never boilerplate, never empty. If you
   cannot name a concrete concern, the match is weaker than you scored it.

3. BE WILLING TO SAY NO. A company that does not fit federal grant mechanisms
   should receive "none" tiers and low scores. Fabricating plausible-sounding
   matches is the single worst failure mode here. Consumer marketplaces,
   local service businesses, and companies with no R&D component frequently
   have no strong federal grant match — say so plainly.

4. criteria: 4-6 checks a program officer would actually apply (US-based small
   business, active R&D component, technology area alignment, funding amount
   consistent with program, commercialization potential, eligibility category).
   Mark met honestly. Unmet criteria are informative, not failures to hide.

5. Write for a founder, not a bureaucrat. Plain language. No jargon left
   untranslated.`;

  type Assessment = { id: string; score: number; tier: Tier; criteria: CriterionCheck[]; whyFit: string; whyIneligible: string; whatToVerify: string; whatToDoNext: string };

  // Score in parallel batches. A single serial call over all candidates emits
  // ~700-900 output tokens each and dominates request latency (~3 min for 24
  // candidates); concurrent batches cut wall-clock ~3x with identical per-
  // candidate scoring. max_tokens per batch stays well clear of truncation.
  const BATCH = 8;
  const groups: Opportunity[][] = [];
  for (let i = 0; i < candidates.length; i += BATCH) groups.push(candidates.slice(i, i + BATCH));

  const scoreGroup = async (group: Opportunity[]): Promise<Assessment[]> => {
    const msg = await client().messages.create({
      model: MODEL,
      max_tokens: 8000, // ~900/assessment * 8 = 7200, fits with margin
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `COMPANY:\n${JSON.stringify(profile, null, 2)}\n\nCANDIDATE OPPORTUNITIES:\n${JSON.stringify(
            group.map((c) => ({
              id: c.id, program: c.program, agency: c.agency, kind: c.kind,
              description: c.description.slice(0, 1200), eligibility: c.eligibility,
              fundingLow: c.fundingLow, fundingHigh: c.fundingHigh, deadline: c.deadline,
            })),
            null, 2
          )}`,
        },
      ],
    });
    const text = msg.content.filter((c) => c.type === "text").map((c: any) => c.text).join("");
    return parseJson<Assessment[]>(text);
  };

  // Fault-tolerant: keep whatever batches succeed. One batch throwing or
  // emitting non-JSON must not discard the others (and their spend). Only fail
  // the whole request if every batch fails.
  const settled = await Promise.allSettled(groups.map(scoreGroup));
  const ok = settled
    .filter((s): s is PromiseFulfilledResult<Assessment[]> => s.status === "fulfilled")
    .map((s) => s.value);
  if (ok.length === 0) {
    const firstErr = settled.find((s) => s.status === "rejected") as PromiseRejectedResult | undefined;
    throw new Error(`All scoring batches failed: ${firstErr?.reason?.message ?? "unknown error"}`);
  }
  return ok.flat();
}

/**
 * Stage 3 — the honest no. Called when nothing clears the bar.
 * This is the highest-value output in the whole product.
 */
export async function explainWeakField(profile: StartupProfile) {
  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: 1200,
    system: `A startup has no strong federal grant matches. That is a legitimate
and useful finding — deliver it with confidence, not apology.

Return ONLY JSON, no fences:
{
  "headline": string,      // one sentence, direct
  "reasoning": string,     // 2-4 sentences: why this company profile does not
                           // align with how federal grant mechanisms work
  "redirects": [{"label": string, "why": string}]  // 3-5 concrete alternatives
}

Redirects should be specific and real: SBA programs, state economic
development, local/community development, workforce and education funding,
procurement as a government customer, university partnerships. Name the
category and say why it fits better than federal R&D grants.

Do not hedge into implying they should apply anyway. The value here is saving
them weeks of wasted applications.`,
    messages: [{ role: "user", content: JSON.stringify(profile, null, 2) }],
  });

  const text = msg.content.filter((c) => c.type === "text").map((c: any) => c.text).join("");
  return parseJson<{ headline: string; reasoning: string; redirects: Array<{ label: string; why: string }> }>(text);
}
