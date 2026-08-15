import {
  EligibilityDeterminationSchema,
  type EligibilityDetermination,
} from "@/lib/contracts/eligibilityDetermination";

/**
 * FE-04 — fixtures for the ELG-01 three-bucket eligibility DISPLAY (R8.2 / R7.3).
 *
 * These are hand-authored `EligibilityDetermination` objects, each run through
 * `EligibilityDeterminationSchema.parse(...)` so they are guaranteed to satisfy
 * the same invariants the real `screen()` engine (lib/eligibility/screen.ts)
 * enforces — in particular the R8.2/R8.4 refinements: an `excluded`
 * determination must cite at least one failed rule, and that rule cannot be
 * `model_inferred` alone.
 *
 * This is fixture data for the FE-04 preview route only. Wiring `screen()`
 * into the live pipeline (lib/match.ts / OpportunityMap) so real determinations
 * reach this UI is a later integration task, not part of FE-04.
 */

/** Pairs a determination with the display copy it doesn't itself carry. */
export type EligibilityItem = {
  determination: EligibilityDetermination;
  title?: string;
  agency?: string;
};

const iso = (s: string) => new Date(s).toISOString();

// ---------------------------------------------------------------------------
// 1. Eligible — every gate the Canon has a rule for is satisfied.
// ---------------------------------------------------------------------------

const eligibleDetermination: EligibilityDetermination = EligibilityDeterminationSchema.parse({
  opportunity_id: "sbir-nih-phase1-digital-health",
  bucket: "eligible",
  satisfied_rules: [
    {
      rule_id: "univ-size-500",
      category: "size_ownership",
      description: "For-profit small business with 500 or fewer employees, majority U.S.-owned.",
      provenance: "verified",
      citation: {
        source_name: "13 CFR 121.702(c)",
        quote: "not more than 500 employees",
      },
    },
    {
      rule_id: "nih-topic-fit",
      category: "program_specific",
      description: "Proposed R&D falls within the NIH Digital Health topic area named in this NOFO.",
      // Deliberately model_inferred — demonstrates that an inferred but SATISFYING
      // rule is still shown with an honest "needs review" note rather than being
      // presented as a settled fact (provenance honesty, R8.4's spirit).
      provenance: "model_inferred",
      citation: { source_name: "NIH SBIR Phase I NOFO PA-25-303" },
    },
  ],
  failed_rules: [],
  unknown_rules: [],
  required_steps: [],
  rule_source: {
    source_name: "NIH SBIR/STTR Phase I NOFO PA-25-303",
    source_url: "https://grants.nih.gov/grants/guide/pa-files/PA-25-303.html",
    retrieved_at: iso("2026-06-01T00:00:00Z"),
  },
});

// ---------------------------------------------------------------------------
// 2. Conditionally eligible — reachable after a concrete, timed step.
// ---------------------------------------------------------------------------

const conditionalDetermination: EligibilityDetermination = EligibilityDeterminationSchema.parse({
  opportunity_id: "nsf-convergence-accelerator-2026",
  bucket: "conditionally_eligible",
  satisfied_rules: [
    {
      rule_id: "entity-type-us-business",
      category: "entity_type",
      description: "U.S.-based for-profit organization, non-profit, or institution of higher education.",
      provenance: "verified",
      citation: { source_name: "NSF Convergence Accelerator Program Solicitation NSF 25-565" },
    },
  ],
  failed_rules: [],
  unknown_rules: [],
  required_steps: [
    {
      step: "Register the entity in SAM.gov and obtain a UEI before the application deadline.",
      lead_time_days: 21,
      why:
        "SAM.gov registration commonly takes several weeks — start well before a deadline. " +
        "This is a timeline blocker, not an eligibility bar.",
    },
  ],
  rule_source: {
    source_name: "NSF Convergence Accelerator Program Solicitation NSF 25-565",
    source_url: "https://www.nsf.gov/funding/opportunities/convergence-accelerator",
    retrieved_at: iso("2026-05-20T00:00:00Z"),
  },
});

// ---------------------------------------------------------------------------
// 3. Unknown — a hard gate the profile doesn't settle. Never guessed.
// ---------------------------------------------------------------------------

const unknownDetermination: EligibilityDetermination = EligibilityDeterminationSchema.parse({
  opportunity_id: "doe-sbir-advanced-manufacturing",
  bucket: "unknown",
  satisfied_rules: [],
  failed_rules: [],
  unknown_rules: [
    {
      rule_id: "sbir-majority-ownership",
      category: "size_ownership",
      description:
        "Majority ownership by U.S. individuals, or a qualifying venture-capital/private-equity " +
        "structure meeting SBA requirements.",
      // model_inferred here means: the fact needed to settle this is only
      // inferred, not confirmed — so the engine renders unknown, never a guess.
      provenance: "model_inferred",
      citation: { source_name: "13 CFR 121.702", quote: "majority-owned by individuals who are citizens" },
    },
  ],
  required_steps: [],
  rule_source: {
    source_name: "DOE SBIR/STTR FY26 Phase I FOA",
    source_url: "https://science.osti.gov/sbir/Funding-Opportunities",
    retrieved_at: iso("2026-04-15T00:00:00Z"),
  },
});

// ---------------------------------------------------------------------------
// 4. Excluded — a reviewed, cited rule the profile fails. Never silent.
// ---------------------------------------------------------------------------

const excludedDetermination: EligibilityDetermination = EligibilityDeterminationSchema.parse({
  opportunity_id: "usda-rbdg-2026",
  bucket: "excluded",
  satisfied_rules: [],
  failed_rules: [
    {
      rule_id: "rbdg-entity-type",
      category: "entity_type",
      description:
        "Eligible applicants are limited to rural nonprofit corporations, rural public bodies, and " +
        "federally recognized Indian tribes; for-profit corporations are not eligible.",
      provenance: "verified",
      citation: {
        source_name: "7 CFR 4280.113",
        source_url: "https://www.ecfr.gov/current/title-7/subtitle-B/chapter-XLII/part-4280",
        quote: "Rural nonprofit corporations, rural public bodies, and federally recognized Indian Tribes are eligible.",
      },
    },
  ],
  unknown_rules: [],
  required_steps: [],
  rule_source: {
    source_name: "USDA Rural Business Development Grant Program",
    source_url: "https://www.rd.usda.gov/programs-services/business-programs/rural-business-development-grants",
    retrieved_at: iso("2026-03-10T00:00:00Z"),
  },
});

// ---------------------------------------------------------------------------
// Display copy — determinations only carry an opportunity_id, so title/agency
// for the preview come from here. Plausible, non-guarantee copy only (R7.7).
// ---------------------------------------------------------------------------

export const SAMPLE_ELIGIBILITY_ITEMS: EligibilityItem[] = [
  {
    determination: eligibleDetermination,
    title: "SBIR Phase I — Digital Health",
    agency: "NIH",
  },
  {
    determination: conditionalDetermination,
    title: "NSF Convergence Accelerator",
    agency: "NSF",
  },
  {
    determination: unknownDetermination,
    title: "DOE SBIR/STTR — Advanced Manufacturing",
    agency: "DOE",
  },
  {
    determination: excludedDetermination,
    title: "Rural Business Development Grant",
    agency: "USDA Rural Development",
  },
];
