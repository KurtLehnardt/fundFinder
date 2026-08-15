import Anthropic from "@anthropic-ai/sdk";
import type { StartupProfile, Opportunity, Match, CriterionCheck, Tier } from "./types";
import { loadPrompt } from "./prompts";

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
    system: loadPrompt("extractProfile").template,
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
  const SYSTEM = loadPrompt("explainMatches").template;

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
    system: loadPrompt("explainWeakField").template,
    messages: [{ role: "user", content: JSON.stringify(profile, null, 2) }],
  });

  const text = msg.content.filter((c) => c.type === "text").map((c: any) => c.text).join("");
  return parseJson<{ headline: string; reasoning: string; redirects: Array<{ label: string; why: string }> }>(text);
}
