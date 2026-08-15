import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isSbirSttr, universalRulesForOpportunity } from "../universalRules";

/**
 * CAN-04 universal overlay — unit tests for `isSbirSttr` (the case-insensitive
 * title/program detector that decides whether the SBIR/STTR size + ownership
 * gates apply) and `universalRulesForOpportunity` (which universal rules fold
 * into ELG-01's `screen()` for a given opportunity). Pure logic, no network.
 *
 * `isSbirSttr` takes `Pick<CanonOpportunity, "title" | "program">` — both keys
 * are REQUIRED by that type (`title` is required on the CAN-01 store-row type;
 * `program` is required on the base Opportunity contract), so every fixture
 * below supplies both, using `""` for the field not under test to isolate the
 * signal (mirrors the function's own `${title} ${program}` concatenation).
 */

describe("isSbirSttr", () => {
  test("acronyms are detected case-insensitively, in title or program", () => {
    assert.equal(isSbirSttr({ title: "SBIR Phase I", program: "" }), true);
    assert.equal(isSbirSttr({ title: "sbir phase i", program: "" }), true);
    assert.equal(isSbirSttr({ title: "DoD STTR Topic AF241-001", program: "" }), true);
    assert.equal(isSbirSttr({ title: "", program: "DoD STTR Topic AF241-001" }), true);
  });

  test("spelled-out program names are detected", () => {
    assert.equal(
      isSbirSttr({ title: "Small Business Innovation Research Program", program: "" }),
      true,
    );
    assert.equal(
      isSbirSttr({ title: "Small Business Technology Transfer", program: "" }),
      true,
    );
  });

  test("[documented behavior] a non-word-boundary match does NOT false-positive", () => {
    // "SBIRxyz" has no word boundary after "sbir" (the acronym regex is
    // \bsbir\b), so this does not match the acronym branch, and none of the
    // spelled-out phrases appear either. Actual behavior asserted, not
    // changed — this documents the regex's real boundary semantics.
    assert.equal(isSbirSttr({ title: "SBIRxyz Program", program: "" }), false);
  });

  test("plain, unrelated titles are not SBIR/STTR", () => {
    assert.equal(isSbirSttr({ title: "Community Development Block Grant", program: "" }), false);
    assert.equal(isSbirSttr({ title: "Rural Business Development Grant", program: "" }), false);
  });

  test("empty title+program never throws and returns false", () => {
    assert.doesNotThrow(() => isSbirSttr({ title: "", program: "" }));
    assert.equal(isSbirSttr({ title: "", program: "" }), false);
  });
});

describe("universalRulesForOpportunity", () => {
  test("an SBIR/STTR opportunity gets registration + ownership + size", () => {
    const rules = universalRulesForOpportunity({
      title: "DoD SBIR Phase I Topic",
      program: "SBIR Phase I",
    });
    assert.equal(rules.length, 3);
    assert.deepEqual(
      rules.map((r) => r.id).sort(),
      ["universal-sam-registration", "universal-sbir-ownership", "universal-sbir-size"],
    );
  });

  test("a non-SBIR opportunity gets only the universal registration gate", () => {
    const rules = universalRulesForOpportunity({
      title: "Community Development Block Grant",
      program: "CDBG",
    });
    assert.equal(rules.length, 1);
    assert.equal(rules[0].id, "universal-sam-registration");
    assert.equal(rules[0].category, "registration");
  });
});
