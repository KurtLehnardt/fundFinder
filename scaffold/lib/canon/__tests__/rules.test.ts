import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeForMatch,
  isQuoteGrounded,
  filterStorableRules,
  parseRuleExtraction,
  RuleExtractionSchema,
  toRuleEvaluation,
  unknownGateToRuleEvaluation,
  type ExtractedRule,
  type UnknownGate,
} from "../rules";

// These tests are PURE (no DB, no network): getSql() is lazy, so importing the
// module does not open a connection. They exercise the CAN-04 guarantees the
// test plan calls out (R8.4 / §11): unknown gates round-trip as unknown, an
// uncited rule is rejected, and a rule whose quote is not in the source text is
// dropped (never stored).

const SOURCE =
  "Proposals may only be submitted by the following: Non-profit, " +
  "non-academic organizations. Registered U.S. and Italian not-for-profit " +
  "organizations; State governments;Eligible Agencies of the Federal Government.";

const url = "https://www.grants.gov/search-results-detail/123456";

function citedRule(quote: string): ExtractedRule {
  return {
    category: "entity_type",
    description: "Only non-profit, non-academic organizations may apply.",
    provenance: "model_inferred",
    confidence: 0.9,
    citation: {
      source_url: url,
      source_name: "Grants.gov — Test (Agency)",
      quote,
    },
  };
}

test("quote grounding tolerates reformatted punctuation/whitespace", () => {
  // Model added a space after ';' — still the same words in order → grounded.
  assert.equal(
    isQuoteGrounded("State governments; Eligible Agencies", SOURCE),
    true,
  );
  // Exact substring is obviously grounded.
  assert.equal(
    isQuoteGrounded("Non-profit, non-academic organizations", SOURCE),
    true,
  );
});

test("quote grounding rejects a paraphrase / invented sentence", () => {
  // Real words, but not a contiguous run of the source → not grounded.
  assert.equal(
    isQuoteGrounded("organizations may only submit non-academic proposals", SOURCE),
    false,
  );
  assert.equal(
    isQuoteGrounded("The U.S. Embassy strongly encourages cost-sharing.", SOURCE),
    false,
  );
});

test("normalizeForMatch collapses punctuation and whitespace to words", () => {
  assert.equal(normalizeForMatch("A, B;  C\n D!"), "a b c d");
});

test("filterStorableRules drops an ungrounded (hallucinated) rule", () => {
  const good = citedRule("Non-profit, non-academic organizations");
  const bad = citedRule("must be a for-profit small business concern"); // not in SOURCE
  const { storable, rejected } = filterStorableRules([good, bad], SOURCE);
  assert.equal(storable.length, 1);
  assert.equal(storable[0].citation.quote, "Non-profit, non-academic organizations");
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason, "quote_not_grounded");
});

test("filterStorableRules rejects a rule with NO citation (R8.4)", () => {
  const uncited = {
    category: "entity_type",
    description: "Nonprofits only.",
    provenance: "model_inferred",
    // no citation at all
  };
  const missingQuote = {
    category: "entity_type",
    description: "Nonprofits only.",
    provenance: "model_inferred",
    citation: { source_url: url }, // url but no quote
  };
  const missingUrl = {
    category: "entity_type",
    description: "Nonprofits only.",
    provenance: "model_inferred",
    citation: { quote: "Non-profit, non-academic organizations" }, // quote but no url
  };
  const { storable, rejected } = filterStorableRules(
    [uncited, missingQuote, missingUrl],
    SOURCE,
  );
  assert.equal(storable.length, 0);
  assert.equal(rejected.length, 3);
  assert.ok(rejected.every((r) => r.reason === "schema"));
});

test("unknown gates round-trip as unknown", () => {
  const unknown: UnknownGate[] = [
    { category: "registration", status: "unknown", reason: "SAM.gov not mentioned in the text." },
    { category: "size_ownership", status: "unknown", reason: "No SBA size standard stated." },
  ];
  const extraction = parseRuleExtraction({
    opportunity_id: "grants-123456",
    source_url: url,
    model: "gpt-4o-mini",
    extracted_at: new Date().toISOString(),
    snapshot_version: "v1-seed-001",
    rules: [citedRule("Non-profit, non-academic organizations")],
    unknown_gates: unknown,
  });

  // Serialize → parse → the unknown gates survive as unknown, unchanged.
  const roundTripped = RuleExtractionSchema.parse(
    JSON.parse(JSON.stringify(extraction)),
  );
  assert.equal(roundTripped.unknown_gates.length, 2);
  assert.deepEqual(roundTripped.unknown_gates, unknown);
  for (const g of roundTripped.unknown_gates) {
    assert.equal(g.status, "unknown");
  }
});

test("toRuleEvaluation maps a rule to a CON-01 RuleEvaluation with its citation", () => {
  const rule = citedRule("Non-profit, non-academic organizations");
  const ev = toRuleEvaluation(rule, "42");
  assert.equal(ev.rule_id, "42");
  assert.equal(ev.category, "entity_type");
  assert.equal(ev.provenance, "model_inferred");
  assert.equal(ev.citation?.source_url, url);
});

test("unknownGateToRuleEvaluation carries no fabricated citation", () => {
  const gate: UnknownGate = {
    category: "geography",
    status: "unknown",
    reason: "No jurisdiction stated.",
  };
  const ev = unknownGateToRuleEvaluation(gate, "u1");
  assert.equal(ev.category, "geography");
  assert.equal(ev.description, "No jurisdiction stated.");
  assert.equal(ev.provenance, "model_inferred");
  assert.equal(ev.citation, undefined);
});
