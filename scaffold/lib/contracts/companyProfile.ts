import { z } from "zod";
import { provenanced } from "./primitives";

/**
 * §3.1 — CompanyProfile
 *
 * The enriched description object: raw text, structured extracted fields, the
 * R1 interview answers, and — mandatory on every field — provenance and
 * confidence.
 *
 * Provenance is enforced *structurally*: every field is a `provenanced(...)`
 * wrapper, so a field cannot be present without declaring where it came from.
 * There is no shape of `CompanyProfile` that carries a fact with no provenance.
 * R2, R3, R8 (esp. R8.4 — a `model_inferred` eligibility fact never gates an
 * exclusion), and R6's attest screen all read this.
 *
 * This is the v2 profile. It is deliberately distinct from the v1
 * `StartupProfile` (see `opportunityMap.ts`), which stays as-is so the live
 * pipeline keeps compiling. Team Interview/Eligibility build against this one.
 */

/** Legal entity type — the most common categorical eligibility gate (R8.1). */
export const EntityTypeSchema = z.enum([
  "for_profit_small_business",
  "for_profit_other",
  "nonprofit",
  "higher_education",
  "state_or_local_government",
  "tribal",
  "individual",
  "other",
]);
export type EntityType = z.infer<typeof EntityTypeSchema>;

/** Federal small-business / socioeconomic certifications (R8.1, R3). */
export const CertificationSchema = z.enum([
  "small_business",
  "sdb", // Small Disadvantaged Business
  "wosb", // Woman-Owned Small Business
  "hubzone",
  "8a",
  "vosb", // Veteran-Owned Small Business
  "sdvosb", // Service-Disabled Veteran-Owned Small Business
]);
export type Certification = z.infer<typeof CertificationSchema>;

/**
 * A single R1 interview answer. The answer value carries its own provenance
 * (nearly always `user_stated`, but a skipped-then-inferred answer is
 * `model_inferred`).
 */
export const InterviewAnswerSchema = z.object({
  question_id: z.string(),
  question: z.string(),
  /** Structured selection(s) and/or the free-text escape hatch (R1). */
  answer: provenanced(z.union([z.string(), z.array(z.string())])),
  skipped: z.boolean().default(false),
});
export type InterviewAnswer = z.infer<typeof InterviewAnswerSchema>;

export const CompanyProfileSchema = z.object({
  /** Stable id so a Run (§3.12) can reference the exact profile it read. */
  id: z.string(),

  /**
   * The founder's own description. Provenanced like everything else; it is
   * `user_stated` when typed, `model_inferred`/`verified` after an R3 rewrite.
   */
  raw_text: provenanced(z.string()),

  // --- Structured extracted / interview fields. Each is optional at the
  // --- profile level (may be unknown), but if present it MUST carry provenance.
  entity_type: provenanced(EntityTypeSchema).optional(),
  us_owned: provenanced(z.boolean()).optional(),
  employee_count: provenanced(z.number().int().nonnegative()).optional(),
  location: provenanced(z.string()).optional(),
  /** Geographic designations that gate programs (HUBZone, rural, etc.). */
  geography_designations: provenanced(z.array(z.string())).optional(),
  certifications: provenanced(z.array(CertificationSchema)).optional(),

  /** Registration prerequisites (R8.1) — blockers on the timeline. */
  sam_registered: provenanced(z.boolean()).optional(),
  uei: provenanced(z.string()).optional(),

  industry: provenanced(z.string()).optional(),
  technology: provenanced(z.string()).optional(),
  /** Technology Readiness Level, 1..9 (R1 routing, R8 program gates). */
  trl: provenanced(z.number().int().min(1).max(9)).optional(),
  naics_codes: provenanced(z.array(z.string())).optional(),

  funding_stage: provenanced(z.string()).optional(),
  revenue: provenanced(z.string()).optional(),
  capital_raised: provenanced(z.string()).optional(),
  capital_requirement: provenanced(z.string()).optional(),
  use_of_funds: provenanced(z.string()).optional(),
  rd_activities: provenanced(z.string()).optional(),
  product_maturity: provenanced(z.string()).optional(),
  target_customers: provenanced(z.string()).optional(),
  /** Prior federal awards — a Phase-II prerequisite check for SBIR/STTR (R8.1). */
  prior_federal_funding: provenanced(z.boolean()).optional(),

  /** Government-vocabulary expansion of the founder's own words (feeds retrieval). */
  expanded_terms: provenanced(z.array(z.string())).optional(),

  /** The R1 interview transcript. */
  interview_answers: z.array(InterviewAnswerSchema).default([]),
});
export type CompanyProfile = z.infer<typeof CompanyProfileSchema>;

// Provenance primitives (`Provenance`, `Provenanced`, etc.) live in
// `./primitives` and are surfaced through the barrel `index.ts` — imported
// above only for use here, not re-exported (keeps a single export origin).
