import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ApplicationRequirementsSchema,
  NOT_SPECIFIED,
  type ApplicationRequirements,
} from "../../contracts/applicationRequirements";
import { validateGrounding, annotateGrounding, buildSourceText } from "../requirements";
import type { Opportunity } from "../../contracts/opportunity";

/**
 * G1 tests — hermetic, NO network, STATIC fixtures only. The model is never
 * called here; every case exercises the schema and the pure grounding logic.
 */

/** A minimal well-formed ApplicationRequirements (all atoms grounded or sentinel). */
function baseReqs(overrides: Partial<ApplicationRequirements> = {}): ApplicationRequirements {
  return {
    opportunity_id: "opp_1",
    program_title: "Test Program",
    source_label: "grants.gov",
    extracted_at: new Date().toISOString(),
    narrative_sections: [
      {
        key: "project_summary",
        title: "Project Summary",
        prompt: "Summarize the project goals.",
        source_quote: "must submit a project summary",
        specified: true,
      },
    ],
    forms: [],
    format_limits: [],
    budget_rules: [],
    attachments: [],
    key_dates: [],
    eligibility_notes: [],
    ...overrides,
  };
}

const SOURCE =
  "The applicant must submit a project summary describing the goals. " +
  "Proposals must focus on economic prosperity.";

// --- Case 1: schema accepts well-formed, rejects malformed -----------------

test("ApplicationRequirementsSchema.parse accepts a well-formed object", () => {
  assert.doesNotThrow(() => ApplicationRequirementsSchema.parse(baseReqs()));
});

test("safeParse rejects a malformed object (narrative section missing `prompt`)", () => {
  const bad = baseReqs();
  // Remove the required `prompt` field from the first narrative section.
  delete (bad.narrative_sections[0] as Record<string, unknown>).prompt;
  assert.equal(ApplicationRequirementsSchema.safeParse(bad).success, false);
});

test("safeParse rejects a malformed object (missing top-level program_title)", () => {
  const bad = baseReqs() as Record<string, unknown>;
  delete bad.program_title;
  assert.equal(ApplicationRequirementsSchema.safeParse(bad).success, false);
});

test("safeParse rejects a malformed object (`specified` not a boolean)", () => {
  const bad = baseReqs();
  (bad.narrative_sections[0] as Record<string, unknown>).specified = "yes";
  assert.equal(ApplicationRequirementsSchema.safeParse(bad).success, false);
});

// --- Case 2: never invents a requirement not in the source text ------------

test("validateGrounding passes when a section's source_quote IS a substring", () => {
  const reqs = baseReqs(); // quote "must submit a project summary" is in SOURCE
  const { grounded, issues } = validateGrounding(reqs, SOURCE);
  assert.equal(grounded, true);
  assert.equal(issues.length, 0);
});

test("validateGrounding FLAGS a section whose source_quote is NOT a substring", () => {
  const reqs = baseReqs({
    narrative_sections: [
      {
        key: "work_plan",
        title: "Work Plan",
        prompt: "Provide a 15-page work plan.",
        // This quote is fabricated — it is NOT anywhere in SOURCE.
        source_quote: "the proposal must include a 15-page work plan",
        specified: true,
      },
    ],
  });
  const { grounded, issues } = validateGrounding(reqs, SOURCE);
  assert.equal(grounded, false);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /work_plan|not a substring/i);
});

test("annotateGrounding neutralizes an ungrounded section (flips specified:false + sentinel)", () => {
  const reqs = baseReqs({
    narrative_sections: [
      {
        key: "work_plan",
        title: "Work Plan",
        prompt: "Provide a 15-page work plan.",
        source_quote: "the proposal must include a 15-page work plan",
        specified: true,
      },
    ],
  });
  const { requirements, issues } = annotateGrounding(reqs, SOURCE);
  const section = requirements.narrative_sections[0];
  assert.equal(section.specified, false);
  assert.equal(section.source_quote, "");
  assert.equal(section.title, NOT_SPECIFIED);
  assert.equal(section.prompt, NOT_SPECIFIED);
  assert.equal(issues.length, 1);
  // And the neutralized result still satisfies the schema + grounding.
  assert.doesNotThrow(() => ApplicationRequirementsSchema.parse(requirements));
  assert.equal(validateGrounding(requirements, SOURCE).grounded, true);
});

test("annotateGrounding leaves a grounded section untouched", () => {
  const reqs = baseReqs();
  const { requirements, issues } = annotateGrounding(reqs, SOURCE);
  assert.equal(issues.length, 0);
  assert.deepEqual(requirements.narrative_sections[0], reqs.narrative_sections[0]);
});

test("grounding is whitespace-normalized (collapsed spaces still match)", () => {
  const spacedSource = "The applicant   must\n submit  a project    summary.";
  const reqs = baseReqs({
    narrative_sections: [
      {
        key: "project_summary",
        title: "Project Summary",
        prompt: "Summarize.",
        source_quote: "must submit a project summary",
        specified: true,
      },
    ],
  });
  assert.equal(validateGrounding(reqs, spacedSource).grounded, true);
});

// --- Case 3: the NOT_SPECIFIED sentinel is a valid, non-violating atom ------

test("a NOT_SPECIFIED (specified:false) atom is accepted and is NOT a grounding violation", () => {
  const reqs = baseReqs({
    forms: [{ name: NOT_SPECIFIED, source_quote: "", specified: false }],
    format_limits: [{ label: NOT_SPECIFIED, value: NOT_SPECIFIED, source_quote: "", specified: false }],
    key_dates: [{ label: NOT_SPECIFIED, date: NOT_SPECIFIED, source_quote: "", specified: false }],
  });
  // Schema accepts sentinel atoms.
  assert.doesNotThrow(() => ApplicationRequirementsSchema.parse(reqs));
  // And grounding does not flag them.
  const { grounded, issues } = validateGrounding(reqs, SOURCE);
  assert.equal(grounded, true);
  assert.equal(issues.length, 0);
  // annotateGrounding leaves them exactly as-is.
  const annotated = annotateGrounding(reqs, SOURCE);
  assert.equal(annotated.issues.length, 0);
  assert.equal(annotated.requirements.forms[0].specified, false);
  assert.equal(annotated.requirements.forms[0].name, NOT_SPECIFIED);
});

test("a specified:true atom with an EMPTY source_quote is flagged (a claim needs a quote)", () => {
  const reqs = baseReqs({
    forms: [{ name: "SF-424", source_quote: "", specified: true }],
  });
  const { grounded, issues } = validateGrounding(reqs, SOURCE);
  assert.equal(grounded, false);
  assert.equal(issues.length, 1);
});

// --- buildSourceText only includes real, present fields --------------------

test("buildSourceText concatenates present fields and omits empty ones", () => {
  const opp = {
    id: "opp_1",
    source: "grants.gov",
    kind: "grant",
    program: "My Program",
    agency: "Some Agency",
    description: "Applicants must describe their approach.",
    // no eligibility → must not appear
  } as unknown as Opportunity;
  const text = buildSourceText(opp);
  assert.match(text, /My Program/);
  assert.match(text, /Some Agency/);
  assert.match(text, /must describe their approach/);
  assert.doesNotMatch(text, /ELIGIBILITY:/);
});
