export type Tier = "likely" | "verify" | "adjacent" | "none";

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

/** A founder's company, extracted from natural language. */
export interface StartupProfile {
  description: string;
  industry?: string;
  technology?: string;
  location?: string;
  employees?: number;
  revenue?: string;
  fundingStage?: string;
  capitalRaised?: string;
  rdActivities?: string;
  productMaturity?: string;
  targetCustomers?: string;
  capitalRequirement?: string;
  useOfFunds?: string;
  /** Government-vocabulary terms expanded from the founder's own words. */
  expandedTerms?: string[];
  naicsGuesses?: string[];
}

/** One normalized opportunity, whatever source it came from. */
export interface Opportunity {
  id: string;
  source: "grants.gov" | "sbir" | "assistance-listings" | "sam-contracts";
  kind: "grant" | "rd" | "assistance" | "procurement";
  program: string;
  agency: string;
  description: string;
  eligibility?: string;
  fundingLow?: number;
  fundingHigh?: number;
  deadline?: string;
  forecasted?: boolean;
  industryTags?: string[];
  geography?: string;
  url?: string;
  embedding?: number[];
}

/** Historical award intelligence attached to an opportunity. */
export interface AwardHistory {
  similarCompanies: number;
  totalAwarded: number;
  medianAward: number;
  inState: number;
  inVertical: number;
  recipients: Array<{
    company: string;
    program: string;
    agency: string;
    amount: number;
    year: number;
  }>;
}

export interface CriterionCheck {
  label: string;
  met: boolean;
  note?: string;
}

export interface Match {
  opportunity: Opportunity;
  tier: Tier;
  score: number;
  criteria: CriterionCheck[];
  whyFit: string;
  whyIneligible: string;
  whatToVerify: string;
  whatToDoNext: string;
  history?: AwardHistory;
}

export interface OpportunityMap {
  profile: StartupProfile;
  followUps: string[];
  summary: {
    highPotential: number;
    fundingIdentified: number;
    agencies: number;
    closingIn90Days: number;
  };
  matches: Match[];
  /** Set when nothing clears the bar. This is a finding, not a failure. */
  weakFieldFinding?: {
    headline: string;
    reasoning: string;
    redirects: Array<{ label: string; why: string }>;
  };
  agencyIntelligence: Array<{ agency: string; why: string; opportunityCount: number }>;
}
