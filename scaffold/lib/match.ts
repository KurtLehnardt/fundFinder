import { embed, cosine } from "./embed";
import { extractProfile, explainMatches, explainWeakField } from "./claude";
import type { Opportunity, OpportunityMap, StartupProfile, Match, Tier, AwardHistory } from "./types";
import { screen } from "./eligibility/screen";
import { annotateFreshness } from "./eligibility/freshness";
import { toCompanyProfile, toScreenableOpportunity } from "./eligibility/bridge";
import corpus from "@/data/opportunities.json";
import awards from "@/data/awards.json";
import { createCostMeter, type CostMeter } from "./metering/meter";
import { isFlagEnabled } from "./flags";

/**
 * CALIBRATION KNOBS — tune these against all five test cases before touching UI.
 * Too aggressive and cases 1-4 under-match. Too loose and case 5 hallucinates.
 */
export const CALIBRATION = {
  /** Below this cosine similarity a program is never a candidate. */
  candidateFloor: 0.22,
  /** How many candidates go to Claude for scoring. */
  candidateCount: 24,
  /** Below this LLM score, a match is not shown as likely/verify. Gives the
   *  flagship AI-health case margin (its NIH match scores 35-72 across runs)
   *  while staying well clear of case 5's ~22 ceiling. */
  scoreFloor: 30,
  /** If fewer than this many matches clear scoreFloor, declare a weak field.
   *  1 = weak field means ZERO strong matches — cleanly isolates the case-5
   *  "no honest match" finding from thin-but-real cases (e.g. case 1's single
   *  strong NIH match), which case-5's large score margin keeps robust. */
  weakFieldThreshold: 1,
};

/** Hard eligibility gates. Rules, not embeddings — these are binary facts. */
function ruleGate(opp: Opportunity, profile: StartupProfile): boolean {
  const emp = profile.employees ?? 0;
  // SBIR/STTR: US small business, generally under 500 employees.
  if (opp.source === "sbir" && emp > 500) return false;
  // Anything explicitly restricted to universities or governments.
  const e = (opp.eligibility ?? "").toLowerCase();
  if (/only.*(institutions of higher education|state governments|tribal)/.test(e) && emp > 0) return false;
  return true;
}

function tierFromScore(score: number): Tier {
  if (score >= 75) return "likely";
  if (score >= CALIBRATION.scoreFloor) return "verify";
  if (score >= 25) return "adjacent";
  return "none";
}

function historyFor(oppId: string, state?: string): AwardHistory | undefined {
  const rows = (awards as any)[oppId];
  if (!rows || rows.length === 0) return undefined;
  const amounts = rows.map((r: any) => r.amount).sort((a: number, b: number) => a - b);
  const mid = Math.floor(amounts.length / 2);
  return {
    similarCompanies: rows.length,
    totalAwarded: amounts.reduce((a: number, b: number) => a + b, 0),
    medianAward: amounts.length % 2 ? amounts[mid] : Math.round((amounts[mid - 1] + amounts[mid]) / 2),
    inState: rows.filter((r: any) => (r.state ?? "").toLowerCase() === (state ?? "utah").toLowerCase()).length,
    inVertical: rows.filter((r: any) => r.sameVertical).length,
    recipients: rows.slice(0, 8),
  };
}

/** A real pipeline milestone, streamed to the client so the loading bar can
 *  reflect actual progress (not just a timer). `pct` is the fraction complete
 *  once this step has finished. */
export type StepEvent = { key: string; label: string; pct: number; detail?: string };

/**
 * R4b — always logs the structured per-search cost/latency line (there's no
 * real logging backend yet; see `track.ts`'s `defaultSink` for precedent),
 * and attaches `costDebug` to the result ONLY when `r4b_cost_debug` is on —
 * cost figures must never reach the end-user UI without that flag (CON-03
 * pattern: `lib/flags/registry.ts` + `env.ts`). Called from both
 * `buildOpportunityMap`'s normal return and the `weakField()` early exit, so
 * every completed search gets exactly one `[cost]` log line.
 *
 * Wrapped here too, on top of `CostMeter`'s own internal defensiveness
 * (belt-and-suspenders, per the R4b task's "a metering bug must never be the
 * reason a search fails") — this function itself must never throw.
 */
function finalizeCost(meter: CostMeter, result: OpportunityMap): void {
  try {
    const costSummary = meter.summary();
    meter.logSummary(costSummary);
    if (isFlagEnabled("r4b_cost_debug")) {
      result.costDebug = costSummary;
    }
  } catch (err) {
    console.warn("[metering] failed to finalize the cost summary for this search:", err);
  }
}

export async function buildOpportunityMap(
  description: string,
  onStep?: (e: StepEvent) => void,
): Promise<OpportunityMap> {
  // Progress is best-effort: a reporting error must never fail the search.
  const step = (e: StepEvent) => { try { onStep?.(e); } catch { /* ignore */ } };
  step({ key: "start", label: "Reading the federal register…", pct: 5 });

  // R4b — one CostMeter per search, threaded through every LLM/embedding
  // call below (including the weakField() early-exit path). Every method on
  // it is internally defensive and never throws (lib/metering/meter.ts).
  const meter = createCostMeter();

  // 1 + 2. Intake and adaptive follow-ups.
  const { profile, followUps } = await extractProfile(description, meter);
  step({ key: "profile", label: "Understood your company", pct: 18 });

  // 3. Semantic expansion — embed the founder profile plus expanded gov terms.
  const queryText = [
    profile.description,
    profile.technology,
    profile.industry,
    profile.rdActivities,
    profile.targetCustomers,
    (profile.expandedTerms ?? []).join(", "),
  ].filter(Boolean).join("\n");
  const queryVec = await embed(queryText, meter);
  step({ key: "embed", label: "Searching 476 programs", pct: 32 });

  // 4. Hybrid retrieval: rules gate, then similarity, then LLM scoring.
  const scored = (corpus as unknown as Opportunity[])
    .filter((o) => ruleGate(o, profile))
    .map((o) => ({ o, sim: o.embedding ? cosine(queryVec, o.embedding) : 0 }))
    .filter((x) => x.sim >= CALIBRATION.candidateFloor)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, CALIBRATION.candidateCount);
  step({ key: "retrieve", label: `Found ${scored.length} candidate programs`, pct: 46 });

  if (scored.length === 0) {
    step({ key: "weak", label: "Writing your finding…", pct: 80 });
    return weakField(profile, followUps, meter);
  }

  step({ key: "score", label: "Scoring and explaining your matches", pct: 52 });
  const assessments = await explainMatches(profile, scored.map((s) => s.o), meter);
  step({ key: "assemble", label: "Writing your opportunity map", pct: 90 });
  const byId = new Map(scored.map((s) => [s.o.id, s.o]));

  const matches: Match[] = assessments
    .map((a) => {
      const opp = byId.get(a.id);
      if (!opp) return null;
      return {
        opportunity: opp,
        // Derive tier from the calibrated score thresholds so card tiers and the
        // summary's high-potential count (score >= scoreFloor) stay consistent.
        tier: tierFromScore(a.score),
        score: a.score,
        criteria: a.criteria ?? [],
        whyFit: a.whyFit,
        whyIneligible: a.whyIneligible,
        whatToVerify: a.whatToVerify,
        whatToDoNext: a.whatToDoNext,
        history: historyFor(opp.id, profile.location),
      } as Match;
    })
    .filter(Boolean) as Match[];

  matches.sort((a, b) => b.score - a.score);

  // R8 / ELG-04: attach a REAL eligibility determination to each match. This is
  // cheap pure logic (no LLM, no network), so it always runs — no flag read here
  // (the flag gates only the DISPLAY, in OpportunityMap). The v1 profile is
  // bridged to the CompanyProfile screen() reads, mapping only genuinely-known
  // facts and leaving every unknown gate unset; per-opp rules are empty (the v1
  // corpus has only free-text eligibility), so the universal overlay drives the
  // buckets. DEFENSIVE: a screening error must NEVER break the search — each
  // screen() is wrapped, and a failure simply omits the field for that match.
  const companyProfile = toCompanyProfile(profile);
  for (const m of matches) {
    try {
      const determination = screen(companyProfile, toScreenableOpportunity(m.opportunity));
      m.eligibility = annotateFreshness(determination);
    } catch {
      // Screening failed for this one match — omit `eligibility`, keep going.
    }
  }
  step({ key: "eligibility", label: "Checking eligibility", pct: 94 });

  const strong = matches.filter((m) => m.score >= CALIBRATION.scoreFloor);

  // 5. The honest no. Weak field is a finding, not an empty state.
  const weak = strong.length < CALIBRATION.weakFieldThreshold
    ? await explainWeakField(profile, meter)
    : undefined;

  const now = Date.now();
  const in90 = matches.filter((m) => {
    const d = m.opportunity.deadline ? Date.parse(m.opportunity.deadline) : NaN;
    return !Number.isNaN(d) && d > now && d - now < 90 * 864e5;
  }).length;

  const agencies = Array.from(new Set(strong.map((m) => m.opportunity.agency)));

  const result: OpportunityMap = {
    profile,
    followUps,
    summary: {
      highPotential: strong.length,
      fundingIdentified: strong.reduce((sum, m) => sum + (m.opportunity.fundingHigh ?? 0), 0),
      agencies: agencies.length,
      closingIn90Days: in90,
    },
    matches,
    weakFieldFinding: weak,
    agencyIntelligence: agencies.slice(0, 5).map((agency) => ({
      agency,
      why: strong.find((m) => m.opportunity.agency === agency)?.whyFit.slice(0, 180) ?? "",
      opportunityCount: strong.filter((m) => m.opportunity.agency === agency).length,
    })),
  };
  finalizeCost(meter, result);
  return result;
}

async function weakField(profile: StartupProfile, followUps: string[], meter: CostMeter): Promise<OpportunityMap> {
  const result: OpportunityMap = {
    profile,
    followUps,
    summary: { highPotential: 0, fundingIdentified: 0, agencies: 0, closingIn90Days: 0 },
    matches: [],
    weakFieldFinding: await explainWeakField(profile, meter),
    agencyIntelligence: [],
  };
  finalizeCost(meter, result);
  return result;
}
