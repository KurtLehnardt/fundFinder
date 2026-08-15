import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  CompetitorAnalysisSchema,
  parseCompetitorAnalysis,
} from "../competitorAnalysis";

/**
 * R5 — the grounding invariant (mirrors EligibilityDeterminationSchema in
 * eligibilityDetermination.ts): the synthesis may reference ONLY records that
 * were actually retrieved. `.parse()` must THROW on any competitor.recordId or
 * recommendation citation that is not present in `records[]`, so a fabricated
 * award can never reach the renderer.
 */

/** A minimal, fully-grounded fixture (two real-shaped records). */
function groundedFixture() {
  return {
    persona: "FasterControl",
    personaDescription: "A Utah company building cloud QMS/MES software for regulated life sciences.",
    capturedAt: "2026-08-15T18:35:24.229Z",
    records: [
      {
        id: "usa_1",
        source: "USAspending",
        recipient: "QUALTRAX, INC",
        amount: 71084,
        agency: "Environmental Protection Agency",
        program: "Award EP135000141",
        abstract:
          "The system will support the CRL's ISO/IEC 17025 accreditation by managing quality through document control and workflows.",
        sourceUrl: "https://www.usaspending.gov/award/CONT_AWD_EP135000141_6800_-NONE-_-NONE-",
      },
      {
        id: "nih_2",
        source: "NIH RePORTER",
        recipient: "PHYSICAL SCIENCES, INC",
        amount: 1049845,
        agency: "National Institute of General Medical Sciences",
        abstract:
          "Develop real-time in-line process analytical technology for biomanufacturing process understanding and control.",
        sourceUrl: "https://reporter.nih.gov/project-details/11313907",
        year: 2026,
      },
    ],
    analysis: {
      summary: "Federal funding concentrates in enterprise IT contracts and biomanufacturing analytics.",
      competitors: [
        {
          recordId: "usa_1",
          positioning: "Qualtrax won EPA business by aligning document control to ISO/IEC 17025.",
          quotedSnippet: "managing quality through document control and workflows",
        },
      ],
      recommendations: [
        {
          advice: "Target lab QMS compliance contracts by mapping to specific accreditation standards.",
          citations: ["usa_1", "nih_2"],
        },
      ],
    },
  };
}

describe("CompetitorAnalysisSchema — grounding invariant", () => {
  test("a fully-grounded analysis parses", () => {
    assert.doesNotThrow(() => CompetitorAnalysisSchema.parse(groundedFixture()));
    const parsed = parseCompetitorAnalysis(groundedFixture());
    assert.equal(parsed.records.length, 2);
    assert.equal(parsed.analysis.competitors[0].recordId, "usa_1");
  });

  test("THROWS when a competitor references a record id not in the retrieved set", () => {
    const bad = groundedFixture();
    bad.analysis.competitors[0].recordId = "ghost_99"; // never retrieved
    assert.throws(() => CompetitorAnalysisSchema.parse(bad));
    assert.equal(CompetitorAnalysisSchema.safeParse(bad).success, false);
  });

  test("THROWS when a recommendation cites a record id not in the retrieved set", () => {
    const bad = groundedFixture();
    bad.analysis.recommendations[0].citations = ["usa_1", "fabricated_award"];
    assert.throws(() => CompetitorAnalysisSchema.parse(bad));
  });

  test("rejects a recommendation with NO citations (every claim must cite a real record)", () => {
    const bad = groundedFixture();
    bad.analysis.recommendations[0].citations = [];
    assert.equal(CompetitorAnalysisSchema.safeParse(bad).success, false);
  });

  test("rejects duplicate record ids (an ambiguous citation target)", () => {
    const bad = groundedFixture();
    bad.records[1].id = "usa_1"; // collide with records[0].id
    assert.equal(CompetitorAnalysisSchema.safeParse(bad).success, false);
  });

  test("rejects a record whose sourceUrl is not a valid URL", () => {
    const bad = groundedFixture();
    bad.records[0].sourceUrl = "not-a-url";
    assert.equal(CompetitorAnalysisSchema.safeParse(bad).success, false);
  });
});
