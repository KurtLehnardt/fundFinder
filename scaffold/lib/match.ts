import { embed, cosine } from "./embed";
import { extractProfile, explainMatches, explainWeakField } from "./claude";
import type { Opportunity, OpportunityMap, StartupProfile, Match, Tier, AwardHistory } from "./types";
import { screen } from "./eligibility/screen";
import { annotateFreshness } from "./eligibility/freshness";
import { toCompanyProfile, toScreenableOpportunity, type KnownCompanyFacts } from "./eligibility/bridge";
import corpus from "@/data/opportunities.json";
import awards from "@/data/awards.json";
import { createCostMeter, type CostMeter } from "./metering/meter";
import { CURRENT_OPPORTUNITY_MAP_VERSION } from "./contracts/opportunityMap";
import { isFlagEnabled } from "./flags";

/**
 * CALIBRATION KNOBS — tune these against all five test cases before touching UI.
 * Too aggressive and cases 1-4 under-match. Too loose and case 5 hallucinates.
 *
 * SOURCE OF TRUTH for these values + their audit trail:
 * `docs/calibration-baseline.md` (see its "CURRENT SHIPPED CALIBRATION"
 * section). If you change a knob here, update that doc in the SAME commit — the
 * baseline's older guidance is explicitly superseded there. A full golden-set
 * re-validation (evals/golden-set.jsonl) remains the outstanding audit step.
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
  /** C1a — per-type retrieval quota. Reserve at least this many candidates of
   *  EACH `kind` present among the floor-clearing set, so every instrument type
   *  (rd/SBIR, procurement, assistance, loan, scholarship) REACHES the LLM
   *  scorer instead of being crowded out by the 476 grants in a single global
   *  top-`candidateCount` cosine cut. These slots are ADDED to (unioned with)
   *  the global top-N — they never displace a strong grant. Purely deterministic
   *  (top-K-by-cosine per kind, tie-broken by opp id). Does NOT change scoring;
   *  it only makes underrepresented types reachable (scoreFloor stays Wave-3). */
  perTypeQuota: 3,
};

/**
 * C1 (architectural review): the legacy v1 `ruleGate()` pre-filter was REMOVED.
 *
 * It ran BEFORE the ELG-01 engine and silently dropped opportunities that then
 * reached no bucket at all — violating R8.2 ("never silently drop") and R8.4
 * ("never exclude on a model-inferred fact"). Both of its branches were
 * eligibility exclusions, NOT retrieval heuristics, so nothing conservative
 * remained to keep:
 *   1. `source==="sbir" && employees>500` gated on a MODEL-INFERRED employee
 *      count (`bridge.ts` marks `employees` as `model_inferred`). `screen()`
 *      renders exactly this fact as `unknown`, never `excluded`.
 *   2. `/only.*(IHE|state|tribal)/` over free-text eligibility prose — a greedy
 *      regex that matched 40/476 live corpus opps, including permissive
 *      multi-entity NOFOs (e.g. `grants-353936`, open to nonprofits AND IHEs),
 *      dropping them as if they were "IHE-only".
 *
 * `screen()` is now the SOLE eligibility authority: a size/entity mismatch flows
 * through the engine as `unknown`/`conditionally_eligible` (or, only for a
 * reviewed+trustworthy rule on a trustworthy fact, a VISIBLE `excluded`), never a
 * pre-screen silent drop.
 */

/**
 * Testability seam (H6): the real LLM/embedding/screen calls and the static
 * corpus are injectable so `buildOpportunityMap` can be exercised hermetically
 * (no network, no live model spend). Production callers omit `deps` and get the
 * real implementations; tests pass mocks + a fixture corpus.
 */
export type BuildDeps = {
  extractProfile: typeof extractProfile;
  embed: typeof embed;
  explainMatches: typeof explainMatches;
  explainWeakField: typeof explainWeakField;
  screen: typeof screen;
  corpus: Opportunity[];
};

const REAL_DEPS: BuildDeps = {
  extractProfile,
  embed,
  explainMatches,
  explainWeakField,
  screen,
  corpus: corpus as unknown as Opportunity[],
};

export function tierFromScore(score: number): Tier {
  if (score >= 75) return "likely";
  if (score >= CALIBRATION.scoreFloor) return "verify";
  if (score >= 25) return "adjacent";
  return "none";
}

/**
 * A3-lite (awards provenance gate) — the raw shape of a row in
 * `data/awards.json`. `sourceUrl` is OPTIONAL here (this is the shape as it
 * arrives from the data file / a test fixture), unlike the required
 * `sourceUrl` in `AwardHistorySchema.recipients` (`lib/contracts/
 * opportunityMap.ts`): a row without one is a candidate for filtering, not a
 * schema violation, until it survives `filterVerifiedRows()` below.
 */
export type AwardRow = {
  company: string;
  program: string;
  agency: string;
  amount: number;
  year: number;
  state?: string;
  sameVertical?: boolean;
  sourceUrl?: string;
};

/**
 * A3-lite — the ONLY gate between raw award rows and anything a user sees.
 * Every `data/awards.json` row was cross-checked against the live SBIR.gov
 * bulk award CSV (firm + agency + program + award year + amount) and only
 * verified rows were written back with a real `sourceUrl`
 * (`https://www.sbir.gov/awards?firm=<firm>`); unverifiable rows were DROPPED
 * from the data file entirely. This filter is defense-in-depth on top of
 * that: it re-asserts the same guarantee at render time so a row can never
 * reach the UI without provenance, regardless of how it got into the awards
 * map (a future data refresh, a bad merge, a test fixture, etc.).
 */
export function filterVerifiedRows(rows: AwardRow[]): AwardRow[] {
  return rows.filter((r) => typeof r.sourceUrl === "string" && r.sourceUrl.length > 0);
}

/**
 * A3-lite — pure, hermetic computation of an `AwardHistory` from an already-
 * loaded row array (no `@/data/awards.json` import, no I/O). Filters to
 * verified rows FIRST, so `similarCompanies`/totals/medians/`recipients` all
 * reflect only rows with a real `sourceUrl`. Extracted out of `historyFor` so
 * tests can inject a fixture row set (mix of verified + unverified) instead
 * of depending on the real 4,020-row data file.
 */
export function historyFromRows(rows: AwardRow[], state?: string): AwardHistory | undefined {
  const verified = filterVerifiedRows(rows);
  if (verified.length === 0) return undefined;
  const amounts = verified.map((r) => r.amount).sort((a, b) => a - b);
  const mid = Math.floor(amounts.length / 2);
  return {
    similarCompanies: verified.length,
    totalAwarded: amounts.reduce((a, b) => a + b, 0),
    medianAward: amounts.length % 2 ? amounts[mid] : Math.round((amounts[mid - 1] + amounts[mid]) / 2),
    inState: verified.filter((r) => (r.state ?? "").toLowerCase() === (state ?? "utah").toLowerCase()).length,
    inVertical: verified.filter((r) => r.sameVertical).length,
    recipients: verified.slice(0, 8) as AwardHistory["recipients"],
  };
}

export function historyFor(oppId: string, state?: string): AwardHistory | undefined {
  const rows = (awards as any)[oppId] as AwardRow[] | undefined;
  if (!rows || rows.length === 0) return undefined;
  return historyFromRows(rows, state);
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
  deps: Partial<BuildDeps> = {},
  signal?: AbortSignal,
  companyFacts?: KnownCompanyFacts,
): Promise<OpportunityMap> {
  const d: BuildDeps = { ...REAL_DEPS, ...deps };
  // Progress is best-effort: a reporting error must never fail the search.
  const step = (e: StepEvent) => { try { onStep?.(e); } catch { /* ignore */ } };
  step({ key: "start", label: "Reading the federal register…", pct: 5 });

  // R4b — one CostMeter per search, threaded through every LLM/embedding
  // call below (including the weakField() early-exit path). Every method on
  // it is internally defensive and never throws (lib/metering/meter.ts).
  const meter = createCostMeter();

  // 1 + 2. Intake and adaptive follow-ups.
  const { profile, followUps } = await d.extractProfile(description, meter, signal);
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
  const queryVec = await d.embed(queryText, meter, signal);
  step({ key: "embed", label: `Searching ${d.corpus.length} programs`, pct: 32 });

  // 4. Hybrid retrieval: similarity, then LLM scoring. No pre-screen eligibility
  //    filter — every retrieved candidate is screened by screen() (C1).
  //
  // C1a (per-type retrieval quota): a single global top-`candidateCount` cosine
  // cut let the ~476 grants crowd out the ~492 non-grant opps (rd/SBIR,
  // procurement, assistance, loan, scholarship), so those instrument types
  // never reached the LLM scorer. We keep the global top-N unchanged (every
  // strong grant that already made the cut is preserved) and ADDITIONALLY
  // reserve the top `perTypeQuota` candidates of EACH `kind` present among the
  // floor-clearing set, unioning them in (deduped by id). This makes every
  // present instrument type REACHABLE by the scorer without displacing any
  // strong grant. Fully deterministic: stable sort by cosine desc, tie-broken
  // by opp id, so the union order is stable across runs.
  const floorCleared = d.corpus
    .map((o) => ({ o, sim: o.embedding ? cosine(queryVec, o.embedding) : 0 }))
    .filter((x) => x.sim >= CALIBRATION.candidateFloor)
    .sort((a, b) => (b.sim - a.sim) || (a.o.id < b.o.id ? -1 : a.o.id > b.o.id ? 1 : 0));

  // Base set: the UNCHANGED global top-N (preserves every strong grant that
  // already qualified — nothing is discarded to make room for the quota).
  const selectedIds = new Set(floorCleared.slice(0, CALIBRATION.candidateCount).map((x) => x.o.id));

  // Reserved slots: top-`perTypeQuota`-by-cosine of EACH present kind, added if
  // not already selected. Because `floorCleared` is pre-sorted, taking the first
  // `perTypeQuota` occurrences per kind yields that kind's highest-cosine picks.
  const perKindTaken = new Map<string, number>();
  for (const x of floorCleared) {
    const taken = perKindTaken.get(x.o.kind) ?? 0;
    if (taken < CALIBRATION.perTypeQuota) {
      perKindTaken.set(x.o.kind, taken + 1);
      selectedIds.add(x.o.id);
    }
  }

  // The candidate slice sent to the scorer: the union, in the same deterministic
  // cosine-desc / id order as `floorCleared` (filter preserves array order).
  const scored = floorCleared.filter((x) => selectedIds.has(x.o.id));
  step({ key: "retrieve", label: `Found ${scored.length} candidate programs`, pct: 46 });

  if (scored.length === 0) {
    step({ key: "weak", label: "Writing your finding…", pct: 80 });
    return weakField(profile, followUps, meter, d.explainWeakField, signal);
  }

  step({ key: "score", label: "Scoring and explaining your matches", pct: 52 });
  const assessments = await d.explainMatches(
    profile,
    scored.map((s) => s.o),
    meter,
    // Per-batch progress: interpolate between the score milestone (52) and the
    // assemble milestone (90) as batches settle, so the ~83s scoring stage no
    // longer sits frozen at 52%.
    (done, total) => {
      const pct = total > 0 ? 52 + Math.round((done / total) * 36) : 52;
      step({ key: "score-progress", label: `Scored ${done} of ${total} programs`, pct, detail: `${done}/${total}` });
    },
    signal,
  );
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
        whyCare: a.whyCare,
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
  const companyProfile = toCompanyProfile(profile, companyFacts);
  for (const m of matches) {
    try {
      const determination = d.screen(companyProfile, toScreenableOpportunity(m.opportunity));
      m.eligibility = annotateFreshness(determination);
    } catch {
      // Screening failed for this one match — omit `eligibility`, keep going.
    }
  }
  step({ key: "eligibility", label: "Checking eligibility", pct: 94 });

  const strong = matches.filter((m) => m.score >= CALIBRATION.scoreFloor);

  // 5. The honest no. Weak field is a finding, not an empty state.
  // DEFENSIVE: this is an auxiliary narrative call — if it throws (429, timeout,
  // malformed JSON), degrade to omitting the finding rather than discarding the
  // entire computed `matches`/eligibility set. Mirrors the per-match screen()
  // wrapping above.
  let weak: Awaited<ReturnType<typeof d.explainWeakField>> | undefined;
  if (strong.length < CALIBRATION.weakFieldThreshold) {
    try {
      weak = await d.explainWeakField(profile, meter, signal);
    } catch {
      weak = undefined;
    }
  }

  const now = Date.now();
  const in90 = matches.filter((m) => {
    const d = m.opportunity.deadline ? Date.parse(m.opportunity.deadline) : NaN;
    return !Number.isNaN(d) && d > now && d - now < 90 * 864e5;
  }).length;

  const agencies = Array.from(new Set(strong.map((m) => m.opportunity.agency)));

  const result: OpportunityMap = {
    // §3.6 — stamp the contract version on every live write so consumers can
    // branch on it later (the affordance was inert while producers never wrote it).
    version: CURRENT_OPPORTUNITY_MAP_VERSION,
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

async function weakField(
  profile: StartupProfile,
  followUps: string[],
  meter: CostMeter,
  explainWeak: typeof explainWeakField = explainWeakField,
  signal?: AbortSignal,
): Promise<OpportunityMap> {
  const result: OpportunityMap = {
    version: CURRENT_OPPORTUNITY_MAP_VERSION,
    profile,
    followUps,
    summary: { highPotential: 0, fundingIdentified: 0, agencies: 0, closingIn90Days: 0 },
    matches: [],
    weakFieldFinding: await explainWeak(profile, meter, signal),
    agencyIntelligence: [],
  };
  finalizeCost(meter, result);
  return result;
}
