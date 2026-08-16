import { describe, expect, test, beforeEach } from "vitest";
import { isForbiddenControl } from "../src/lib/submitGuard";
import { grantsGov } from "../src/config/portals/grants_gov";
import { researchGov } from "../src/config/portals/research_gov";
import { nihAssist } from "../src/config/portals/nih_assist";
import { sbirGov } from "../src/config/portals/sbir_gov";
import { resolve, UNRESOLVED } from "../src/content/selectorResolver";
import type { PortalFieldMap } from "../src/config/schema";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("isForbiddenControl — the hardcoded, unconditional denylist (INV-1)", () => {
  test.each([
    "Submit",
    "Submit Application",
    "Sign and Submit",
    "Sign & Submit",
    "E-Sign",
    "e sign",
    "Certify",
    "Certification",
    "Attest",
    "Finalize",
    "Finalise",
    "File Application",
    "Complete Submission",
  ])("matches %j (case-insensitive whole-word)", (label) => {
    const el = document.createElement("button");
    el.textContent = label;
    document.body.appendChild(el);
    expect(isForbiddenControl(el)).toBe(true);
  });

  test.each(["Save", "Save & Continue", "Next", "Back", "Cancel", "Print", "Download PDF"])(
    "does NOT match a legitimate advance/utility control %j",
    (label) => {
      const el = document.createElement("button");
      el.textContent = label;
      document.body.appendChild(el);
      expect(isForbiddenControl(el)).toBe(false);
    },
  );

  test("matches against name/id/aria-label even when visible text differs", () => {
    const el = document.createElement("button");
    el.textContent = "Go";
    el.setAttribute("aria-label", "Submit Application");
    document.body.appendChild(el);
    expect(isForbiddenControl(el)).toBe(true);
  });

  test("does not false-positive on unrelated words containing similar substrings", () => {
    // "Signature" should not match a bare "sign" word-boundary check incorrectly
    // in a way that blocks something benign like "Assignment" or "Designer".
    const el = document.createElement("button");
    el.textContent = "Assignment Details";
    document.body.appendChild(el);
    expect(isForbiddenControl(el)).toBe(false);
  });
});

describe("config-authoring test — denylist ALWAYS wins over the config allowlist (INV-1)", () => {
  const portals: [string, PortalFieldMap][] = [
    ["grants_gov", grantsGov],
    ["research_gov", researchGov],
    ["nih_assist", nihAssist],
    ["sbir_gov", sbirGov],
  ];

  // Every portal's forbiddenControls list documents genuine submit/sign/
  // certify labels for that portal (grants_gov additionally documents
  // "Check Package for Errors" as a human-driven, do-not-auto-click action
  // that ISN'T itself a submission — its protection comes from simply never
  // being placed in that portal's advanceControls allowlist, not from the
  // submit-guard regex, so it's deliberately excluded from this assertion).
  test.each(portals)(
    "%s: every genuinely submit/sign/certify-labeled forbiddenControls entry matches the denylist",
    (_name, portal) => {
      const submitShaped = (portal.forbiddenControls ?? []).filter(
        (s) => s.labelText && /sign|submit|certif/i.test(s.labelText),
      );
      expect(submitShaped.length).toBeGreaterThan(0);
      for (const strategy of submitShaped) {
        const el = document.createElement("button");
        el.textContent = strategy.labelText!;
        document.body.appendChild(el);
        expect(isForbiddenControl(el)).toBe(true);
        el.remove();
      }
    },
  );

  test("even if a submit-labeled control is placed in advanceControls, isForbiddenControl blocks it", () => {
    // Simulate a config-authoring mistake: someone adds a submit control to
    // the ALLOWLIST. The hardcoded denylist must still block it — there is
    // no config shape that can whitelist a submit/sign/certify control.
    const maliciousAllowlist = [{ labelText: "Sign and Submit" }, { labelText: "Save" }];

    document.body.innerHTML = '<button id="signSubmitBtn">Sign and Submit</button><button id="saveBtn">Save</button>';

    for (const strategy of maliciousAllowlist) {
      const el = resolve(strategy, document);
      expect(el).not.toBe(UNRESOLVED);
      if (el === UNRESOLVED) continue;
      if (strategy.labelText === "Sign and Submit") {
        expect(isForbiddenControl(el)).toBe(true);
      } else {
        expect(isForbiddenControl(el)).toBe(false);
      }
    }
  });

  test.each(portals)("%s: every advanceControls entry (if resolvable) must NOT be forbidden", (_name, portal) => {
    for (const strategy of portal.advanceControls) {
      if (!strategy.labelText || /^todo/i.test(strategy.labelText)) continue;
      const el = document.createElement("button");
      el.textContent = strategy.labelText;
      document.body.appendChild(el);
      expect(isForbiddenControl(el)).toBe(false);
      el.remove();
    }
  });
});
