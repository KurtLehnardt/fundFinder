import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { groundSynthesis } from "../analyze";
import { parseCompetitorAnalysis } from "../../contracts/competitorAnalysis";

/**
 * R5-deep — the LIVE pipeline's anti-fabrication guarantee.
 *
 * Two layers are tested here:
 *   1. `groundSynthesis` — the pure, defense-in-depth filter that drops any
 *      model-invented id BEFORE the schema parse (so a stray hallucination
 *      degrades to fewer honest claims, never a fabricated one on screen).
 *   2. The shipped demo fixture — proof the captured example is itself fully
 *      grounded (every competitor + citation traces to real evidence), and that
 *      tampering an id into it THROWS at the parse boundary.
 */

describe("groundSynthesis — drops everything the model invented", () => {
  const records = [{ id: "usa_1" }, { id: "nih_2" }];
  const webProfiles = [{ id: "web_1" }];

  const synthesis = {
    competitors: [
      { recordId: "usa_1", positioning: "kept", quotedSnippet: "q" }, // valid award → kept
      { recordId: "ghost_9", positioning: "p", quotedSnippet: "q" }, // not retrieved → dropped
      { recordId: "web_1", positioning: "p", quotedSnippet: "q" }, // web id not allowed as a card → dropped
      { recordId: "usa_1", positioning: "", quotedSnippet: "q" }, // empty positioning → dropped
    ],
    recommendations: [
      { advice: "a", citations: ["usa_1", "web_1", "ghost_9"] }, // kept; ghost stripped
      { advice: "b", citations: ["ghost_1", "ghost_2"] }, // no valid citation → dropped
      { advice: "", citations: ["usa_1"] }, // no advice → dropped
    ],
    opportunities: [
      { advice: "o", citations: ["web_1"] }, // web citation allowed → kept
      { advice: "o2", citations: [] }, // no citation → dropped
    ],
  };

  const grounded = groundSynthesis({ records, webProfiles, synthesis });

  test("keeps only competitors backed by a real award record", () => {
    assert.equal(grounded.competitors.length, 1);
    assert.equal(grounded.competitors[0].recordId, "usa_1");
  });

  test("a web-profile id can never back a competitor card", () => {
    assert.ok(!grounded.competitors.some((c) => c.recordId === "web_1"));
  });

  test("strips invented citation ids but keeps the grounded ones", () => {
    assert.equal(grounded.recommendations.length, 1);
    assert.deepEqual(grounded.recommendations[0].citations, ["usa_1", "web_1"]);
  });

  test("drops any recommendation/opportunity left with no real citation", () => {
    assert.ok(!grounded.recommendations.some((r) => r.advice === "b"));
    assert.equal(grounded.opportunities.length, 1);
    assert.deepEqual(grounded.opportunities[0].citations, ["web_1"]);
  });
});

describe("shipped demo fixture — provably grounded, tamper-proof", () => {
  const fixturePath = fileURLToPath(new URL("../../../data/demo-competitor-fastercontrol.json", import.meta.url));
  const rawFixture = JSON.parse(readFileSync(fixturePath, "utf8"));

  test("the committed fixture parses through the grounding contract", () => {
    assert.doesNotThrow(() => parseCompetitorAnalysis(rawFixture));
  });

  test("every competitor + every citation traces to real evidence", () => {
    const data = parseCompetitorAnalysis(rawFixture);
    const recordIds = new Set(data.records.map((r) => r.id));
    const citableIds = new Set<string>(recordIds);
    (data.webProfiles ?? []).forEach((p) => citableIds.add(p.id));

    for (const c of data.analysis.competitors) assert.ok(recordIds.has(c.recordId));
    const cited = [
      ...data.analysis.recommendations.flatMap((r) => r.citations),
      ...(data.analysis.opportunities ?? []).flatMap((o) => o.citations),
    ];
    for (const id of cited) assert.ok(citableIds.has(id), `citation ${id} must reference real evidence`);
  });

  test("no web profile carries a dollar amount (a fabricated award is unrepresentable)", () => {
    const data = parseCompetitorAnalysis(rawFixture);
    for (const p of data.webProfiles ?? []) {
      assert.equal((p as Record<string, unknown>).amount, undefined);
    }
  });

  test("tampering a fabricated competitor id into the fixture THROWS at parse", () => {
    const tampered = JSON.parse(JSON.stringify(rawFixture));
    tampered.analysis.competitors[0].recordId = "fabricated_award_999";
    assert.throws(() => parseCompetitorAnalysis(tampered));
  });
});
