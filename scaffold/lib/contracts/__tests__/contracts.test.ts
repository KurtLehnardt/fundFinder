import { test } from "node:test";
import assert from "node:assert/strict";

import { OpportunitySchema, EligibilityRuleSchema } from "../opportunity";
import { EligibilityDeterminationSchema } from "../eligibilityDetermination";
import { VerificationItemSchema } from "../verificationItem";
import {
  EntitlementsSchema,
  DEFAULT_ENTITLEMENTS,
} from "../entitlements";
import { RunBudgetSchema, DEFAULT_RUN_BUDGETS } from "../runBudget";
import {
  ModelRoutingTableSchema,
  DEFAULT_MODEL_ROUTING,
} from "../modelRouting";
import { RunSchema } from "../run";
import { CompanyProfileSchema } from "../companyProfile";

const NOW_ISO = new Date().toISOString();

const eligibilityRule = {
  id: "rule_entity_type",
  category: "entity_type",
  description: "Limited to for-profit small businesses.",
  citation: { source_name: "SBIR PA", source_url: "https://www.sbir.gov/x", retrieved_at: NOW_ISO },
  provenance: "verified",
};

const opportunity = {
  // v1 base
  id: "opp_1",
  source: "grants.gov",
  kind: "grant",
  program: "Example Program",
  agency: "HHS",
  description: "An example NOFO.",
  fundingLow: 100000,
  fundingHigh: 500000,
  // §3.4 canon additions
  source_id: "HHS-2025-0001",
  title: "Example Program",
  status: "open",
  key_dates: { close_date: NOW_ISO },
  award_range: { floor: 100000, ceiling: 500000, currency: "USD" },
  eligibility_rules: [eligibilityRule],
  retrieved_at: NOW_ISO,
  corpus_version: "canon-2026-08-01",
};

test("§3.4 Opportunity (canon superset) parses", () => {
  assert.doesNotThrow(() => OpportunitySchema.parse(opportunity));
});

test("§3.4 EligibilityRule requires a citation and provenance", () => {
  assert.doesNotThrow(() => EligibilityRuleSchema.parse(eligibilityRule));
  const noProv = { ...eligibilityRule } as Record<string, unknown>;
  delete noProv.provenance;
  assert.equal(EligibilityRuleSchema.safeParse(noProv).success, false);
});

test("§3.5 EligibilityDetermination parses; rule evals carry provenance", () => {
  const det = {
    opportunity_id: "opp_1",
    bucket: "conditionally_eligible",
    satisfied_rules: [],
    failed_rules: [],
    unknown_rules: [
      {
        rule_id: "rule_entity_type",
        category: "entity_type",
        description: "Entity type unknown",
        provenance: "model_inferred",
      },
    ],
    required_steps: [
      { step: "Register in SAM.gov", lead_time_days: 21, why: "Required before submission" },
    ],
  };
  assert.doesNotThrow(() => EligibilityDeterminationSchema.parse(det));
});

test("§3.3 VerificationItem parses; classification is enumerated", () => {
  const item = {
    id: "v1",
    claim: "This program is still open",
    classification: "auto_verifiable",
    status: "verified",
    resolution: "Open through 2026-09-30",
    source_url: "https://grants.gov/x",
    retrieved_at: NOW_ISO,
  };
  assert.doesNotThrow(() => VerificationItemSchema.parse(item));
  assert.equal(
    VerificationItemSchema.safeParse({ ...item, classification: "maybe" }).success,
    false,
  );
});

test("§3.3 a verified item WITHOUT a source_url is rejected (R2)", () => {
  const base = {
    id: "v2",
    claim: "This program is still open",
    classification: "auto_verifiable",
  };
  // verified + no source_url → invalid
  assert.equal(
    VerificationItemSchema.safeParse({ ...base, status: "verified" }).success,
    false,
  );
  // verified + source_url → valid
  assert.equal(
    VerificationItemSchema.safeParse({
      ...base,
      status: "verified",
      source_url: "https://grants.gov/x",
    }).success,
    true,
  );
  // non-verified without a source_url is fine
  assert.equal(
    VerificationItemSchema.safeParse({ ...base, status: "pending" }).success,
    true,
  );
});

test("§3.5 an `excluded` bucket with empty failed_rules is rejected (R8.2)", () => {
  const det = {
    opportunity_id: "opp_1",
    bucket: "excluded",
    failed_rules: [],
  };
  assert.equal(EligibilityDeterminationSchema.safeParse(det).success, false);
});

test("§3.5 an exclusion driven only by model_inferred rules is rejected (R8.4)", () => {
  const det = {
    opportunity_id: "opp_1",
    bucket: "excluded",
    failed_rules: [
      {
        rule_id: "rule_entity_type",
        category: "entity_type",
        description: "Guessed the entity is a nonprofit",
        provenance: "model_inferred",
      },
    ],
  };
  assert.equal(EligibilityDeterminationSchema.safeParse(det).success, false);
});

test("§3.5 an exclusion with a verified/user_stated failed rule is valid", () => {
  const det = {
    opportunity_id: "opp_1",
    bucket: "excluded",
    failed_rules: [
      {
        rule_id: "rule_entity_type",
        category: "entity_type",
        description: "Limited to institutions of higher education",
        provenance: "verified",
        citation: { source_name: "NOFO", source_url: "https://grants.gov/x" },
      },
      {
        rule_id: "rule_size",
        category: "size_ownership",
        description: "Model-guessed size gate",
        provenance: "model_inferred",
      },
    ],
  };
  assert.equal(EligibilityDeterminationSchema.safeParse(det).success, true);
});

test("§3.7 Entitlements defaults validate for every tier", () => {
  for (const tier of Object.keys(DEFAULT_ENTITLEMENTS) as Array<keyof typeof DEFAULT_ENTITLEMENTS>) {
    assert.doesNotThrow(() => EntitlementsSchema.parse(DEFAULT_ENTITLEMENTS[tier]));
  }
});

test("§3.10 RunBudget defaults validate for every tier", () => {
  for (const tier of Object.keys(DEFAULT_RUN_BUDGETS) as Array<keyof typeof DEFAULT_RUN_BUDGETS>) {
    assert.doesNotThrow(() => RunBudgetSchema.parse(DEFAULT_RUN_BUDGETS[tier]));
  }
});

test("§3.9 default model routing table validates", () => {
  assert.doesNotThrow(() => ModelRoutingTableSchema.parse(DEFAULT_MODEL_ROUTING));
});

test("§3.12 Run parses with a profile + reproducibility metadata", () => {
  const profile = CompanyProfileSchema.parse({
    id: "profile_1",
    raw_text: { value: "We build AI for hospitals.", provenance: "user_stated", confidence: 1 },
    interview_answers: [],
  });
  const run = {
    id: "run_1",
    created_at: NOW_ISO,
    status: "completed",
    tier: "free",
    profile,
    canon_snapshot_version: "canon-2026-08-01",
    prompt_versions: { extract: "v3", analyze: "v7" },
    models_used: ["claude-sonnet-4-6"],
  };
  assert.doesNotThrow(() => RunSchema.parse(run));
});
