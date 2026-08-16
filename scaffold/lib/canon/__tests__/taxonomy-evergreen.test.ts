import { test } from "node:test";
import assert from "node:assert/strict";

import {
  OpportunityKindSchema,
  OpportunitySchema,
} from "../../contracts/opportunity";
import { parseCanonOpportunity } from "../CanonOpportunity";
import {
  deriveStatus,
  normalizeGrantsGovRecord,
  type NormalizeGrantsGovInput,
} from "../normalize";

/**
 * A0 — opportunity taxonomy extension + evergreen normalization.
 *
 * Two things are locked in here:
 *   1. `OpportunityKindSchema` accepts the newly added `loan` and `scholarship`
 *      instruments, WITHOUT introducing an `sbir` kind (SBIR stays modeled as
 *      `source:"sbir"` + `kind:"rd"`).
 *   2. An evergreen (rolling / no-deadline / no-funding) grants.gov record
 *      normalizes cleanly — no throw, evergreen status preserved, and the row
 *      still satisfies the STRICTER `CanonOpportunitySchema` (all structured
 *      fields present) at the write boundary.
 */

// --- 1. Taxonomy: loan + scholarship are valid kinds -----------------------

test("OpportunityKindSchema accepts the new loan and scholarship kinds", () => {
  assert.equal(OpportunityKindSchema.parse("loan"), "loan");
  assert.equal(OpportunityKindSchema.parse("scholarship"), "scholarship");
});

test("the pre-existing kinds are unchanged (additive extension)", () => {
  for (const kind of ["grant", "rd", "assistance", "procurement"]) {
    assert.equal(OpportunityKindSchema.parse(kind), kind);
  }
});

test("SBIR is NOT a kind — it is source:'sbir' + kind:'rd'", () => {
  // Guard the modeling decision: no parallel `sbir` kind was introduced.
  assert.equal(OpportunityKindSchema.safeParse("sbir").success, false);

  const sbir = OpportunitySchema.parse({
    id: "sbir-topic-1",
    source: "sbir",
    kind: "rd",
    program: "SBIR Phase I Topic",
    agency: "NIH",
    description: "R&D topic",
  });
  assert.equal(sbir.source, "sbir");
  assert.equal(sbir.kind, "rd");
});

test("a full Opportunity with kind:'loan' parses via OpportunitySchema", () => {
  const loan = OpportunitySchema.parse({
    id: "loan-1",
    source: "assistance-listings",
    kind: "loan",
    program: "Rural Business Development Loan",
    agency: "USDA",
    description: "Repayable capital for rural businesses.",
  });
  assert.equal(loan.kind, "loan");
});

// --- 2. Evergreen normalization: no deadline, no funding, no throw ----------

test("deriveStatus preserves evergreen statuses instead of collapsing to unknown", () => {
  assert.equal(deriveStatus("rolling"), "rolling");
  assert.equal(deriveStatus("continuous"), "continuous");
  assert.equal(deriveStatus("standing"), "standing");
  // Sanity: unrelated / missing input still resolves to unknown.
  assert.equal(deriveStatus("something-else"), "unknown");
  assert.equal(deriveStatus(undefined), "unknown");
});

test("an evergreen (no-deadline / no-funding) record normalizes cleanly", () => {
  const input: NormalizeGrantsGovInput = {
    hit: {
      id: 999001,
      title: "Standing Rolling Research Program",
      agency: "NSF",
      oppStatus: "rolling", // evergreen — no close date
      // deliberately no openDate / closeDate
    },
    detail: null, // no award floor/ceiling → funding-less
    keywords: ["research"],
    retrievedAt: "2026-08-15T00:00:00.000Z",
    snapshotVersion: "a0-test",
  };

  const row = normalizeGrantsGovRecord(input);

  // Evergreen status is preserved (not "unknown"); not treated as forecasted.
  assert.equal(row.status, "rolling");
  assert.equal(row.forecasted, false);

  // Deadline-less: no deadline text, no structured close/response dates.
  assert.equal(row.deadline, undefined);
  assert.equal(row.key_dates.open_date, undefined);
  assert.equal(row.key_dates.close_date, undefined);
  assert.equal(row.key_dates.response_date, undefined);

  // Funding-less: no floor/ceiling on either the v1 mirror or the structured range.
  assert.equal(row.fundingLow, undefined);
  assert.equal(row.fundingHigh, undefined);
  assert.equal(row.award_range.floor, undefined);
  assert.equal(row.award_range.ceiling, undefined);
  assert.equal(row.award_range.currency, "USD");

  // The structured fields Canon requires are all present, so the row still
  // passes the STRICTER write-boundary schema (extra `raw` key is stripped).
  assert.doesNotThrow(() => parseCanonOpportunity(row));
  const canon = parseCanonOpportunity(row);
  assert.equal(canon.status, "rolling");
  assert.deepEqual(canon.eligibility_rules, []);
});
