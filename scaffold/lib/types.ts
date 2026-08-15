/**
 * lib/types.ts — v1 public type surface, now backed by the §3 contracts.
 *
 * CON-01 migrated the v1 ad-hoc types into `lib/contracts/` (zod schema +
 * inferred type per §3). This file now RE-EXPORTS those contract types so
 * `lib/match.ts`, `lib/claude.ts`, and `components/*` keep importing from
 * `@/lib/types` unchanged.
 *
 * Two presentational constants (`TIER_LABEL`, `TIER_COLOR`) stay here rather
 * than in `lib/contracts/`: they hold raw hex, and CON-01 forbids design values
 * in the contracts module (that is CON-02). Keeping them here is the minimal,
 * non-breaking home for them until the design-token contract lands.
 */

import type { Tier } from "./contracts";
import type {
  Match as MatchContract,
  OpportunityMap as OpportunityMapContract,
} from "./contracts";
import type { EligibilityDeterminationWithFreshness } from "./eligibility/freshness";

// Re-export the formalized v1 types (and the richer §3 Opportunity superset)
// from the contracts barrel. Same names the v1 code already imports.
export type {
  Tier,
  StartupProfile,
  Opportunity,
  AwardHistory,
  CriterionCheck,
} from "./contracts";

/**
 * ELG-04 — app-facing `Match` is the frozen CON-01 contract `Match` plus an
 * OPTIONAL, additive `eligibility` field: the ELG-01 determination wrapped with
 * its ELG-02 freshness annotation, attached by `buildOpportunityMap`.
 *
 * The zod `MatchSchema` in `lib/contracts` stays the frozen v1 shape (so
 * `data/precomputed.json` keeps validating), and this augmentation is TS-only
 * and cache-safe: cached maps simply lack the field, and every unit that reads
 * `Match`/`OpportunityMap` already imports them from `@/lib/types`, so they all
 * see the optional field.
 */
export type Match = MatchContract & {
  eligibility?: EligibilityDeterminationWithFreshness;
};

export type OpportunityMap = Omit<OpportunityMapContract, "matches"> & {
  matches: Match[];
};

export const TIER_LABEL: Record<Tier, string> = {
  likely: "Likely Fit",
  verify: "Potential Fit — Verify Eligibility",
  adjacent: "Adjacent Opportunity",
  none: "Probably Not a Fit",
};

export const TIER_COLOR: Record<Tier, string> = {
  likely: "#1E7A4C",
  verify: "#B4801A",
  adjacent: "#C25A2B",
  none: "#6B7280",
};
