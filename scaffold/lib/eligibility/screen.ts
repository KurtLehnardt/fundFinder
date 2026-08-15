import type { CompanyProfile, EntityType, Certification } from "../contracts/companyProfile";
import type { Opportunity, EligibilityRule, EligibilityRuleCategory } from "../contracts/opportunity";
import type { Provenance, Citation } from "../contracts/primitives";
import {
  EligibilityDeterminationSchema,
  type EligibilityDetermination,
  type RuleEvaluation,
  type RequiredStep,
} from "../contracts/eligibilityDetermination";
import {
  universalRulesForOpportunity,
  type UniversalRule,
} from "../canon/universalRules";

/**
 * screen.ts — ELG-01, the R8 eligibility screening engine (three buckets).
 *
 * PURE LOGIC, NO LLM. Given a `CompanyProfile`, an `Opportunity`, and the
 * per-opportunity eligibility rules, produce a CON-01 `EligibilityDetermination`
 * sorting the opportunity into exactly one bucket:
 *
 *   - `eligible`               — the profile satisfies every gate the Canon has
 *                                a rule for (R8.2).
 *   - `conditionally_eligible` — reachable after a concrete step (e.g. register
 *                                in SAM.gov), shown WITH the step + its lead time.
 *   - `excluded`               — with the reason and the rule cited. Never
 *                                silently dropped; the reason is always shown.
 *   - `unknown`                — a gate the profile/rules do not settle. Never
 *                                guessed eligible OR ineligible (R8.2).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SAFETY INVARIANTS THIS MODULE ENFORCES (R8.4 / §11) — do not weaken:
 *
 *  1. A `model_inferred` rule ALONE never yields `excluded`. A rule may only
 *     drive an exclusion if it is human-reviewed (`provenance` is `verified` —
 *     or, allowed by the CON-01 schema, `user_stated`). Everything CAN-04 writes
 *     is `model_inferred`; the universal overlay is authoritative-CITED but still
 *     agent-curated (unreviewed). Neither may drive `excluded`.
 *
 *  2. A `model_inferred` PROFILE FACT is never sufficient to exclude. Even a
 *     reviewed rule that a fact appears to violate cannot exclude when that fact
 *     was itself only inferred — the honest answer is `unknown` ("confirm this
 *     and we'll screen it"), not a guess.
 *
 *  3. The universal registration gate (SAM.gov / UEI) is CONDITIONAL — it
 *     becomes a `required_step` with a lead time, NEVER an exclusion.
 *
 *  4. The universal SBIR/STTR size + ownership gates apply only to SBIR/STTR
 *     opportunities and, being unreviewed, inform-but-do-not-hard-exclude: an
 *     apparent violation renders `unknown` (pending human review), never
 *     `excluded`.
 *
 *  5. A gate the profile does not settle renders `unknown`, never a guess.
 *
 * DEFENSE IN DEPTH: the value returned is validated through
 * `EligibilityDeterminationSchema.parse(...)`, whose own refinements refuse an
 * `excluded` bucket that (a) cites no failed rule or (b) rests only on
 * `model_inferred` rules. A logic bug that tried to emit such an exclusion would
 * THROW here rather than reach the UI.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ---------------------------------------------------------------------------
// Structured predicates — the machine-evaluable form of a gate
// ---------------------------------------------------------------------------

/**
 * A structured, deterministically-evaluable predicate for a gate. The CON-01
 * `EligibilityRule` carries only a category + free-text `description`; a pure
 * engine cannot safely infer a pass/fail from prose (that would be model work,
 * and a wrong parse is a false exclusion — the single worst failure here). So
 * the engine evaluates ONLY rules that arrive with one of these predicates. The
 * universal overlay is mapped to predicates internally; per-opportunity rules
 * supply theirs via `ScreeningRule.predicate` (a future rule-structuring layer,
 * or the fixtures/tests). A rule with no recognized predicate is advisory: it is
 * never a gate and never affects the bucket.
 */
export type RulePredicate =
  /** Eligible only if the profile's entity type is one of `allowed`. */
  | { kind: "entity_type_in"; allowed: EntityType[] }
  /** Excluded if the profile's entity type is one of `disallowed`. */
  | { kind: "entity_type_not_in"; disallowed: EntityType[] }
  /** Requires majority US ownership (`profile.us_owned === true`). */
  | { kind: "us_ownership_required" }
  /** Requires `profile.employee_count <= max`. */
  | { kind: "max_employees"; max: number }
  /** Requires an active SAM.gov registration (conditional — a step, not a bar). */
  | { kind: "sam_registration_required" }
  /** Requires a UEI (conditional — folded into the SAM step). */
  | { kind: "uei_required" }
  /** Requires a location/designation in the allowed set. */
  | { kind: "geography_in"; allowed_locations?: string[]; allowed_designations?: string[] }
  /** Program-specific prior-award prerequisite (e.g. Phase II requires Phase I). */
  | { kind: "prior_award_required" }
  /** Requires at least one of the named federal certifications. */
  | { kind: "certification_required"; any_of: Certification[] };

/**
 * The engine's input rule shape. An additive superset of the CON-01
 * `EligibilityRule` (it does NOT widen the shared contract): a plain
 * `EligibilityRule` is a valid `ScreeningRule` with `predicate` undefined.
 */
export interface ScreeningRule {
  id: string;
  category: EligibilityRuleCategory;
  description: string;
  /** Rule provenance. `verified`/`user_stated` = reviewed (may gate exclusion). */
  provenance: Provenance;
  citation?: Citation;
  /** The machine-evaluable predicate, if this rule has been structured. */
  predicate?: RulePredicate;
  /**
   * `conditional` → an unmet gate is a step (registration), never an exclusion.
   * `categorical` → a hard eligibility fact. Defaults to `categorical`.
   */
  gate_kind?: "conditional" | "categorical";
  /** Internal: universal-overlay rules are authoritative-cited but UNREVIEWED. */
  _origin?: "per_opp" | "universal";
}

/** The minimal opportunity shape the engine reads. */
export type ScreenableOpportunity = Pick<Opportunity, "id"> &
  Partial<Pick<Opportunity, "program" | "title" | "eligibility_rules">>;

// ---------------------------------------------------------------------------
// SAM.gov registration lead time (R8.2 "show the lead time it needs")
// ---------------------------------------------------------------------------

/**
 * Typical lead time for an active SAM.gov registration + UEI. The controlling
 * guidance (2 CFR 25.200, cited in `universalRules.ts`) says only "several
 * weeks"; this constant encodes a conservative typical MINIMUM so the UI can show
 * a concrete number. It is a planning estimate, not a fixed legal fact — the
 * qualitative caveat rides along in the step's `why`.
 */
export const SAM_REGISTRATION_LEAD_TIME_DAYS = 21;

// ---------------------------------------------------------------------------
// Provenance helpers
// ---------------------------------------------------------------------------

const PROVENANCE_RANK: Record<Provenance, number> = {
  model_inferred: 0,
  user_stated: 1,
  verified: 2,
};

/** The weaker (less trustworthy) of two provenances — `model_inferred` wins. */
function weakestProvenance(a: Provenance, b: Provenance): Provenance {
  return PROVENANCE_RANK[a] <= PROVENANCE_RANK[b] ? a : b;
}

/** A profile fact is trustworthy enough to GATE only if it was not merely inferred. */
function isTrustworthyFact(p: Provenance | undefined): boolean {
  return p === "user_stated" || p === "verified";
}

/** A RULE may drive an exclusion only if it has been human-reviewed. */
function ruleMayExclude(r: ScreeningRule): boolean {
  // Universal-overlay rules are authoritative-cited but UNREVIEWED → never gate.
  if (r._origin === "universal") return false;
  // CAN-04 writes `model_inferred`; only a review promotes a rule to `verified`.
  return r.provenance === "verified" || r.provenance === "user_stated";
}

// ---------------------------------------------------------------------------
// Reading provenanced profile fields
// ---------------------------------------------------------------------------

type ProvField<T> = { value: T; provenance: Provenance; confidence: number };
interface FactRead<T> {
  present: boolean;
  value?: T;
  provenance?: Provenance;
}
function readFact<T>(f: ProvField<T> | undefined): FactRead<T> {
  if (!f) return { present: false };
  return { present: true, value: f.value, provenance: f.provenance };
}

// ---------------------------------------------------------------------------
// Predicate evaluation
// ---------------------------------------------------------------------------

type Verdict = "pass" | "fail" | "indeterminate";
interface PredResult {
  verdict: Verdict;
  /** Provenance of the profile fact the verdict rests on (if any fact was read). */
  factProvenance?: Provenance;
}

const IND: PredResult = { verdict: "indeterminate" };

/** Evaluate one predicate against the profile. Pure; reads only structured facts. */
function evaluatePredicate(pred: RulePredicate, profile: CompanyProfile): PredResult {
  switch (pred.kind) {
    case "entity_type_in": {
      const f = readFact(profile.entity_type);
      if (!f.present) return IND;
      return {
        verdict: pred.allowed.includes(f.value as EntityType) ? "pass" : "fail",
        factProvenance: f.provenance,
      };
    }
    case "entity_type_not_in": {
      const f = readFact(profile.entity_type);
      if (!f.present) return IND;
      return {
        verdict: pred.disallowed.includes(f.value as EntityType) ? "fail" : "pass",
        factProvenance: f.provenance,
      };
    }
    case "us_ownership_required": {
      const f = readFact(profile.us_owned);
      if (!f.present) return IND;
      return { verdict: f.value ? "pass" : "fail", factProvenance: f.provenance };
    }
    case "max_employees": {
      const f = readFact(profile.employee_count);
      if (!f.present || typeof f.value !== "number") return IND;
      return {
        verdict: f.value <= pred.max ? "pass" : "fail",
        factProvenance: f.provenance,
      };
    }
    case "sam_registration_required": {
      const f = readFact(profile.sam_registered);
      if (!f.present) return IND; // don't know → routed to a step, never a bar
      return { verdict: f.value ? "pass" : "fail", factProvenance: f.provenance };
    }
    case "uei_required": {
      const f = readFact(profile.uei);
      if (!f.present) return IND;
      const has = typeof f.value === "string" && f.value.trim().length > 0;
      return { verdict: has ? "pass" : "fail", factProvenance: f.provenance };
    }
    case "prior_award_required": {
      const f = readFact(profile.prior_federal_funding);
      if (!f.present) return IND;
      return { verdict: f.value ? "pass" : "fail", factProvenance: f.provenance };
    }
    case "certification_required": {
      const f = readFact(profile.certifications);
      if (!f.present || !Array.isArray(f.value)) return IND;
      const have = new Set(f.value as Certification[]);
      return {
        verdict: pred.any_of.some((c) => have.has(c)) ? "pass" : "fail",
        factProvenance: f.provenance,
      };
    }
    case "geography_in": {
      // Conservative: only a clear DESIGNATION mismatch can fail. Free-text
      // locations are too ambiguous to fail on without risking a false
      // exclusion, so an unmatched location stays `indeterminate` (→ unknown).
      if (pred.allowed_designations && pred.allowed_designations.length > 0) {
        const f = readFact(profile.geography_designations);
        if (f.present && Array.isArray(f.value)) {
          const have = new Set((f.value as string[]).map((s) => s.toLowerCase()));
          const ok = pred.allowed_designations.some((d) => have.has(d.toLowerCase()));
          return { verdict: ok ? "pass" : "fail", factProvenance: f.provenance };
        }
      }
      return IND;
    }
  }
}

// ---------------------------------------------------------------------------
// Universal overlay → ScreeningRule
// ---------------------------------------------------------------------------

/** Map a universal-overlay rule to its structured predicate. */
function universalPredicate(u: UniversalRule): RulePredicate | undefined {
  if (u.category === "registration") return { kind: "sam_registration_required" };
  if (u.id.includes("ownership")) return { kind: "us_ownership_required" };
  // 13 CFR 121.702(c): "not more than 500 employees" (mirrors the cited quote).
  if (u.id.includes("size")) return { kind: "max_employees", max: 500 };
  return undefined;
}

function universalToScreeningRule(u: UniversalRule): ScreeningRule {
  return {
    id: u.id,
    category: u.category,
    description: u.description,
    // Downcast the overlay's `authoritative` provenance to `model_inferred` for
    // GATING purposes only: these rules are unreviewed, so — like a model rule —
    // they must never drive an exclusion. Defense in depth: if a bug ever routed
    // one into `failed_rules`, the schema's R8.4 refinement would THROW. The
    // authoritative CFR sourcing is preserved for display in `citation`.
    provenance: "model_inferred",
    citation: u.citation,
    predicate: universalPredicate(u),
    gate_kind: u.gate_kind,
    _origin: "universal",
  };
}

// ---------------------------------------------------------------------------
// RuleEvaluation builders
// ---------------------------------------------------------------------------

function toEvaluation(r: ScreeningRule, provenance: Provenance): RuleEvaluation {
  const e: RuleEvaluation = {
    rule_id: r.id,
    category: r.category,
    description: r.description,
    provenance,
  };
  if (r.citation) e.citation = r.citation;
  return e;
}

// ---------------------------------------------------------------------------
// The screen() entry point
// ---------------------------------------------------------------------------

/**
 * Screen one opportunity against the profile and its rules → an
 * `EligibilityDetermination`. `rules` are the per-opportunity screening rules;
 * if omitted, `opportunity.eligibility_rules` is used (advisory — those carry no
 * predicate). The universal overlay is ALWAYS folded in via
 * `universalRulesForOpportunity`.
 */
export function screen(
  profile: CompanyProfile,
  opportunity: ScreenableOpportunity,
  rules?: ScreeningRule[],
): EligibilityDetermination {
  const perOpp: ScreeningRule[] =
    rules ?? (opportunity.eligibility_rules ?? []).map(fromEligibilityRule);

  const universal = universalRulesForOpportunity({
    title: opportunity.title ?? "",
    program: opportunity.program ?? "",
  }).map(universalToScreeningRule);

  const allRules: ScreeningRule[] = [...universal, ...perOpp];

  const satisfied: RuleEvaluation[] = [];
  const failed: RuleEvaluation[] = [];
  const unknown: RuleEvaluation[] = [];
  const steps: RequiredStep[] = [];

  // Bucket is decided by these flags, NOT by list non-emptiness — so advisory
  // rules can be surfaced without wrongly downgrading a clear determination.
  let hasExclusion = false;
  let hasUndeterminedHardGate = false;
  let hasStep = false;

  for (const r of allRules) {
    const isConditional = r.gate_kind === "conditional";

    if (!r.predicate) {
      // No machine-evaluable predicate → the engine cannot screen this rule.
      // A REVIEWED categorical gate we cannot evaluate is a genuine unknown
      // (there's a hard gate; we just can't settle it). Advisory/unreviewed
      // prose is skipped so it never downgrades an otherwise-clear opp.
      if (!isConditional && ruleMayExclude(r)) {
        unknown.push(toEvaluation(r, r.provenance));
        hasUndeterminedHardGate = true;
      }
      continue;
    }

    const res = evaluatePredicate(r.predicate, profile);

    if (res.verdict === "pass") {
      satisfied.push(toEvaluation(r, res.factProvenance ?? r.provenance));
      continue;
    }

    if (isConditional) {
      // Registration gate: unmet OR undetermined → a step with lead time.
      // Never an exclusion, never blocks "eligible" as unknown.
      steps.push(registrationStep(r));
      hasStep = true;
      continue;
    }

    if (res.verdict === "indeterminate") {
      // A hard categorical gate the profile does not settle → unknown (R8.2:
      // "eligibility depends on X — tell us and we'll screen this").
      unknown.push(toEvaluation(r, r.provenance));
      hasUndeterminedHardGate = true;
      continue;
    }

    // verdict === "fail" on a categorical gate.
    const factTrustworthy = isTrustworthyFact(res.factProvenance);
    if (ruleMayExclude(r) && factTrustworthy) {
      // The ONLY path to `excluded`: a reviewed rule + a trustworthy failing
      // fact. Provenance emitted is the weaker of the two (both non-inferred
      // here) so the schema's R8.4 refinement is satisfied.
      const prov = weakestProvenance(r.provenance, res.factProvenance as Provenance);
      failed.push(toEvaluation(r, prov));
      hasExclusion = true;
      continue;
    }

    // Cannot exclude: rule is unreviewed/model_inferred, OR the failing fact was
    // itself only inferred. Render as UNKNOWN (needs review / confirmation),
    // never `excluded` (R8.4, R8.2).
    unknown.push(needsReviewEvaluation(r, res.factProvenance));
    hasUndeterminedHardGate = true;
  }

  // Bucket precedence: excluded > unknown > conditionally_eligible > eligible.
  // `unknown` outranks `conditional` because an unsettled HARD gate means we
  // cannot promise that a step alone unlocks the opportunity.
  let bucket: EligibilityDetermination["bucket"];
  if (hasExclusion) bucket = "excluded";
  else if (hasUndeterminedHardGate) bucket = "unknown";
  else if (hasStep) bucket = "conditionally_eligible";
  else bucket = "eligible";

  const determination = {
    opportunity_id: opportunity.id,
    bucket,
    satisfied_rules: satisfied,
    failed_rules: failed,
    unknown_rules: unknown,
    required_steps: dedupeSteps(steps),
  };

  // Defense in depth (R8.4 / R8.2): validate through the CON-01 schema, whose
  // refinements reject a silent or model_inferred-only exclusion.
  return EligibilityDeterminationSchema.parse(determination);
}

// ---------------------------------------------------------------------------
// Small builders
// ---------------------------------------------------------------------------

/** Map a plain CON-01 `EligibilityRule` to a `ScreeningRule` (no predicate). */
export function fromEligibilityRule(r: EligibilityRule): ScreeningRule {
  return {
    id: r.id,
    category: r.category,
    description: r.description,
    provenance: r.provenance,
    citation: r.citation,
  };
}

function registrationStep(r: ScreeningRule): RequiredStep {
  return {
    step:
      r.category === "registration"
        ? "Register the entity in SAM.gov and obtain a UEI before the application deadline."
        : r.description,
    lead_time_days: SAM_REGISTRATION_LEAD_TIME_DAYS,
    why:
      "SAM.gov registration commonly takes several weeks — start well before a deadline. " +
      "This is a timeline blocker, not an eligibility bar.",
  };
}

function needsReviewEvaluation(
  r: ScreeningRule,
  factProvenance: Provenance | undefined,
): RuleEvaluation {
  const reason =
    r._origin === "universal"
      ? "Authoritative-but-unreviewed gate — informs eligibility but needs human review before it can affect it (R8.4)."
      : !isTrustworthyFact(factProvenance)
        ? "The profile fact this depends on was only inferred — confirm it and we'll screen this (R8.2)."
        : "Model-inferred rule — needs human review before it can affect eligibility (R8.4).";
  const e: RuleEvaluation = {
    rule_id: r.id,
    category: r.category,
    description: `${r.description} — ${reason}`,
    // Kept `model_inferred` on purpose: this evaluation must never be able to
    // stand as a reason for exclusion.
    provenance: "model_inferred",
  };
  if (r.citation) e.citation = r.citation;
  return e;
}

function dedupeSteps(steps: RequiredStep[]): RequiredStep[] {
  const seen = new Set<string>();
  const out: RequiredStep[] = [];
  for (const s of steps) {
    if (seen.has(s.step)) continue;
    seen.add(s.step);
    out.push(s);
  }
  return out;
}
