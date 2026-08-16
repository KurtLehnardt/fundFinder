import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { Opportunity } from "../../contracts/opportunity";
import { toSubmissionMeta } from "../meta";

/** A minimal, valid `Opportunity` fixture; overrides layer over the base. */
function opp(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: "OPP-1",
    source: "grants.gov",
    kind: "grant",
    program: "Advanced Research Program",
    agency: "Department of Energy",
    description: "A grounded program record used as a static test fixture.",
    ...overrides,
  };
}

describe("toSubmissionMeta", () => {
  test("derives opportunity_id, source_label, and agency from the record", () => {
    const meta = toSubmissionMeta(opp({ id: "GRANT-2026-42" }));
    assert.equal(meta.opportunity_id, "GRANT-2026-42");
    assert.equal(meta.source_label, "grants.gov");
    assert.equal(meta.agency, "Department of Energy");
  });

  test("cfda_number / competition_id are undefined when the record lacks them (never fabricated)", () => {
    const meta = toSubmissionMeta(opp());
    // The Opportunity contract does not carry these — they are structural gaps.
    assert.equal(meta.cfda_number, undefined);
    assert.equal(meta.competition_id, undefined);
  });

  test("program_title prefers title", () => {
    const meta = toSubmissionMeta(opp({ title: "Canonical Title", program: "Program Name" }));
    assert.equal(meta.program_title, "Canonical Title");
  });

  test("program_title falls back to program when title is absent", () => {
    const meta = toSubmissionMeta(opp({ title: undefined, program: "Program Name" }));
    assert.equal(meta.program_title, "Program Name");
  });

  test("program_title falls back to id when both title and program are blank", () => {
    const meta = toSubmissionMeta(opp({ id: "OPP-ONLY", title: "   ", program: "" }));
    assert.equal(meta.program_title, "OPP-ONLY");
  });

  test("a blank agency is treated as absence (a gap), not asserted as a value", () => {
    const meta = toSubmissionMeta(opp({ agency: "   " }));
    assert.equal(meta.agency, undefined);
  });

  test("is pure — identical input yields a deep-equal result", () => {
    const o = opp({ id: "STABLE-1", title: "Stable" });
    assert.deepEqual(toSubmissionMeta(o), toSubmissionMeta(o));
  });
});
