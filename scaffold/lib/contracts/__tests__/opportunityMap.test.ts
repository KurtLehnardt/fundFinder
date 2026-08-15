import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  OpportunityMapSchema,
  CURRENT_OPPORTUNITY_MAP_VERSION,
} from "../opportunityMap";

const here = dirname(fileURLToPath(import.meta.url));
const precomputed = JSON.parse(
  readFileSync(join(here, "../../../data/precomputed.json"), "utf8"),
) as Array<{ key: string; id: string; map: unknown }>;

/**
 * §3.6 — the OpportunityMap version tag must be ADDITIVE: every cached response
 * in data/precomputed.json (all of which predate the version tag) must still
 * validate. This is the CON-01 escalation guard turned into a test.
 */

test("every cached precomputed map validates against the formalized schema", () => {
  assert.ok(precomputed.length >= 5, "expected the 5 judged cases");
  for (const entry of precomputed) {
    const res = OpportunityMapSchema.safeParse(entry.map);
    assert.equal(
      res.success,
      true,
      `cached map '${entry.key}' failed: ${res.success ? "" : JSON.stringify(res.error.issues.slice(0, 3))}`,
    );
  }
});

test("cached maps carry no version tag (version is optional / additive)", () => {
  const parsed = OpportunityMapSchema.parse(precomputed[0].map);
  assert.equal(parsed.version, undefined);
});

test("a producer can stamp the current version without breaking the schema", () => {
  const stamped = { ...(precomputed[0].map as object), version: CURRENT_OPPORTUNITY_MAP_VERSION };
  const parsed = OpportunityMapSchema.parse(stamped);
  assert.equal(parsed.version, CURRENT_OPPORTUNITY_MAP_VERSION);
});
