import { z } from "zod";
import { OpportunitySchema } from "./opportunity";

/**
 * §3.6 — OpportunityMap (the existing v1 output schema, formalized + versioned)
 *
 * This formalizes the exact shape `lib/match.ts` `buildOpportunityMap()`
 * returns today and the shape frozen into `data/precomputed.json`. The only
 * addition is an OPTIONAL `version` tag (§3.6 "Version it now; it will change").
 *
 * Why `version` is optional, not defaulted-to-required: the cached responses in
 * `data/precomputed.json` have no `version` field, and `lib/match.ts` returns
 * objects with no `version`. Making it optional keeps both compiling/parsing
 * unchanged while still giving producers a place to stamp the version. This is
 * the "additive, must not break the cached responses" requirement from CON-01.
 *
 * The v1 supporting types (`Tier`, `StartupProfile`, `CriterionCheck`,
 * `AwardHistory`, `Match`) live here because they are only meaningful as parts
 * of this output schema. NOTE: the tier *label/colour* maps (`TIER_LABEL`,
 * `TIER_COLOR`) are design values and intentionally do NOT live in
 * `lib/contracts/` (CON-01 forbids raw hex here — that is CON-02). They stay in
 * `lib/types.ts`.
 */

export const CURRENT_OPPORTUNITY_MAP_VERSION = "1.0.0";

export const TierSchema = z.enum(["likely", "verify", "adjacent", "none"]);
export type Tier = z.infer<typeof TierSchema>;

/**
 * v1 profile. Distinct from the v2 §3.1 `CompanyProfile`: this is the ad-hoc
 * shape the live pipeline extracts and passes around. Kept verbatim so
 * `lib/match.ts` / `lib/claude.ts` compile unchanged.
 */
export const StartupProfileSchema = z.object({
  description: z.string(),
  industry: z.string().optional(),
  technology: z.string().optional(),
  location: z.string().optional(),
  employees: z.number().optional(),
  revenue: z.string().optional(),
  fundingStage: z.string().optional(),
  capitalRaised: z.string().optional(),
  rdActivities: z.string().optional(),
  productMaturity: z.string().optional(),
  targetCustomers: z.string().optional(),
  capitalRequirement: z.string().optional(),
  useOfFunds: z.string().optional(),
  expandedTerms: z.array(z.string()).optional(),
  naicsGuesses: z.array(z.string()).optional(),
});
export type StartupProfile = z.infer<typeof StartupProfileSchema>;

export const CriterionCheckSchema = z.object({
  label: z.string(),
  met: z.boolean(),
  note: z.string().optional(),
});
export type CriterionCheck = z.infer<typeof CriterionCheckSchema>;

export const AwardHistorySchema = z.object({
  similarCompanies: z.number(),
  totalAwarded: z.number(),
  medianAward: z.number(),
  inState: z.number(),
  inVertical: z.number(),
  recipients: z.array(
    z.object({
      company: z.string(),
      program: z.string(),
      agency: z.string(),
      amount: z.number(),
      year: z.number(),
    }),
  ),
});
export type AwardHistory = z.infer<typeof AwardHistorySchema>;

export const MatchSchema = z.object({
  opportunity: OpportunitySchema,
  tier: TierSchema,
  score: z.number(),
  criteria: z.array(CriterionCheckSchema),
  whyFit: z.string(),
  whyIneligible: z.string(),
  whatToVerify: z.string(),
  whatToDoNext: z.string(),
  history: AwardHistorySchema.optional(),
});
export type Match = z.infer<typeof MatchSchema>;

export const OpportunityMapSchema = z.object({
  profile: StartupProfileSchema,
  followUps: z.array(z.string()),
  summary: z.object({
    highPotential: z.number(),
    fundingIdentified: z.number(),
    agencies: z.number(),
    closingIn90Days: z.number(),
  }),
  matches: z.array(MatchSchema),
  /** Set when nothing clears the bar. This is a finding, not a failure. */
  weakFieldFinding: z
    .object({
      headline: z.string(),
      reasoning: z.string(),
      redirects: z.array(z.object({ label: z.string(), why: z.string() })),
    })
    .optional(),
  agencyIntelligence: z.array(
    z.object({
      agency: z.string(),
      why: z.string(),
      opportunityCount: z.number(),
    }),
  ),
  /**
   * Additive version tag (§3.6). Optional so v1 producers and cached responses
   * remain valid; stamp it with `CURRENT_OPPORTUNITY_MAP_VERSION` on new writes.
   */
  version: z.string().optional(),
});
export type OpportunityMap = z.infer<typeof OpportunityMapSchema>;
