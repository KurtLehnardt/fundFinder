import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  BILLING_TIERS,
  billingFeatures,
  getBillingTier,
  type BillingTier,
} from "../mockBilling";

/**
 * FE-07 — the local MOCK billing layer. These are contract-shape checks on the
 * tier -> feature mapping the sidebar and OpportunityCard padlocks read; the
 * layer gates nothing and takes no charge.
 */
describe("mockBilling", () => {
  test("billingFeatures maps each tier to the FE-07 table exactly", () => {
    assert.deepEqual(billingFeatures("free"), {
      autoApply: false,
      autoApplyLimitPerMonth: 0,
      competitor: false,
    });
    assert.deepEqual(billingFeatures("pro"), {
      autoApply: true,
      autoApplyLimitPerMonth: 10,
      competitor: false,
    });
    assert.deepEqual(billingFeatures("max"), {
      autoApply: true,
      autoApplyLimitPerMonth: null,
      competitor: true,
    });
  });

  test("BILLING_TIERS lists the three tiers in order with honest price labels", () => {
    assert.deepEqual(
      BILLING_TIERS.map((t) => t.id),
      ["free", "pro", "max"] as BillingTier[],
    );
    assert.deepEqual(
      BILLING_TIERS.map((t) => t.priceLabel),
      ["$0", "$20/mo", "$100/mo"],
    );
  });

  test("every tier card's own features match billingFeatures(id)", () => {
    for (const meta of BILLING_TIERS) {
      assert.deepEqual(meta.features, billingFeatures(meta.id));
    }
  });

  test("getBillingTier() defaults to free with no window (SSR / no storage)", () => {
    assert.equal(typeof globalThis.window, "undefined");
    assert.equal(getBillingTier(), "free");
  });
});
