import { test } from "node:test";
import assert from "node:assert/strict";

import {
  computeGaps,
  buildDescriptionFromProfile,
  mapStartupProfileToValues,
  computeFieldCell,
} from "../ProfileQuestionnaire";
import { PROFILE_FIELD_META_BY_KEY, MATERIAL_PROFILE_FIELDS } from "@/lib/contracts/companyProfile";
import type { StartupProfile } from "@/lib/types";

/**
 * B1b — ProfileQuestionnaire's pure logic (no React, no network, no DOM):
 * gap detection, description compilation, autofill mapping, and the
 * provenance-guarded field-write atom. These are exactly the pieces the
 * "never re-ask a provided field" and "fully-filled -> zero interview
 * questions" acceptance criteria rest on.
 *
 * NOTE: this repo's component tree isn't covered by the `npm test` glob
 * (`lib/**`, `app/**`, `scripts/**` only — no `components/**` today), so this
 * file doesn't run as part of that gate. It's still exercised directly here
 * (`node --import tsx --test components/__tests__/ProfileQuestionnaire.test.ts`)
 * and kept co-located per the repo's existing __tests__ convention.
 */

function cell<T>(value: T, provenance: "user_stated" | "model_inferred" | "verified" = "user_stated") {
  return { value, provenance, confidence: provenance === "user_stated" || provenance === "verified" ? 1 : 0.6 };
}

// --- computeGaps -------------------------------------------------------

test("computeGaps: an empty profile reports all 13 required+material fields missing", () => {
  const gaps = computeGaps({});
  assert.equal(gaps.length, MATERIAL_PROFILE_FIELDS.length);
});

test("computeGaps: a fully-filled profile reports zero gaps", () => {
  const profile: Record<string, unknown> = {};
  for (const m of MATERIAL_PROFILE_FIELDS) {
    profile[m.field] = cell(m.inputType === "integer" ? 5 : "some value");
  }
  assert.deepEqual(computeGaps(profile), []);
});

test("computeGaps: never lists a field that's already provided (never re-ask)", () => {
  const gaps = computeGaps({ industry: cell("agtech"), location: cell("Ohio") });
  assert.ok(!gaps.some((g) => g.field === "industry"));
  assert.ok(!gaps.some((g) => g.field === "location"));
  assert.ok(gaps.some((g) => g.field === "technology")); // still missing
});

// --- buildDescriptionFromProfile ----------------------------------------

test("buildDescriptionFromProfile: raw_text alone with no other fields returns just the raw text", () => {
  const desc = buildDescriptionFromProfile({ raw_text: cell("We build drones.") });
  assert.equal(desc, "We build drones.");
});

test("buildDescriptionFromProfile: folds in every OTHER provided field as a labeled line", () => {
  const desc = buildDescriptionFromProfile({
    raw_text: cell("We build drones."),
    industry: cell("agtech"),
    employee_count: cell(12),
  });
  assert.ok(desc.startsWith("We build drones."));
  assert.ok(desc.includes(`${PROFILE_FIELD_META_BY_KEY.industry.label}: agtech`));
  assert.ok(desc.includes(`${PROFILE_FIELD_META_BY_KEY.employee_count.label}: 12`));
});

test("buildDescriptionFromProfile: an empty profile returns an empty string, never throws", () => {
  assert.equal(buildDescriptionFromProfile({}), "");
});

// --- mapStartupProfileToValues ------------------------------------------

test("mapStartupProfileToValues: maps every v1 StartupProfile field onto its B1a key", () => {
  const sp: StartupProfile = {
    description: "We build drones.",
    industry: "agtech",
    technology: "computer vision",
    location: "Columbus, OH",
    employees: 7.6,
    revenue: "$500K ARR",
    fundingStage: "Seed",
    capitalRaised: "$1M",
    rdActivities: "Yes, ongoing sensor R&D",
    productMaturity: "MVP",
    targetCustomers: "Mid-size farms",
    capitalRequirement: "$2M",
  };
  const values = mapStartupProfileToValues(sp);
  assert.equal(values.raw_text, "We build drones.");
  assert.equal(values.industry, "agtech");
  assert.equal(values.technology, "computer vision");
  assert.equal(values.location, "Columbus, OH");
  assert.equal(values.employee_count, "8"); // rounded
  assert.equal(values.revenue, "$500K ARR");
  assert.equal(values.funding_stage, "Seed");
  assert.equal(values.capital_raised, "$1M");
  assert.equal(values.rd_activities, "Yes, ongoing sensor R&D");
  assert.equal(values.product_maturity, "MVP");
  assert.equal(values.target_customers, "Mid-size farms");
  assert.equal(values.capital_requirement, "$2M");
});

test("mapStartupProfileToValues: absent/blank v1 fields are simply omitted, never fabricated", () => {
  const values = mapStartupProfileToValues({ description: "" } as StartupProfile);
  assert.deepEqual(values, {});
});

// --- computeFieldCell (provenance-guarded write atom) --------------------

test("computeFieldCell: a user_stated write to an empty field succeeds", () => {
  const meta = PROFILE_FIELD_META_BY_KEY.industry;
  const result = computeFieldCell(meta, "agtech", "user_stated", undefined);
  assert.deepEqual(result, { value: "agtech", provenance: "user_stated", confidence: 1 });
});

test("computeFieldCell: a model_inferred autofill guess NEVER overwrites an existing user_stated fact", () => {
  const meta = PROFILE_FIELD_META_BY_KEY.industry;
  const result = computeFieldCell(meta, "biotech (guessed)", "model_inferred", { provenance: "user_stated" });
  assert.equal(result, null);
});

test("computeFieldCell: a model_inferred guess MAY replace another model_inferred guess", () => {
  const meta = PROFILE_FIELD_META_BY_KEY.industry;
  const result = computeFieldCell(meta, "agtech v2", "model_inferred", { provenance: "model_inferred" });
  assert.ok(result);
  assert.equal(result?.value, "agtech v2");
});

test("computeFieldCell: a user_stated edit always wins, even over an existing user_stated value", () => {
  const meta = PROFILE_FIELD_META_BY_KEY.industry;
  const result = computeFieldCell(meta, "corrected industry", "user_stated", { provenance: "user_stated" });
  assert.ok(result);
  assert.equal(result?.value, "corrected industry");
});

test("computeFieldCell: integer fields coerce and round; non-numeric input is rejected", () => {
  const meta = PROFILE_FIELD_META_BY_KEY.employee_count;
  assert.deepEqual(computeFieldCell(meta, "12.6", "user_stated", undefined), {
    value: 13,
    provenance: "user_stated",
    confidence: 1,
  });
  assert.equal(computeFieldCell(meta, "not a number", "user_stated", undefined), null);
});

test("computeFieldCell: a blank string never produces a cell", () => {
  const meta = PROFILE_FIELD_META_BY_KEY.industry;
  assert.equal(computeFieldCell(meta, "   ", "user_stated", undefined), null);
});
