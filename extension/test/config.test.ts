import { describe, expect, test } from "vitest";
import { PortalFieldMapSchema, isSelectorCaptured } from "../src/config/schema";
import { PORTAL_REGISTRY, ALL_PORTALS, resolvePortalForUrl } from "../src/config";

describe("PortalFieldMapSchema — every seed config validates", () => {
  test.each(Object.entries(PORTAL_REGISTRY))("%s parses cleanly", (_id, portal) => {
    expect(() => PortalFieldMapSchema.parse(portal)).not.toThrow();
  });
});

describe("isSelectorCaptured", () => {
  test("false for an undefined strategy", () => {
    expect(isSelectorCaptured(undefined)).toBe(false);
  });
  test("false when every tier is a TODO placeholder", () => {
    expect(isSelectorCaptured({ id: "TODO: capture", name: "TODO: capture" })).toBe(false);
  });
  test("true when at least one tier is a real (non-TODO) value", () => {
    expect(isSelectorCaptured({ id: "TODO: capture", name: "realName" })).toBe(true);
  });
});

describe("INV-9 — every seed-config field selector ships as an all-TODO placeholder", () => {
  test.each(ALL_PORTALS)("$portalId: no field binding has a captured selector yet", (portal) => {
    for (const field of portal.fields) {
      expect(isSelectorCaptured(field.selector)).toBe(false);
    }
  });
});

describe("resolvePortalForUrl — registry lookup", () => {
  test("resolves grants.gov URLs", () => {
    expect(resolvePortalForUrl("https://www.grants.gov/workspace/foo")?.portalId).toBe("grants_gov");
    expect(resolvePortalForUrl("https://apply07.grants.gov/apply/foo")?.portalId).toBe("grants_gov");
  });

  test("resolves research.gov URLs", () => {
    expect(resolvePortalForUrl("https://www.research.gov/anything")?.portalId).toBe("research_gov");
  });

  test("resolves NIH ASSIST URLs (path-scoped to /assist/)", () => {
    expect(resolvePortalForUrl("https://public.era.nih.gov/assist/foo")?.portalId).toBe("nih_assist");
  });

  test("resolves sbir.gov URLs", () => {
    expect(resolvePortalForUrl("https://www.sbir.gov/topics")?.portalId).toBe("sbir_gov");
  });

  test("returns undefined for an out-of-scope host", () => {
    expect(resolvePortalForUrl("https://login.gov/anything")).toBeUndefined();
    expect(resolvePortalForUrl("https://sam.gov/anything")).toBeUndefined();
    expect(resolvePortalForUrl("https://example.com")).toBeUndefined();
  });
});

describe("Box 21 signature/date rows are structurally excluded in every applicable seed config", () => {
  test.each(Object.entries(PORTAL_REGISTRY))("%s: any boxRef 21 signature/date_signed field has neverFill:true", (_id, portal) => {
    const box21Excluded = portal.fields.filter((f) => f.role === "signature" || f.role === "date_signed");
    for (const f of box21Excluded) {
      expect(f.neverFill).toBe(true);
      expect(f.packageKey).toBeNull();
    }
  });
});

describe("nih_assist seed config (spec §2.3) — empty steps/advanceControls, no credential fields", () => {
  test("steps and advanceControls are empty (fully auth-gated, no flow observed)", () => {
    expect(PORTAL_REGISTRY.nih_assist.steps).toEqual([]);
    expect(PORTAL_REGISTRY.nih_assist.advanceControls).toEqual([]);
  });

  test("no field binding has role: credential, and no selector references password/username", () => {
    for (const field of PORTAL_REGISTRY.nih_assist.fields) {
      expect(field.role).not.toBe("credential");
      const allSelectorText = JSON.stringify(field.selector).toLowerCase();
      expect(allSelectorText).not.toMatch(/password|username/);
    }
  });
});
