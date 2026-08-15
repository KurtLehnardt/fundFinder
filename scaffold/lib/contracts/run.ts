import { z } from "zod";
import { CompanyProfileSchema } from "./companyProfile";
import { OpportunityMapSchema } from "./opportunityMap";
import { EligibilityDeterminationSchema } from "./eligibilityDetermination";
import { VerificationItemSchema } from "./verificationItem";
import { EntitlementsSchema, SubscriptionTierSchema } from "./entitlements";
import { RunBudgetSchema } from "./runBudget";

/**
 * §3.12 — Run (the persisted unit from R9.2)
 *
 * Every completed run stored as a unit: enriched profile, results, eligibility
 * determinations, verification states, Canon snapshot version, prompt
 * version(s), model(s) used, timestamp. Given a bad output it must be possible
 * to reconstruct exactly what produced it (R10.2).
 *
 * CON-01 defines the SHAPE only. Actual persistence (server-side post-R9,
 * localStorage pre-R9 per R9.0) is Team Platform.
 */

export const RunStatusSchema = z.enum([
  "in_progress",
  "completed",
  "canceled",
  "failed",
  "partial", // degraded — one source down / budget hit (§4.6, §5.2)
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

/**
 * §5.3 consent is a timestamped record, not a boolean. Defaults to off; an
 * unchecked box is a hard constraint on retention/reuse, not a preference.
 */
export const ConsentRecordSchema = z.object({
  granted: z.boolean(),
  /** ISO-8601 timestamp of the grant/revocation. */
  timestamp: z.string().datetime(),
});
export type ConsentRecord = z.infer<typeof ConsentRecordSchema>;

export const RunSchema = z.object({
  id: z.string(),
  /** ISO-8601 creation timestamp. */
  created_at: z.string().datetime(),
  status: RunStatusSchema,

  tier: SubscriptionTierSchema,
  /** Entitlements snapshot at run time. */
  entitlements: EntitlementsSchema.optional(),

  /** The enriched profile the run read (§3.1). */
  profile: CompanyProfileSchema,
  /** The result (§3.6). Absent while in_progress or on hard failure. */
  opportunity_map: OpportunityMapSchema.optional(),
  /** Per-opportunity eligibility (§3.5). */
  eligibility_determinations: z.array(EligibilityDeterminationSchema).default([]),
  /** Verification states (§3.3). */
  verification_items: z.array(VerificationItemSchema).default([]),

  // --- Reproducibility (R10.2) ---
  /** Canon snapshot version the run read. */
  canon_snapshot_version: z.string(),
  /** Prompt registry versions used, keyed by prompt name. */
  prompt_versions: z.record(z.string(), z.string()).default({}),
  /** Model ids used across the run. */
  models_used: z.array(z.string()).default([]),
  /** Eval-set commit, if the run was executed under test. */
  eval_set_commit: z.string().optional(),

  /** Budget the run executed under (§3.10). */
  run_budget: RunBudgetSchema.optional(),
  /** Wall-clock elapsed time, ms. */
  elapsed_ms: z.number().int().nonnegative().optional(),
  /** §5.3 reuse consent — timestamped, defaults off. */
  consent: ConsentRecordSchema.optional(),
});
export type Run = z.infer<typeof RunSchema>;
