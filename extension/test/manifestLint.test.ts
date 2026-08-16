// @vitest-environment node
//
// Forced to the "node" environment (rather than the suite-wide jsdom
// default): importing manifest.config.ts pulls in @crxjs/vite-plugin's
// esbuild-based transform machinery, which asserts a native-realm
// TextEncoder/Uint8Array identity that jsdom's polyfilled globals break.
// This file does no DOM work, so plain Node is both correct and sufficient.
import { describe, expect, test } from "vitest";
import manifestExport from "../manifest.config";

/**
 * Manifest-lint (INV-5, INV-6, part of INV-7). `defineManifest` is an
 * identity function (`@crxjs/vite-plugin`), so importing `manifest.config.ts`
 * directly gives us the exact object the build emits as `manifest.json` — no
 * need to build first for this test to be meaningful.
 *
 * `manifest.config.ts`'s default export is statically typed as
 * `ManifestV3Export` (a union including `Promise<ManifestV3>` for the
 * general case), but THIS project's config is always a plain synchronous
 * object literal (never a function/Promise) — so this narrow local type
 * (just the fields this test touches) avoids depending on `@crxjs/vite-plugin`'s
 * internal type names while still being a real runtime shape check.
 */
interface ManifestUnderTest {
  manifest_version: number;
  host_permissions?: string[];
  permissions?: string[];
  content_security_policy?: { extension_pages?: string };
  background?: { type?: string; service_worker?: string };
  content_scripts?: { matches?: string[] }[];
  externally_connectable?: unknown;
}

const manifest = manifestExport as unknown as ManifestUnderTest;

const BANNED_HOST_SUBSTRINGS = ["login.gov", "sam.gov", "id.sam.gov"];

describe("manifest.config.ts — least-privilege manifest lint", () => {
  test("host_permissions contains no <all_urls> and no wildcarded top-level domain", () => {
    const hosts = manifest.host_permissions ?? [];
    expect(hosts).not.toContain("<all_urls>");
    for (const h of hosts) {
      expect(h).not.toBe("*://*/*");
      expect(h).not.toMatch(/^https?:\/\/\*\/\*$/);
    }
  });

  test("host_permissions is scoped to exactly the four in-scope portals (INV-6)", () => {
    const hosts = manifest.host_permissions ?? [];
    const allowedRoots = ["grants.gov", "research.gov", "public.era.nih.gov", "sbir.gov"];
    for (const h of hosts) {
      expect(allowedRoots.some((root) => h.includes(root))).toBe(true);
    }
  });

  test("host_permissions never lists a credential/IdP origin (INV-5)", () => {
    const hosts = (manifest.host_permissions ?? []).join(" ").toLowerCase();
    for (const banned of BANNED_HOST_SUBSTRINGS) {
      expect(hosts).not.toContain(banned);
    }
  });

  test("permissions are exactly the least-privilege set — no tabs/webNavigation/cookies/webRequest", () => {
    const perms = new Set(manifest.permissions ?? []);
    expect(perms).toEqual(new Set(["storage", "scripting", "activeTab"]));
    for (const banned of ["tabs", "webNavigation", "cookies", "webRequest", "history", "bookmarks"]) {
      expect(perms.has(banned as never)).toBe(false);
    }
  });

  test("CSP declares connect-src 'none' (the manifest-level partner to INV-7)", () => {
    const csp = manifest.content_security_policy?.extension_pages ?? "";
    expect(csp).toMatch(/connect-src\s+'none'/);
    expect(csp).toMatch(/script-src\s+'self'/);
  });

  test("externally_connectable is NOT declared (spec §6.2 — no standing web-origin channel)", () => {
    expect(manifest.externally_connectable).toBeUndefined();
  });

  test("background is a module-type service worker (MV3, not a persistent page)", () => {
    expect(manifest.background).toMatchObject({ type: "module" });
    expect(manifest.background?.service_worker).toMatch(/service-worker/);
  });

  test("content_scripts are path-scoped for NIH ASSIST to /assist/ only", () => {
    const assistScript = manifest.content_scripts?.find((cs) => cs.matches?.some((m) => m.includes("era.nih.gov")));
    expect(assistScript).toBeDefined();
    for (const m of assistScript?.matches ?? []) {
      expect(m).toContain("/assist/");
    }
  });

  test("manifest_version is 3", () => {
    expect(manifest.manifest_version).toBe(3);
  });
});
