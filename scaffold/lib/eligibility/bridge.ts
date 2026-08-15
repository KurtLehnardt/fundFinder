import type { StartupProfile, Opportunity } from "../contracts";
import type { CompanyProfile } from "../contracts/companyProfile";
import type { ScreenableOpportunity } from "./screen";

/**
 * bridge.ts (ELG-04) — the v1 → v2 adapter that lets the ELG-01 screening engine
 * run inside the LIVE match pipeline (`lib/match.ts`).
 *
 * THE PROBLEM: `extractProfile` (the live pipeline) returns the v1
 * `StartupProfile` — `employees`, `industry`, `location`, … — which carries NONE
 * of the eligibility FACTS `screen()` gates on (`entity_type`, `us_owned`,
 * `sam_registered`, `uei`, `certifications`, `prior_federal_funding`,
 * geography designations). We must NOT invent them: a fabricated ownership /
 * entity-type / registration fact is exactly the false-exclusion failure R8/§11
 * exists to prevent.
 *
 * THE RULE: map ONLY facts the v1 profile genuinely knows, and leave every gate
 * the v1 profile cannot settle UNSET — so `screen()` honestly returns
 * `conditionally_eligible` / `unknown` (never a guess) for those gates, and the
 * authoritative universal overlay drives the buckets. The one screening-relevant
 * fact the v1 profile has is `employees` → `employee_count`, and it is marked
 * `model_inferred` (the extractor inferred it), which R8.4 already forbids from
 * driving an exclusion — so an apparent size violation renders `unknown`
 * ("confirm this and we'll screen it"), never `excluded`. That is correct and
 * intended.
 *
 * PURE. No LLM, no network — a plain shape transform.
 */

/** Nominal confidence for a fact the extractor inferred (unused by gating). */
const INFERRED_CONFIDENCE = 0.5;

/**
 * Bridge the v1 `StartupProfile` to the v2 `CompanyProfile` `screen()` reads.
 *
 * MAPPED (genuinely known):
 *   - `description` → `raw_text` (`user_stated` — the founder's own account;
 *     not a gate, screen() never reads it, kept for a complete profile object).
 *   - `employees`   → `employee_count` (`model_inferred` — the extractor's guess;
 *     the ONLY screening gate the v1 profile can fill). Omitted when absent /
 *     not a finite non-negative number.
 *
 * LEFT UNSET (v1 profile has no such fact — never fabricated):
 *   `entity_type`, `us_owned`, `sam_registered`, `uei`, `certifications`,
 *   `prior_federal_funding`, `geography_designations`. Each unset gate makes
 *   `screen()` return `conditionally_eligible` (registration) or `unknown`
 *   (a hard gate) rather than guessing — the honest, R8.2/R8.4-safe answer.
 */
export function toCompanyProfile(sp: StartupProfile): CompanyProfile {
  const profile: CompanyProfile = {
    id: "v1-startup-profile",
    raw_text: {
      value: sp.description ?? "",
      provenance: "user_stated",
      confidence: 1,
    },
    interview_answers: [],
  };

  // The one eligibility-relevant fact the v1 profile carries. `model_inferred`
  // on purpose: it was extracted, not confirmed — so R8.4 keeps it from ever
  // driving an `excluded` bucket (a size violation becomes `unknown`, not a bar).
  if (
    typeof sp.employees === "number" &&
    Number.isFinite(sp.employees) &&
    sp.employees >= 0
  ) {
    profile.employee_count = {
      value: Math.round(sp.employees),
      provenance: "model_inferred",
      confidence: INFERRED_CONFIDENCE,
    };
  }

  return profile;
}

/**
 * Map a v1 corpus `Opportunity` to the minimal `ScreenableOpportunity` the engine
 * reads. `title` falls back to `program` so the universal overlay's SBIR/STTR
 * detection (`isSbirSttr`, which scans title + program) fires on the v1 corpus,
 * whose human title lives in `program`.
 *
 * No per-opportunity rules are supplied: the v1 corpus has only a free-text
 * `eligibility` string (no structured, predicated rules), so per-opp rules are
 * empty and the authoritative universal overlay drives the buckets. That is the
 * expected ELG-04 behavior for the v1 corpus.
 */
export function toScreenableOpportunity(opp: Opportunity): ScreenableOpportunity {
  return {
    id: opp.id,
    title: opp.title ?? opp.program,
    program: opp.program,
  };
}
