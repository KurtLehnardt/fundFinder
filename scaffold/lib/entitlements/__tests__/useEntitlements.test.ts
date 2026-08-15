import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  STUB_TIER,
  readEntitlements,
  toEntitlementsView,
  useEntitlements,
} from "../useEntitlements";

/**
 * R6 — the client-only entitlement stub must default to the free tier, which is
 * what makes `assisted_application` resolve to false (so the R6 flow shows Pro
 * framing). It gates nothing; these are contract-shape sanity checks only.
 */
describe("useEntitlements (client-only stub)", () => {
  test("defaults to the free tier", () => {
    assert.equal(STUB_TIER, "free");
    assert.equal(readEntitlements().tier, "free");
  });

  test("free tier does NOT entitle assisted_application", () => {
    assert.equal(readEntitlements("free").features.assisted_application, false);
  });

  test("the framing view exposes isPro=false / assistedApplication=false at the default", () => {
    const view = useEntitlements();
    assert.equal(view.tier, "free");
    assert.equal(view.isPro, false);
    assert.equal(view.assistedApplication, false);
  });

  test("projection stays in sync with the underlying entitlements record", () => {
    const view = toEntitlementsView(readEntitlements("free"));
    assert.equal(view.assistedApplication, view.features.assisted_application);
  });

  test("contract sanity: the pro tier WOULD entitle assisted_application (stub just never selects it)", () => {
    assert.equal(readEntitlements("pro").features.assisted_application, true);
    assert.equal(toEntitlementsView(readEntitlements("pro")).isPro, true);
  });
});
