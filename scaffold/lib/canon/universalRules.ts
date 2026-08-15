import { z } from "zod";
import { EligibilityRuleCategorySchema } from "../contracts/opportunity";
import { CitedCitationSchema } from "./rules";
import type { CanonOpportunity } from "./CanonOpportunity";

/**
 * universalRules.ts — CAN-04 "universal overlay".
 *
 * WHY THIS EXISTS: our corpus is grants.gov-only, and grants.gov NOFO prose
 * rarely restates the *universal* federal gates (SAM.gov/UEI registration; the
 * SBIR/STTR size + ownership standards). The per-NOFO extractor in `rules.ts`
 * therefore — correctly — leaves those gates UNKNOWN rather than inventing a
 * per-NOFO "SAM required" rule (that fabricated-universal-rule move is exactly
 * what §11 forbids). This module supplies those gates ONCE, as a curated set
 * cited to authoritative federal regulations, so R8 can surface them without any
 * fabrication.
 *
 * DISTINCT FROM per-NOFO extraction:
 *  - `provenance = 'authoritative'`, `model_inferred = false` (these are cited to
 *    the controlling CFR, not inferred from a NOFO's text). `rules.ts`'s
 *    `insertEligibilityRules({replace:true})` scopes its delete to
 *    `model_inferred = true` precisely so re-running extraction never clobbers
 *    these.
 *  - This is a CODE-LEVEL set (single source of truth), applied by ELG-01 at
 *    evaluation time via `universalRulesForOpportunity()` — NOT materialized as
 *    a row on all ~600 opportunities. (A future task may materialize them if a
 *    query surface needs it; the model_inferred=false convention already keeps
 *    them safe from the extraction replace.)
 *
 * R8.4 STILL HOLDS: these rules are authoritative-source-CITED but still
 * agent-curated, not human-reviewed. So ELG-01 must NOT let them drive an
 * `excluded` bucket until a human promotes them (see `ELG01_UNIVERSAL_CONTRACT`).
 * Registration is a CONDITIONAL gate (a step with lead time), never an exclusion.
 */

/** Which opportunities a universal rule applies to. */
export const UniversalApplicabilitySchema = z.enum(["all", "sbir_sttr"]);
export type UniversalApplicability = z.infer<typeof UniversalApplicabilitySchema>;

/**
 * How ELG-01 renders the gate:
 *  - `conditional` → if unmet, the opportunity is `conditionally_eligible` with a
 *    concrete step + lead time (register in SAM.gov). NEVER an exclusion.
 *  - `categorical`  → a hard eligibility fact (SBIR size/ownership). Informs
 *    eligibility, but per R8.4 may not drive `excluded` until human review.
 */
export const UniversalGateKindSchema = z.enum(["conditional", "categorical"]);
export type UniversalGateKind = z.infer<typeof UniversalGateKindSchema>;

export const UniversalRuleSchema = z.object({
  id: z.string(),
  category: EligibilityRuleCategorySchema,
  description: z.string().min(1),
  /** MUST carry a source_url + verbatim quote from the controlling regulation. */
  citation: CitedCitationSchema,
  provenance: z.literal("authoritative").default("authoritative"),
  model_inferred: z.literal(false).default(false),
  applies_to: UniversalApplicabilitySchema,
  gate_kind: UniversalGateKindSchema,
  /** If unmet: the concrete next step + its typical lead time (for `conditional`). */
  remediation: z.string().optional(),
  lead_time: z.string().optional(),
});
export type UniversalRule = z.infer<typeof UniversalRuleSchema>;

/**
 * The curated universal overlay. Every quote is verbatim from the cited CFR
 * section (confirmed against Cornell LII / eCFR). No unverified clause is
 * asserted (e.g. the SBIR "organized for profit" clause is intentionally omitted
 * here because it was not confirmed verbatim — §11).
 */
export const UNIVERSAL_RULES: UniversalRule[] = UniversalRuleSchema.array().parse([
  {
    id: "universal-sam-registration",
    category: "registration",
    description:
      "Applicants must have an active SAM.gov registration and a Unique Entity Identifier (UEI) before submitting a federal grant application.",
    citation: {
      source_url: "https://www.law.cornell.edu/cfr/text/2/25.200",
      source_name: "2 CFR 25.200",
      quote: "Be registered in SAM.gov before submitting an application",
    },
    applies_to: "all",
    gate_kind: "conditional",
    remediation:
      "Register the entity in SAM.gov and obtain a UEI before the application deadline.",
    lead_time: "SAM.gov registration commonly takes several weeks — start well before a deadline.",
  },
  {
    id: "universal-sbir-ownership",
    category: "size_ownership",
    description:
      "SBIR/STTR: the concern must be more than 50% owned and controlled by U.S. citizens or permanent resident aliens.",
    citation: {
      source_url: "https://www.law.cornell.edu/cfr/text/13/121.702",
      source_name: "13 CFR 121.702(a)(1)(i)",
      quote:
        "more than 50 percent directly owned and controlled by one or more individuals (who are citizens or permanent resident aliens of the United States)",
    },
    applies_to: "sbir_sttr",
    gate_kind: "categorical",
  },
  {
    id: "universal-sbir-size",
    category: "size_ownership",
    description:
      "SBIR/STTR: the awardee, together with its affiliates, must not have more than 500 employees.",
    citation: {
      source_url: "https://www.law.cornell.edu/cfr/text/13/121.702",
      source_name: "13 CFR 121.702(c)",
      quote:
        "An SBIR or STTR awardee, together with its affiliates, must not have more than 500 employees.",
    },
    applies_to: "sbir_sttr",
    gate_kind: "categorical",
  },
]);

/** Contract surfaced to ELG-01 (machine-readable R8.4 for the universal overlay). */
export const ELG01_UNIVERSAL_CONTRACT = {
  /** Universal rules are authoritative-cited but agent-curated → not human-reviewed. */
  provenance: "authoritative" as const,
  /** A universal rule may NOT drive an `excluded` bucket until human review (R8.4). */
  universal_rules_must_not_gate_exclusion_until_reviewed: true,
  /** `conditional` gates (registration) render as `conditionally_eligible` + a step. */
  conditional_gates_render_as_conditional: true,
} as const;

/** Case-insensitive detection of an SBIR/STTR opportunity from its title/program. */
export function isSbirSttr(opp: Pick<CanonOpportunity, "title" | "program">): boolean {
  const hay = `${opp.title ?? ""} ${opp.program ?? ""}`.toLowerCase();
  return /\bsbir\b|\bsttr\b|small business (innovation|technology transfer)/.test(hay);
}

/** All universal rules (the full curated overlay). */
export function getUniversalRules(): UniversalRule[] {
  return UNIVERSAL_RULES;
}

/**
 * The universal rules that apply to a given opportunity: everything `applies_to:
 * "all"`, plus the SBIR/STTR gates when the opportunity is an SBIR/STTR program.
 * ELG-01 evaluates these alongside the per-opportunity `model_inferred` rules.
 */
export function universalRulesForOpportunity(
  opp: Pick<CanonOpportunity, "title" | "program">,
): UniversalRule[] {
  const sbir = isSbirSttr(opp);
  return UNIVERSAL_RULES.filter((r) => r.applies_to === "all" || (r.applies_to === "sbir_sttr" && sbir));
}
