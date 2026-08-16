import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_GOLDEN_CASES,
  SPARSE_CASE,
  NO_TRACTION_CASE,
  RICH_CASE,
  BANNED_PHRASE_ATTEMPT_CASE,
  type ApplicationGoldenCase,
} from "../applicationGolden";

// The REAL, unmodified apply engine (READ-ONLY import — nothing here is a
// reimplementation or a parallel/looser copy of the anti-fabrication logic).
import { enforceGrounding, validateDraftGrounding, DraftGroundingError } from "../../apply/draft";
import { prefillApplicationForms } from "../../apply/forms";
import { buildBudget } from "../../apply/budget";
import {
  assemblePackage,
  collectAllGaps,
  scanFounderTodos,
  allRegistrationsSatisfied,
  AOR_HANDOFF,
  PACKAGE_INTRO,
  type AssembledPackage,
} from "../../apply/package";
import { ApplicationDraftSchema, FOUNDER_TODO_PATTERN, type ApplicationDraft } from "../../contracts/applicationDraft";
import { isFieldProvided } from "../../contracts/companyProfile";
// Reuse the SAME check:prompts machinery — not a parallel/looser linter.
import { findBannedPhrases } from "../../../scripts/banned-phrases.mjs";

/**
 * G7 — application-eval: proves the WS-G draft/package pipeline NEVER
 * fabricates a founder fact, NEVER claims submission/award, and ALWAYS
 * surfaces `[founder to provide]` gaps for what it does not know.
 *
 * Hermetic — NO network, NO live model call. The golden cases in
 * `../applicationGolden` stand in for the raw G2 model output (the shape
 * `draftOneSection`/`normalizeRawSection` in `lib/apply/draft.ts` hand to
 * grounding enforcement); this suite runs that raw output through the REAL
 * `enforceGrounding` / `validateDraftGrounding` / `ApplicationDraftSchema`,
 * and the REAL `prefillApplicationForms` / `buildBudget` / `assemblePackage`
 * — the deterministic assembly path the apply engine actually runs in
 * production, model call aside.
 *
 * Two real findings in the (read-only) apply engine surfaced while building
 * this eval are documented as `// KNOWN FINDING:` tests below, asserting the
 * CURRENT behavior (so this gate stays green) rather than being silently
 * dropped or "fixed" here — see PR description + open-questions.md for the
 * full writeup and suggested remediation, owned by the lib/apply/* team.
 */

// ---------------------------------------------------------------------------
// Helpers — wire one golden case through the real pipeline
// ---------------------------------------------------------------------------

/** The golden case's `rawSections` as the PRE-enforcement `ApplicationDraft` (exactly what `enforceGrounding` receives in production). */
function preEnforcementDraft(goldenCase: ApplicationGoldenCase): ApplicationDraft {
  return {
    opportunity_id: goldenCase.opportunity.id,
    program_title: goldenCase.opportunity.title ?? goldenCase.opportunity.program,
    generated_at: new Date().toISOString(),
    sections: goldenCase.rawSections.map((s) => ({
      key: s.key,
      title: s.title,
      prompt: s.prompt,
      draft_text: s.draft_text,
      claims: s.claims,
      gaps: s.gaps,
    })),
  };
}

/** The REAL post-enforcement draft (mirrors what `draftApplication` returns after `enforceGrounding` + schema parse). */
function enforcedDraft(goldenCase: ApplicationGoldenCase): ApplicationDraft {
  const enforced = enforceGrounding(preEnforcementDraft(goldenCase), goldenCase.profile);
  return ApplicationDraftSchema.parse(enforced);
}

/** The full REAL `AssembledPackage` for one golden case, built from its enforced draft. */
function assembleGoldenPackage(goldenCase: ApplicationGoldenCase): AssembledPackage {
  const draft = enforcedDraft(goldenCase);
  const forms = prefillApplicationForms(goldenCase.profile, goldenCase.reqs, goldenCase.opportunity);
  const budget = buildBudget(goldenCase.profile, undefined, goldenCase.opportunity);
  return assemblePackage({
    opportunity_id: goldenCase.opportunity.id,
    program_title: goldenCase.opportunity.title ?? goldenCase.opportunity.program,
    forms,
    budget,
    checklist: { allRegistrationsSatisfied: allRegistrationsSatisfied(goldenCase.reqs) },
    narrativeSections: goldenCase.narrativeSections,
    draft,
    narrativeStatus: "drafted",
    requirementsAvailable: true,
  });
}

/** Every human-visible string in an assembled package, concatenated for a submission/award-claim sweep. */
function allVisibleText(pkg: AssembledPackage): string {
  const narrative = pkg.narratives.map((s) => s.draft_text).join(" ");
  const formsText = pkg.forms.forms.flatMap((f) => f.fields.map((field) => field.display)).join(" ");
  const budgetText = [
    ...pkg.budget.line_items.map((li) => li.justification),
    ...pkg.budget.notes,
    ...pkg.budget.advisories,
    pkg.budget.total.range_statement,
    ...pkg.budget.constraints.map((c) => c.note),
  ].join(" ");
  return [narrative, formsText, budgetText].join(" ");
}

/**
 * Positive submission/award/eligibility CONFIRMATIONS the package must never
 * state, anywhere. Regex/set-based (not brittle exact-string matches), and
 * deliberately crafted NOT to match the honest AOR hand-off's own negations
 * ("nothing was submitted", "no application was filed").
 */
const SUBMIT_CONFIRMATION_PATTERNS: readonly RegExp[] = [
  /application (has been |was )?submitted\b/i,
  /we (have |)submitted/i,
  /automatically submit/i,
  /you('ve| have) won\b/i,
  /application (was |has been )?approved\b/i,
  // Negative lookbehind excludes the honest negation "no application was
  // filed" (AOR_HANDOFF.body) while still catching a bare positive claim.
  /(?<!no )application (was |has been )?filed\b/i,
  // Word-boundary on BOTH sides — an unanchored `awarded\b` would false-positive
  // inside "subawarded" (a real budget-category term: "contracted or
  // subawarded services", see budget.ts CATEGORY_RULES).
  /\bawarded\b/i,
  /you (are|'re) eligible/i,
  /you qualify/i,
  /this application (is|has been) (funded|awarded)\b/i,
];

// ---------------------------------------------------------------------------
// Invariant 1 — every factual claim traces to a provided field, or becomes a
// [founder to provide: …] gap. No invented metrics/traction/eligibility.
// ---------------------------------------------------------------------------

describe("invariant 1: no fabrication — every claim is grounded or neutralized to a gap", () => {
  for (const goldenCase of APPLICATION_GOLDEN_CASES) {
    test(`${goldenCase.id}: raw candidate honesty holds after the real enforceGrounding pass`, () => {
      const raw = preEnforcementDraft(goldenCase);
      const preCheck = validateDraftGrounding(raw, goldenCase.profile);

      if (goldenCase.hasDeclaredFabricationRisk) {
        // The fixture is a REAL fabrication risk pre-enforcement (not a strawman):
        // the real validator must independently catch it.
        assert.equal(preCheck.grounded, false, `expected ${goldenCase.id} raw draft to fail grounding pre-enforcement`);
        assert.ok(
          preCheck.issues.some((i) => /fabrication risk|non-provided field/i.test(i)),
          `expected a fabrication-risk issue, got: ${preCheck.issues.join("; ")}`,
        );
      } else {
        // No fabrication attempted in this fixture — it should already be grounded.
        assert.equal(preCheck.grounded, true, `issues: ${preCheck.issues.join("; ")}`);
      }

      // The REAL post-enforcement draft (what actually ships in the package).
      const enforced = enforceGrounding(raw, goldenCase.profile);
      const postCheck = validateDraftGrounding(enforced, goldenCase.profile);
      assert.equal(postCheck.grounded, true, `post-enforcement issues: ${postCheck.issues.join("; ")}`);
      assert.doesNotThrow(() => ApplicationDraftSchema.parse(enforced));

      // Every SURVIVING claim cites a field the profile actually provides —
      // checked directly against the real `isFieldProvided`, not re-derived.
      for (const section of enforced.sections) {
        for (const claim of section.claims) {
          assert.ok(
            isFieldProvided(goldenCase.profile, claim.profile_field),
            `${goldenCase.id}/${section.key}: surviving claim cites non-provided field '${claim.profile_field}'`,
          );
        }
      }
    });
  }

  test("sparse-founder: the declared fabricated revenue figure is scrubbed and replaced with an honest gap", () => {
    const enforced = enforcedDraft(SPARSE_CASE);
    const traction = enforced.sections.find((s) => s.key === "traction_and_impact")!;
    assert.doesNotMatch(traction.draft_text, /\$180,000/);
    assert.match(traction.draft_text, /\[founder to provide: [^\]]*revenue[^\]]*\]/i);
  });

  test("no-traction: the declared fabricated $95,000 revenue figure is scrubbed and replaced with an honest gap", () => {
    const enforced = enforcedDraft(NO_TRACTION_CASE);
    const commercialization = enforced.sections.find((s) => s.key === "commercialization_plan")!;
    assert.doesNotMatch(commercialization.draft_text, /\$95,000/);
    assert.match(commercialization.draft_text, /\[founder to provide: [^\]]*revenue[^\]]*\]/i);
  });

  test("rich-founder: revenue/technology/traction claims are genuinely grounded — nothing is neutralized", () => {
    const raw = preEnforcementDraft(RICH_CASE);
    const enforced = enforceGrounding(raw, RICH_CASE.profile);
    // Every claim from the raw candidate survives verbatim (nothing needed neutralizing).
    const rawClaimCount = raw.sections.reduce((n, s) => n + s.claims.length, 0);
    const enforcedClaimCount = enforced.sections.reduce((n, s) => n + s.claims.length, 0);
    assert.equal(enforcedClaimCount, rawClaimCount);
    // And the rich profile's own real numbers appear in the shipped draft.
    const allText = enforced.sections.map((s) => s.draft_text).join(" ");
    assert.match(allText, /under \$100K/i);
  });

  // ---------------------------------------------------------------------------
  // KNOWN FINDING (lib/apply/draft.ts): `enforceGrounding`/`validateDraftGrounding`
  // only inspect the model's DECLARED `claims` array. A factual-sounding sentence
  // written directly into `draft_text` with NO corresponding `claims` entry is
  // invisible to both — it is neither traced to a provided field NOR neutralized
  // into a `[founder to provide: …]` gap. The drafting prompt
  // (`DRAFT_APPLICATION_SECTION_V1_TEMPLATE` in lib/prompts/registry.ts)
  // instructs the model to declare every factual sentence as a claim, but
  // nothing in the CODE cross-checks `draft_text` against that promise — the
  // honesty guarantee currently rests entirely on the model following
  // instructions for THIS one case (an "unclaimed" fact), even though the
  // module's own header says the honesty contract is "enforced in code, not
  // left to the model." A model that omits one `claims` entry (accidentally or
  // adversarially) ships an invented, specific number with no visual gap marker
  // at all. Filed to open-questions.md; NOT fixed here (lib/apply/* is
  // read-only for this task). TODO(lib/apply owners): either (a) have
  // `enforceGrounding` scan `draft_text` for sentences NOT covered by a claim
  // or a gap placeholder and neutralize/flag them too, or (b) require the model
  // to partition the ENTIRE `draft_text` into claims+gaps (no "free" prose) and
  // reject any leftover span at parse time.
  // ---------------------------------------------------------------------------
  test("KNOWN FINDING: an UNDECLARED fabricated sentence (no claims entry, no gap) survives enforceGrounding unchanged", () => {
    const raw = preEnforcementDraft(SPARSE_CASE);
    const enforced = enforceGrounding(raw, SPARSE_CASE.profile);
    const traction = enforced.sections.find((s) => s.key === "traction_and_impact")!;

    // CURRENT (undesired) behavior: the invented, specific metric ships verbatim.
    assert.match(
      traction.draft_text,
      /Our platform now serves more than 3,000 rural clinics nationwide\./,
      "KNOWN FINDING regressed favorably? if this now fails, the engine may have started catching undeclared fabrications — re-check and consider closing the finding",
    );
    // The validator reports this section as fully grounded — a false negative.
    const check = validateDraftGrounding(enforced, SPARSE_CASE.profile);
    assert.equal(check.grounded, true, "expected the CURRENT false-negative: validator sees no issue here");
  });
});

// ---------------------------------------------------------------------------
// Invariant 2 — never claims submission, award, or eligibility.
// ---------------------------------------------------------------------------

describe("invariant 2: never claims submission/award/eligibility", () => {
  for (const goldenCase of APPLICATION_GOLDEN_CASES) {
    test(`${goldenCase.id}: the fully assembled package contains no submission/award/eligibility confirmation`, () => {
      const pkg = assembleGoldenPackage(goldenCase);
      const text = allVisibleText(pkg);

      assert.deepEqual(findBannedPhrases(text), [], `${goldenCase.id}: banned phrase found in assembled package`);
      for (const re of SUBMIT_CONFIRMATION_PATTERNS) {
        assert.doesNotMatch(text, re, `${goldenCase.id}: assembled package matched forbidden pattern ${re}`);
      }
    });
  }

  test("the hand-authored AOR hand-off + package intro copy also passes the same forbidden-pattern sweep", () => {
    const copy = [AOR_HANDOFF.eyebrow, AOR_HANDOFF.headline, AOR_HANDOFF.body, AOR_HANDOFF.cta, PACKAGE_INTRO.eyebrow, PACKAGE_INTRO.note].join(
      " ",
    );
    assert.deepEqual(findBannedPhrases(copy), []);
    for (const re of SUBMIT_CONFIRMATION_PATTERNS) {
      assert.doesNotMatch(copy, re, `AOR/intro copy matched forbidden pattern ${re}`);
    }
  });

  test("adversarial raw draft asserting eligibility outright is REFUSED (thrown), never shipped", () => {
    const raw = preEnforcementDraft(BANNED_PHRASE_ATTEMPT_CASE);
    assert.throws(() => enforceGrounding(raw, BANNED_PHRASE_ATTEMPT_CASE.profile), DraftGroundingError);
  });
});

// ---------------------------------------------------------------------------
// Invariant 3 — every genuine gap surfaces a [founder to provide] marker.
// ---------------------------------------------------------------------------

describe("invariant 3: every genuine gap surfaces a [founder to provide] marker", () => {
  for (const goldenCase of APPLICATION_GOLDEN_CASES) {
    test(`${goldenCase.id}: pkg.gaps is non-empty, well-formed, and a superset of every inline narrative placeholder`, () => {
      const pkg = assembleGoldenPackage(goldenCase);

      assert.ok(pkg.gaps.length > 0, `${goldenCase.id}: expected at least one founder-to-provide gap`);
      for (const g of pkg.gaps) assert.match(g, FOUNDER_TODO_PATTERN);

      // Every inline placeholder actually printed in a drafted narrative is
      // collected into the package's single gap-summary surface.
      const inlinePlaceholders = pkg.narratives.flatMap((s) => scanFounderTodos(s.draft_text));
      for (const ph of inlinePlaceholders) {
        assert.ok(pkg.gaps.includes(ph), `${goldenCase.id}: inline placeholder ${ph} missing from pkg.gaps`);
      }
      // Every forms gap is collected too.
      for (const g of pkg.forms.gaps) assert.ok(pkg.gaps.includes(g), `${goldenCase.id}: forms gap ${g} missing from pkg.gaps`);
    });
  }

  test("sparse-founder: missing identity fields (technology, location) surface as real gaps", () => {
    const pkg = assembleGoldenPackage(SPARSE_CASE);
    const joined = pkg.gaps.join(" | ");
    assert.match(joined, /core technology/i);
    assert.match(joined, /primary location/i);
  });

  test("collectAllGaps matches assemblePackage's own gaps field (single gap-summary surface, exercised directly)", () => {
    for (const goldenCase of APPLICATION_GOLDEN_CASES) {
      const draft = enforcedDraft(goldenCase);
      const forms = prefillApplicationForms(goldenCase.profile, goldenCase.reqs, goldenCase.opportunity);
      const budget = buildBudget(goldenCase.profile, undefined, goldenCase.opportunity);
      const direct = collectAllGaps({ draft, forms, budget });
      const pkg = assembleGoldenPackage(goldenCase);
      assert.deepEqual(pkg.gaps, direct, `${goldenCase.id}: assemblePackage.gaps diverged from collectAllGaps`);
    }
  });

  // ---------------------------------------------------------------------------
  // KNOWN FINDING (lib/apply/budget.ts): when `use_of_funds` is absent,
  // `buildTemplateLineItems` embeds a `[founder to provide: how funds will be
  // used for <category>]` placeholder INSIDE each line item's `justification`
  // text (so it IS visibly rendered on the assembled package), but `buildBudget`
  // only ever calls `addGap(li.amount)` — it never scans `li.justification` for
  // the placeholder it just embedded. The result: `budget.gaps` (and therefore
  // `collectAllGaps`/`AssembledPackage.gaps`, package.ts's own documented
  // "single gap-summary surface") SILENTLY OMITS up to 8 genuine, visibly
  // rendered founder-to-provide markers whenever use_of_funds is missing —
  // directly contradicting `applicationBudget.ts`'s own doc comment: "`gaps` is
  // the flat, deduplicated list of every distinct `[founder to provide: …]`
  // placeholder appearing anywhere in the package." Filed to
  // open-questions.md; NOT fixed here (lib/apply/* is read-only for this task).
  // TODO(lib/apply owners): scan each line item's `justification` (and any
  // future free-text field) for inline placeholders the same way
  // `collectAllGaps` already scans narrative `draft_text`, and add every match
  // to the `gaps` set in `buildBudget`.
  // ---------------------------------------------------------------------------
  test("KNOWN FINDING: template line-item justification placeholders (use_of_funds absent) are rendered but NOT collected into budget.gaps", () => {
    // SPARSE_CASE's profile has no use_of_funds, so buildBudget falls back to
    // the full standard-category template (see budget.ts buildTemplateLineItems).
    const budget = buildBudget(SPARSE_CASE.profile, undefined, SPARSE_CASE.opportunity);
    const justificationText = budget.line_items.map((li) => li.justification).join(" | ");
    const renderedPlaceholders = scanFounderTodos(justificationText);

    // CURRENT (undesired) behavior: these placeholders exist in the rendered
    // budget but are absent from the budget's own `gaps` array.
    assert.ok(renderedPlaceholders.length > 0, "expected the template path to embed justification placeholders");
    for (const ph of renderedPlaceholders) {
      assert.equal(
        budget.gaps.includes(ph),
        false,
        `KNOWN FINDING regressed favorably? ${ph} is now collected in budget.gaps — re-check and consider closing the finding`,
      );
    }

    // Which means the ASSEMBLED PACKAGE's single gap-summary surface misses
    // them too — a founder scanning `pkg.gaps` alone would not see them,
    // even though they're printed right there in the budget line items.
    const pkg = assembleGoldenPackage(SPARSE_CASE);
    for (const ph of renderedPlaceholders) {
      assert.equal(pkg.gaps.includes(ph), false);
    }
  });
});

// ---------------------------------------------------------------------------
// Invariant 4 — a sparse profile yields MORE gaps than a rich profile.
// ---------------------------------------------------------------------------

describe("invariant 4: sparser profiles yield more gaps", () => {
  test("sparse > no-traction > rich, in total package gaps", () => {
    const sparse = assembleGoldenPackage(SPARSE_CASE);
    const noTraction = assembleGoldenPackage(NO_TRACTION_CASE);
    const rich = assembleGoldenPackage(RICH_CASE);

    assert.ok(
      sparse.gaps.length > rich.gaps.length,
      `expected sparse (${sparse.gaps.length}) > rich (${rich.gaps.length})`,
    );
    assert.ok(
      noTraction.gaps.length > rich.gaps.length,
      `expected no-traction (${noTraction.gaps.length}) > rich (${rich.gaps.length})`,
    );
    assert.ok(
      sparse.gaps.length >= noTraction.gaps.length,
      `expected sparse (${sparse.gaps.length}) >= no-traction (${noTraction.gaps.length})`,
    );
  });

  test("the rich profile's registration facts clear the SF-424 UEI/entity/AOR/NAICS gaps the sparse profile leaves open", () => {
    const sparse = assembleGoldenPackage(SPARSE_CASE);
    const rich = assembleGoldenPackage(RICH_CASE);
    const sparseJoined = sparse.gaps.join(" | ").toLowerCase();
    const richJoined = rich.gaps.join(" | ").toLowerCase();

    assert.match(sparseJoined, /unique entity identifier|uei/);
    assert.doesNotMatch(richJoined, /unique entity identifier \(uei\)/);
  });
});

// ---------------------------------------------------------------------------
// Smoke test — the deterministic assembly path runs end-to-end for every
// golden case without throwing (the eval actually EXERCISES the real engine).
// ---------------------------------------------------------------------------

test("smoke: every golden case assembles into a valid, schema-conformant package", () => {
  for (const goldenCase of APPLICATION_GOLDEN_CASES) {
    const pkg = assembleGoldenPackage(goldenCase);
    assert.equal(pkg.narrativeStatus, "drafted");
    assert.equal(pkg.opportunity_id, goldenCase.opportunity.id);
    assert.ok(pkg.forms.forms.length > 0);
    assert.ok(pkg.budget.line_items.length > 0);
  }
});
