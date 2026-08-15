import { test } from "node:test";
import assert from "node:assert/strict";
import { screen, type ScreeningRule, type ScreenableOpportunity } from "../screen";
import { EligibilityDeterminationSchema } from "../../contracts/eligibilityDetermination";
import type { CompanyProfile } from "../../contracts/companyProfile";
import type { Provenance } from "../../contracts/primitives";

/**
 * ELG-01 unit tests — pure logic over the frozen golden set's eligibility cases
 * (orchestrator §5.4). The primary metric is ZERO FALSE EXCLUSIONS (EVL-03):
 * every scenario that is not a legitimate, reviewed-rule exclusion must land in
 * some bucket OTHER than `excluded`.
 *
 * Fixtures only — no live DB, no LLM.
 */

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** A provenanced profile field. */
function pf<T>(value: T, provenance: Provenance = "user_stated", confidence = 1) {
  return { value, provenance, confidence };
}

/** Build a valid CompanyProfile with sensible defaults + overrides. */
function profile(overrides: Partial<CompanyProfile> = {}): CompanyProfile {
  return {
    id: "profile-1",
    raw_text: pf("We build software.", "user_stated"),
    interview_answers: [],
    ...overrides,
  };
}

let oppCounter = 0;
function opp(over: Partial<ScreenableOpportunity> = {}): ScreenableOpportunity {
  oppCounter += 1;
  return {
    id: `opp-${oppCounter}`,
    program: "Test Grant Program",
    title: "Test Grant Program",
    ...over,
  };
}

/** A reviewed (human-verified) rule — the only kind that may drive exclusion. */
function verifiedRule(over: Partial<ScreeningRule> & Pick<ScreeningRule, "id" | "category" | "description" | "predicate">): ScreeningRule {
  return {
    provenance: "verified",
    citation: {
      source_url: "https://www.grants.gov/example",
      source_name: "Example NOFO",
      quote: "Eligibility is limited as stated.",
    },
    ...over,
  };
}

/** A model_inferred rule (what CAN-04 writes) — must NEVER drive exclusion. */
function inferredRule(over: Partial<ScreeningRule> & Pick<ScreeningRule, "id" | "category" | "description" | "predicate">): ScreeningRule {
  return {
    provenance: "model_inferred",
    citation: {
      source_url: "https://www.grants.gov/example",
      source_name: "Example NOFO (model-extracted)",
      quote: "some inferred clause",
    },
    ...over,
  };
}

/** Assert a determination is schema-valid AND never a bad exclusion (R8.4). */
function assertSafe(d: ReturnType<typeof screen>) {
  // Round-trips through the CON-01 schema (screen() already parses, belt-and-braces).
  assert.doesNotThrow(() => EligibilityDeterminationSchema.parse(d));
  if (d.bucket === "excluded") {
    assert.ok(d.failed_rules.length > 0, "excluded must cite a failed rule (R8.2)");
    assert.ok(
      d.failed_rules.some((r) => r.provenance !== "model_inferred"),
      "excluded must not rest solely on model_inferred rules (R8.4)",
    );
  }
  return d;
}

// ---------------------------------------------------------------------------
// GOLDEN CASE 1 — nonprofit → excluded (cited, reviewed rule)
// ---------------------------------------------------------------------------

test("nonprofit against a higher-ed-only NOFO → excluded, with the cited rule", () => {
  const rule = verifiedRule({
    id: "rule-highered-only",
    category: "entity_type",
    description: "This program is limited to institutions of higher education.",
    predicate: { kind: "entity_type_in", allowed: ["higher_education"] },
  });
  const d = assertSafe(
    screen(profile({ entity_type: pf("nonprofit", "user_stated") }), opp(), [rule]),
  );
  assert.equal(d.bucket, "excluded");
  assert.equal(d.failed_rules.length, 1);
  assert.equal(d.failed_rules[0].rule_id, "rule-highered-only");
  // Reason + citation are always shown (never a silent/opaque exclusion).
  assert.ok(d.failed_rules[0].citation?.source_url, "exclusion cites its source");
  assert.notEqual(d.failed_rules[0].provenance, "model_inferred");
});

// ---------------------------------------------------------------------------
// GOLDEN CASE 2 — foreign-owned → excluded (reviewed US-ownership rule)
// ---------------------------------------------------------------------------

test("foreign-owned against a reviewed US-ownership NOFO → excluded", () => {
  const rule = verifiedRule({
    id: "rule-us-owned",
    category: "size_ownership",
    description: "Applicants must be majority owned by U.S. citizens or permanent residents.",
    predicate: { kind: "us_ownership_required" },
  });
  const d = assertSafe(
    screen(profile({ us_owned: pf(false, "user_stated") }), opp(), [rule]),
  );
  assert.equal(d.bucket, "excluded");
  assert.equal(d.failed_rules[0].rule_id, "rule-us-owned");
});

// ---------------------------------------------------------------------------
// GOLDEN CASE 3 — no SAM registration → conditionally_eligible (a step)
// ---------------------------------------------------------------------------

test("no SAM registration → conditional with a SAM.gov step + lead time (never excluded)", () => {
  const d = assertSafe(
    screen(
      profile({
        entity_type: pf("for_profit_small_business", "user_stated"),
        sam_registered: pf(false, "user_stated"),
      }),
      opp(), // universal SAM gate applies to all federal grants
      [], // no per-opp rules
    ),
  );
  assert.equal(d.bucket, "conditionally_eligible");
  assert.equal(d.required_steps.length, 1);
  assert.match(d.required_steps[0].step, /SAM\.gov/);
  assert.ok(
    typeof d.required_steps[0].lead_time_days === "number" && d.required_steps[0].lead_time_days > 0,
    "the step shows its lead time",
  );
  assert.equal(d.failed_rules.length, 0);
});

test("SAM registration already active → satisfied, no step, eligible", () => {
  const d = assertSafe(
    screen(
      profile({
        entity_type: pf("for_profit_small_business", "user_stated"),
        sam_registered: pf(true, "user_stated"),
      }),
      opp(),
      [], // non-SBIR, no per-opp gates
    ),
  );
  assert.equal(d.bucket, "eligible");
  assert.equal(d.required_steps.length, 0);
  assert.ok(d.satisfied_rules.some((r) => r.category === "registration"));
});

// ---------------------------------------------------------------------------
// GOLDEN CASE 4 — model_inferred rule alone → NOT excluded (R8.4)
// ---------------------------------------------------------------------------

test("a failing model_inferred rule NEVER excludes — even with a user_stated fact", () => {
  const rule = inferredRule({
    id: "rule-inferred-entity",
    category: "entity_type",
    description: "Appears limited to higher education (model-extracted, unreviewed).",
    predicate: { kind: "entity_type_in", allowed: ["higher_education"] },
  });
  const d = assertSafe(
    screen(profile({ entity_type: pf("nonprofit", "user_stated") }), opp(), [rule]),
  );
  assert.notEqual(d.bucket, "excluded"); // the crown-jewel invariant
  assert.equal(d.bucket, "unknown"); // surfaced for review, not acted on
  assert.equal(d.failed_rules.length, 0);
  assert.ok(
    d.unknown_rules.some((r) => r.rule_id === "rule-inferred-entity"),
    "the unreviewed rule is surfaced (never silently dropped)",
  );
});

// ---------------------------------------------------------------------------
// GOLDEN CASE 5 — unknown gate → unknown (never guessed)
// ---------------------------------------------------------------------------

test("reviewed gate the profile doesn't settle → unknown (not guessed either way)", () => {
  const rule = verifiedRule({
    id: "rule-highered-only-2",
    category: "entity_type",
    description: "This program is limited to institutions of higher education.",
    predicate: { kind: "entity_type_in", allowed: ["higher_education"] },
  });
  // Profile has NO entity_type at all.
  const d = assertSafe(screen(profile(), opp(), [rule]));
  assert.equal(d.bucket, "unknown");
  assert.equal(d.failed_rules.length, 0);
  assert.ok(d.unknown_rules.some((r) => r.rule_id === "rule-highered-only-2"));
});

// ---------------------------------------------------------------------------
// R8.2 — a model_inferred PROFILE FACT is never sufficient to exclude
// ---------------------------------------------------------------------------

test("reviewed rule + model_inferred failing fact → unknown, not excluded (R8.2)", () => {
  const rule = verifiedRule({
    id: "rule-us-owned-2",
    category: "size_ownership",
    description: "Applicants must be majority U.S.-owned.",
    predicate: { kind: "us_ownership_required" },
  });
  // The fact that would fail was itself only INFERRED.
  const d = assertSafe(
    screen(profile({ us_owned: pf(false, "model_inferred") }), opp(), [rule]),
  );
  assert.notEqual(d.bucket, "excluded");
  assert.equal(d.bucket, "unknown");
});

// ---------------------------------------------------------------------------
// R8.4 — the universal overlay never hard-excludes (SBIR size/ownership)
// ---------------------------------------------------------------------------

const SBIR_OPP: () => ScreenableOpportunity = () =>
  opp({ program: "SBIR Phase I", title: "DoD SBIR Phase I Topic" });

test("SBIR opp + foreign-owned via the UNIVERSAL ownership gate → unknown, not excluded", () => {
  const d = assertSafe(
    screen(
      profile({
        entity_type: pf("for_profit_small_business", "user_stated"),
        us_owned: pf(false, "user_stated"),
        employee_count: pf(10, "user_stated"),
        sam_registered: pf(true, "user_stated"),
      }),
      SBIR_OPP(),
      [], // only the universal SBIR overlay applies
    ),
  );
  assert.notEqual(d.bucket, "excluded"); // authoritative-but-unreviewed → informs only
  assert.equal(d.bucket, "unknown");
  assert.ok(d.unknown_rules.some((r) => r.rule_id === "universal-sbir-ownership"));
});

test("SBIR opp + >500 employees via the UNIVERSAL size gate → unknown, not excluded", () => {
  const d = assertSafe(
    screen(
      profile({
        entity_type: pf("for_profit_small_business", "user_stated"),
        us_owned: pf(true, "user_stated"),
        employee_count: pf(5000, "user_stated"),
        sam_registered: pf(true, "user_stated"),
      }),
      SBIR_OPP(),
      [],
    ),
  );
  assert.notEqual(d.bucket, "excluded");
  assert.equal(d.bucket, "unknown");
  assert.ok(d.unknown_rules.some((r) => r.rule_id === "universal-sbir-size"));
});

test("SBIR opp, US-owned small team, SAM active → eligible", () => {
  const d = assertSafe(
    screen(
      profile({
        entity_type: pf("for_profit_small_business", "user_stated"),
        us_owned: pf(true, "user_stated"),
        employee_count: pf(10, "user_stated"),
        sam_registered: pf(true, "user_stated"),
      }),
      SBIR_OPP(),
      [],
    ),
  );
  assert.equal(d.bucket, "eligible");
});

test("universal SBIR gates do NOT apply to a non-SBIR grant", () => {
  // us_owned unknown would make an SBIR opp `unknown`; a plain grant ignores it.
  const d = assertSafe(
    screen(
      profile({
        entity_type: pf("for_profit_small_business", "user_stated"),
        sam_registered: pf(true, "user_stated"),
      }),
      opp({ program: "Community Development Block Grant", title: "CDBG" }),
      [],
    ),
  );
  assert.equal(d.bucket, "eligible");
});

// ---------------------------------------------------------------------------
// Bucket precedence + program-specific + certification gates
// ---------------------------------------------------------------------------

test("a real exclusion outranks an unmet registration step (excluded wins)", () => {
  const rule = verifiedRule({
    id: "rule-highered-only-3",
    category: "entity_type",
    description: "Limited to institutions of higher education.",
    predicate: { kind: "entity_type_in", allowed: ["higher_education"] },
  });
  const d = assertSafe(
    screen(
      profile({
        entity_type: pf("nonprofit", "user_stated"),
        sam_registered: pf(false, "user_stated"), // would be a step
      }),
      opp(),
      [rule],
    ),
  );
  assert.equal(d.bucket, "excluded");
});

test("Phase II prior-award prerequisite unmet (reviewed) → excluded", () => {
  const rule = verifiedRule({
    id: "rule-phase2",
    category: "program_specific",
    description: "Phase II requires a prior Phase I award.",
    predicate: { kind: "prior_award_required" },
  });
  const d = assertSafe(
    screen(profile({ prior_federal_funding: pf(false, "user_stated") }), opp(), [rule]),
  );
  assert.equal(d.bucket, "excluded");
  assert.equal(d.failed_rules[0].rule_id, "rule-phase2");
});

test("certification gate satisfied → eligible; unknown when unstated", () => {
  const rule = verifiedRule({
    id: "rule-8a",
    category: "program_specific",
    description: "Reserved for 8(a) participants.",
    predicate: { kind: "certification_required", any_of: ["8a"] },
  });
  const eligible = assertSafe(
    screen(
      profile({
        certifications: pf(["8a"], "user_stated"),
        sam_registered: pf(true, "user_stated"),
      }),
      opp(),
      [rule],
    ),
  );
  assert.equal(eligible.bucket, "eligible");

  const unknownWhenUnstated = assertSafe(screen(profile(), opp(), [rule]));
  assert.equal(unknownWhenUnstated.bucket, "unknown");
});

// ---------------------------------------------------------------------------
// Never silently drop + advisory prose handling
// ---------------------------------------------------------------------------

test("every screen returns a determination for the opportunity (never dropped)", () => {
  const d = assertSafe(screen(profile(), opp(), []));
  assert.ok(d.opportunity_id);
});

test("a model_inferred rule WITHOUT a predicate is advisory — never downgrades a clear opp", () => {
  const advisory = inferredRule({
    id: "rule-prose",
    category: "other",
    description: "Some free-text clause the extractor could not structure.",
    predicate: undefined as never, // no recognized predicate
  });
  const d = assertSafe(
    screen(
      profile({
        entity_type: pf("for_profit_small_business", "user_stated"),
        sam_registered: pf(true, "user_stated"),
      }),
      opp(),
      [advisory],
    ),
  );
  assert.equal(d.bucket, "eligible");
});

// ---------------------------------------------------------------------------
// ZERO FALSE EXCLUSIONS — the primary EVL-03 metric, swept exhaustively
// ---------------------------------------------------------------------------

test("ZERO false exclusions: no non-reviewed scenario ever produces `excluded`", () => {
  const scenarios: Array<{ name: string; run: () => ReturnType<typeof screen> }> = [
    {
      name: "model_inferred rule + failing user_stated fact",
      run: () =>
        screen(profile({ entity_type: pf("nonprofit", "user_stated") }), opp(), [
          inferredRule({
            id: "mi-1",
            category: "entity_type",
            description: "inferred higher-ed-only",
            predicate: { kind: "entity_type_in", allowed: ["higher_education"] },
          }),
        ]),
    },
    {
      name: "reviewed rule + failing MODEL-INFERRED fact",
      run: () =>
        screen(profile({ us_owned: pf(false, "model_inferred") }), opp(), [
          verifiedRule({
            id: "v-1",
            category: "size_ownership",
            description: "US-owned required",
            predicate: { kind: "us_ownership_required" },
          }),
        ]),
    },
    {
      name: "universal SBIR ownership (foreign-owned, user_stated)",
      run: () =>
        screen(profile({ us_owned: pf(false, "user_stated") }), SBIR_OPP(), []),
    },
    {
      name: "universal SBIR size (>500, user_stated)",
      run: () =>
        screen(profile({ employee_count: pf(9999, "user_stated") }), SBIR_OPP(), []),
    },
    {
      name: "unmet SAM registration (a step, not a bar)",
      run: () =>
        screen(profile({ sam_registered: pf(false, "user_stated") }), opp(), []),
    },
    {
      name: "reviewed gate with a MISSING fact (unknown)",
      run: () =>
        screen(profile(), opp(), [
          verifiedRule({
            id: "v-2",
            category: "entity_type",
            description: "higher-ed only",
            predicate: { kind: "entity_type_in", allowed: ["higher_education"] },
          }),
        ]),
    },
    {
      name: "empty rule set (nothing to exclude on)",
      run: () => screen(profile(), opp(), []),
    },
    {
      name: "advisory model_inferred prose, no predicate",
      run: () =>
        screen(profile({ sam_registered: pf(true, "user_stated") }), opp(), [
          inferredRule({
            id: "mi-2",
            category: "other",
            description: "unstructured prose",
            predicate: undefined as never,
          }),
        ]),
    },
  ];

  for (const s of scenarios) {
    const d = assertSafe(s.run());
    assert.notEqual(d.bucket, "excluded", `FALSE EXCLUSION in: ${s.name}`);
  }
});

test("the ONLY excluding scenarios are reviewed-rule + trustworthy-fail — and they validate", () => {
  const legit = [
    screen(profile({ entity_type: pf("nonprofit", "user_stated") }), opp(), [
      verifiedRule({
        id: "e-1",
        category: "entity_type",
        description: "higher-ed only",
        predicate: { kind: "entity_type_in", allowed: ["higher_education"] },
      }),
    ]),
    screen(profile({ us_owned: pf(false, "user_stated") }), opp(), [
      verifiedRule({
        id: "e-2",
        category: "size_ownership",
        description: "US-owned required",
        predicate: { kind: "us_ownership_required" },
      }),
    ]),
  ];
  for (const d of legit) {
    assertSafe(d);
    assert.equal(d.bucket, "excluded");
    // Every excluding failed_rule is human-reviewed (never model_inferred).
    for (const fr of d.failed_rules) {
      assert.notEqual(fr.provenance, "model_inferred");
    }
  }
});
