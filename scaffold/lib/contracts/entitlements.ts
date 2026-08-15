import { z } from "zod";

/**
 * §3.7 — Entitlements (feature flags per tier)
 *
 * Every Pro surface reads from this; there are no tier checks scattered through
 * components (§3.7). This contract defines only the *shape* and a default map —
 * server-side ENFORCEMENT is PLT-07 (out of scope for CON-01), and the R9.0
 * mock auth gates nothing.
 */

// Named `SubscriptionTier` (not `Tier`) to avoid colliding with the match-tier
// `Tier` in `opportunityMap.ts` when both surface through the barrel.
export const SubscriptionTierSchema = z.enum(["free", "pro"]);
export type SubscriptionTier = z.infer<typeof SubscriptionTierSchema>;

/** Named feature flags. R5 = competitor intel, R6 = assisted application. */
export const EntitlementsSchema = z.object({
  tier: SubscriptionTierSchema,
  features: z.object({
    /** R5 — named competitor list + per-company award analysis. */
    competitor_intelligence: z.boolean(),
    /** R6 — assisted application package builder. */
    assisted_application: z.boolean(),
    /** R9.2 — save/revisit runs. */
    save_runs: z.boolean(),
    /** R2 — batch "Verify these for me". */
    batch_verification: z.boolean(),
  }),
  /** Optional numeric limits per tier (nullable = unlimited). */
  limits: z
    .object({
      saved_runs: z.number().int().nonnegative().nullable().optional(),
      verifications_per_run: z.number().int().nonnegative().nullable().optional(),
    })
    .optional(),
});
export type Entitlements = z.infer<typeof EntitlementsSchema>;

/**
 * Default entitlements per tier. The free path is never gated on any of the
 * core R1–R4b/R8 flow — only the two monetization surfaces are Pro.
 */
export const DEFAULT_ENTITLEMENTS: Record<SubscriptionTier, Entitlements> = {
  free: {
    tier: "free",
    features: {
      competitor_intelligence: false,
      assisted_application: false,
      save_runs: false,
      batch_verification: false,
    },
    limits: { saved_runs: 0, verifications_per_run: 3 },
  },
  pro: {
    tier: "pro",
    features: {
      competitor_intelligence: true,
      assisted_application: true,
      save_runs: true,
      batch_verification: true,
    },
    limits: { saved_runs: null, verifications_per_run: null },
  },
};
