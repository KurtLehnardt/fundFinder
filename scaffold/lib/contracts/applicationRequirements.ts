import { z } from "zod";

/**
 * WS-G / G1 — ApplicationRequirements (the grounded, structured application
 * "spec" extracted from a single Opportunity's announcement text).
 *
 * THE HONESTY CONTRACT (mirrors ELG-01 / `lib/eligibility/screen.ts` and the
 * app's anti-fabrication discipline): every extracted atom is either
 *   (a) GROUNDED — `specified: true` with a verbatim `source_quote` that is a
 *       real (whitespace-normalized) substring of the announcement text; or
 *   (b) NOT SPECIFIED — `specified: false`, its value field(s) carry the exact
 *       `NOT_SPECIFIED` sentinel, and `source_quote` is `""`.
 *
 * A "requirement" is NEVER invented. If the announcement text does not state
 * something, the extractor emits the sentinel — it does not guess a plausible
 * page limit, form number, or deadline. `lib/apply/requirements.ts`
 * (`annotateGrounding`) enforces (a) as defense-in-depth: any non-sentinel
 * `source_quote` that is not actually in the source text is neutralized to (b)
 * before this schema ever sees it, and the value returned by
 * `extractApplicationRequirements` is validated through
 * `ApplicationRequirementsSchema.parse(...)` — exactly as `screen()` validates
 * through `EligibilityDeterminationSchema.parse(...)`.
 */

/**
 * The literal sentinel emitted for any field the announcement text does not
 * cover. Consumers (G2) can test `specified === false` OR compare against this
 * constant — both are stable. NEVER change the string: it is part of the
 * contract and is what proves the extractor refused to fabricate.
 */
export const NOT_SPECIFIED = "[not specified in the announcement]" as const;

/**
 * The two grounding fields every extracted atom carries. `specified` is the
 * boolean flag; `source_quote` is the verbatim substring the atom rests on
 * (`""` when `specified` is false).
 */
const groundingFields = {
  /** Verbatim substring of the announcement text this atom rests on; `""` when not specified. */
  source_quote: z.string(),
  /** True → grounded in the text; false → the announcement does not cover this (sentinel value). */
  specified: z.boolean(),
};

/**
 * The shared grounded-atom primitive: `{ source_quote, specified }`. Every
 * item schema below is this primitive plus its own value field(s).
 */
export const GroundedItemSchema = z.object({ ...groundingFields });
export type GroundedItem = z.infer<typeof GroundedItemSchema>;

/** Extend the grounded primitive with an atom's own value fields. */
function grounded<T extends z.ZodRawShape>(shape: T) {
  return z.object({ ...shape, ...groundingFields });
}

/**
 * A required narrative section the applicant must write + the prompt/question
 * they must answer. THIS IS THE STABLE INTERFACE G2 CONSUMES — do not rename
 * `key` / `title` / `prompt`.
 *   - `key`    — stable slug, e.g. "project_summary"
 *   - `title`  — human title, e.g. "Project Summary"
 *   - `prompt` — the instruction/question the applicant must answer
 */
export const NarrativeSectionSchema = grounded({
  key: z.string(),
  title: z.string(),
  prompt: z.string(),
});
export type NarrativeSection = z.infer<typeof NarrativeSectionSchema>;

/** A referenced form (SF-424 family, agency-specific forms, etc.). */
export const RequiredFormSchema = grounded({ name: z.string() });
export type RequiredForm = z.infer<typeof RequiredFormSchema>;

/** A page/format limit (page count, font, spacing, margins, file type…). */
export const FormatLimitSchema = grounded({
  label: z.string(),
  value: z.string(),
});
export type FormatLimit = z.infer<typeof FormatLimitSchema>;

/** A budget rule (cost-share, cap, indirect-cost rate, disallowed costs…). */
export const BudgetRuleSchema = grounded({ rule: z.string() });
export type BudgetRule = z.infer<typeof BudgetRuleSchema>;

/** A required attachment (letters of support, bios, work plan, budget narrative…). */
export const RequiredAttachmentSchema = grounded({ name: z.string() });
export type RequiredAttachment = z.infer<typeof RequiredAttachmentSchema>;

/** A key date/deadline (application due, LOI, webinar, project start…). */
export const KeyDateSchema = grounded({
  label: z.string(),
  date: z.string(),
});
export type KeyDate = z.infer<typeof KeyDateSchema>;

/** An eligibility note relevant to who may apply (drawn from the text). */
export const EligibilityNoteSchema = grounded({ note: z.string() });
export type EligibilityNote = z.infer<typeof EligibilityNoteSchema>;

/**
 * The full grounded application-requirements spec for one opportunity.
 * Top-level metadata (`opportunity_id`, `program_title`, `source_label`,
 * `extracted_at`) is set by the extractor from the record, not the model; the
 * arrays are the grounded, validated extraction.
 */
export const ApplicationRequirementsSchema = z.object({
  opportunity_id: z.string(),
  program_title: z.string(),
  /** Human-readable source label (e.g. "grants.gov", "SBIR/STTR"). */
  source_label: z.string(),
  /** ISO-8601 timestamp of when this extraction ran. */
  extracted_at: z.string().datetime(),

  narrative_sections: z.array(NarrativeSectionSchema).default([]),
  forms: z.array(RequiredFormSchema).default([]),
  format_limits: z.array(FormatLimitSchema).default([]),
  budget_rules: z.array(BudgetRuleSchema).default([]),
  attachments: z.array(RequiredAttachmentSchema).default([]),
  key_dates: z.array(KeyDateSchema).default([]),
  eligibility_notes: z.array(EligibilityNoteSchema).default([]),
});
export type ApplicationRequirements = z.infer<typeof ApplicationRequirementsSchema>;
