import Anthropic from "@anthropic-ai/sdk";
import type { StartupProfile, Opportunity, Match, CriterionCheck, Tier } from "./types";
import { loadPrompt } from "./prompts";
import type { CostMeter } from "./metering/meter";

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
 * R4b — normalize one Anthropic call's `usage` into `CostMeter.record()`'s
 * generic shape and record it. Called immediately once the API call resolves
 * (msg.usage), BEFORE parseJson() or any other step that could throw — an
 * already-spent call's cost must never go unrecorded because of a downstream
 * parse failure.
 *
 * `@anthropic-ai/sdk` `^0.32.1`'s non-beta `Usage` type only declares
 * `input_tokens`/`output_tokens` (verified against the installed SDK's
 * `resources/messages.d.ts`) — `cache_creation_input_tokens`/
 * `cache_read_input_tokens` only exist on the beta prompt-caching response
 * type, which this app doesn't call. Read them anyway via a loose cast, in
 * case a future SDK bump/response starts including them; they're `undefined`
 * today, which is the expected value (see meter.ts's `StageCost` comment).
 */
function recordUsage(meter: CostMeter | undefined, stage: string, usage: Anthropic.Messages.Usage, latencyMs: number): void {
  if (!meter) return;
  const raw = (usage ?? {}) as unknown as {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
  };
  meter.record({
    stage,
    provider: "anthropic",
    model: MODEL,
    inputTokens: raw.input_tokens ?? 0,
    outputTokens: raw.output_tokens ?? 0,
    cacheCreationInputTokens: raw.cache_creation_input_tokens ?? undefined,
    cacheReadInputTokens: raw.cache_read_input_tokens ?? undefined,
    latencyMs,
  });
}

/**
 * Stage 1 — intake. Pull structured fields out of the founder's description,
 * expand into government vocabulary, and ask only for what's still missing.
 */
export async function extractProfile(
  description: string,
  meter?: CostMeter,
): Promise<{ profile: StartupProfile; followUps: string[] }> {
  const t0 = performance.now();
  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: loadPrompt("extractProfile").template,
    messages: [{ role: "user", content: description }],
  });
  recordUsage(meter, "profile_extraction", msg.usage, performance.now() - t0);

  const text = msg.content.filter((c) => c.type === "text").map((c: any) => c.text).join("");
  return parseJson(text);
}

/**
 * Stage 2 — explain. Given candidate opportunities that already passed rules
 * and similarity, score each and write the four-part explanation.
 */
export async function explainMatches(
  profile: StartupProfile,
  candidates: Opportunity[],
  meter?: CostMeter,
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
    const t0 = performance.now();
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
    // R4b — record THIS batch's usage the instant its own call resolves, not
    // after Promise.allSettled below: a batch whose parseJson() throws on
    // non-JSON output must still have its already-spent cost captured.
    recordUsage(meter, "candidate_analysis", msg.usage, performance.now() - t0);
    const text = msg.content.filter((c) => c.type === "text").map((c: any) => c.text).join("");
    return parseJson<Assessment[]>(text);
  };

  // Fault-tolerant: keep whatever batches succeed. One batch throwing or
  // emitting non-JSON must not discard the others (and their spend). Only fail
  // the whole request if every batch fails.
  const fanOutStart = performance.now();
  const settled = await Promise.allSettled(groups.map(scoreGroup));
  // R4b — batches ran CONCURRENTLY, so the stage's latency is the wall-clock
  // of the whole fan-out, not a sum of the per-batch latencies recorded above
  // (summing would overcount — this overwrites that sum with the real span).
  meter?.recordStageLatency("candidate_analysis", performance.now() - fanOutStart);
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
export async function explainWeakField(profile: StartupProfile, meter?: CostMeter) {
  const t0 = performance.now();
  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: 1200,
    system: loadPrompt("explainWeakField").template,
    messages: [{ role: "user", content: JSON.stringify(profile, null, 2) }],
  });
  recordUsage(meter, "weak_field_explanation", msg.usage, performance.now() - t0);

  const text = msg.content.filter((c) => c.type === "text").map((c: any) => c.text).join("");
  return parseJson<{ headline: string; reasoning: string; redirects: Array<{ label: string; why: string }> }>(text);
}
