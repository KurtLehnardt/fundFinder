import { describe, expect, test, beforeEach } from "vitest";
import { resolve, UNRESOLVED } from "../src/content/selectorResolver";

function setBody(html: string): void {
  document.body.innerHTML = html;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("resolve — tiered selector resolution (spec §2.2)", () => {
  test("id tier resolves an exact single match", () => {
    setBody('<input id="orgName" />');
    const el = resolve({ id: "orgName" }, document);
    expect(el).not.toBe(UNRESOLVED);
    expect((el as Element).tagName).toBe("INPUT");
  });

  test("a TODO-prefixed id is treated as absent (case-insensitive) — INV-9", () => {
    setBody('<input id="orgName" />');
    expect(resolve({ id: "TODO: in-session selector capture" }, document)).toBe(UNRESOLVED);
    expect(resolve({ id: "todo: whatever" }, document)).toBe(UNRESOLVED);
  });

  test("falls through id → name when id is TODO/absent", () => {
    setBody('<input name="orgName" />');
    const el = resolve({ id: "TODO: capture", name: "orgName" }, document);
    expect(el).not.toBe(UNRESOLVED);
  });

  test("falls through name → aria-label", () => {
    setBody('<input aria-label="Organization Name" />');
    const el = resolve({ name: "TODO: capture", aria: { label: "Organization Name" } }, document);
    expect(el).not.toBe(UNRESOLVED);
  });

  test("aria-labelledby resolves to the element referenced BY that id (spec §2.2 step 2.3, literal)", () => {
    setBody('<span id="lbl">Organization Name</span><input aria-labelledby="lbl" />');
    const el = resolve({ aria: { labelledby: "lbl" } }, document);
    expect(el).not.toBe(UNRESOLVED);
    // Per spec: "aria.labelledby → element referenced by that id" — i.e. the
    // element WHOSE id equals the given value (the <span> here), not the
    // control that points at it.
    expect((el as Element).tagName).toBe("SPAN");
  });

  test("aria-labelledby falls back to matching [aria-labelledby=…] on the control when no element has that id", () => {
    setBody('<input id="uei" aria-labelledby="uei-label-text-not-an-element-id" />');
    const el = resolve({ aria: { labelledby: "uei-label-text-not-an-element-id" } }, document);
    expect(el).not.toBe(UNRESOLVED);
    expect((el as Element).tagName).toBe("INPUT");
  });

  test("labelText resolves via <label for>", () => {
    setBody('<label for="uei">Unique Entity Identifier (UEI)</label><input id="uei" />');
    const el = resolve({ labelText: "Unique Entity Identifier (UEI)" }, document);
    expect(el).not.toBe(UNRESOLVED);
    expect((el as HTMLInputElement).id).toBe("uei");
  });

  test("labelText resolves via a nested control inside the <label>", () => {
    setBody("<label>Project Title<input id='pt' /></label>");
    const el = resolve({ labelText: "Project Title" }, document);
    expect(el).not.toBe(UNRESOLVED);
    expect((el as HTMLInputElement).id).toBe("pt");
  });

  test("labelText normalizes whitespace before comparing", () => {
    setBody('<label for="x">  Legal   Name  </label><input id="x" />');
    const el = resolve({ labelText: "Legal Name" }, document);
    expect(el).not.toBe(UNRESOLVED);
  });

  test("labelText also matches a landmark heading's own direct text (for PortalStep.landmark)", () => {
    setBody("<h2>Application for Federal Assistance</h2>");
    const el = resolve({ labelText: "Application for Federal Assistance" }, document);
    expect(el).not.toBe(UNRESOLVED);
    expect((el as Element).tagName).toBe("H2");
  });

  test("labelText also matches a button's own text (for advanceControls)", () => {
    setBody("<button>Save &amp; Continue</button>");
    const el = resolve({ labelText: "Save & Continue" }, document);
    expect(el).not.toBe(UNRESOLVED);
    expect((el as Element).tagName).toBe("BUTTON");
  });

  test("ambiguity at a tier (>1 match) falls through rather than guessing, then UNRESOLVED if nothing else resolves", () => {
    setBody('<input name="dup" /><input name="dup" />');
    expect(resolve({ name: "dup" }, document)).toBe(UNRESOLVED);
  });

  test("ambiguity falls through to a lower tier that DOES resolve uniquely", () => {
    setBody('<input name="dup" /><input name="dup" id="unique-one" />');
    // name is ambiguous (2 matches) -> falls through; aria/labelText absent -> UNRESOLVED overall
    // but if id is unique for a different strategy entirely, that tier should win on its own.
    const el = resolve({ id: "unique-one", name: "dup" }, document);
    expect(el).not.toBe(UNRESOLVED);
  });

  test("a disabled element resolves but is treated as UNRESOLVED (visibility/enabled gate)", () => {
    setBody('<input id="x" disabled />');
    expect(resolve({ id: "x" }, document)).toBe(UNRESOLVED);
  });

  test("a readonly element is treated as UNRESOLVED", () => {
    setBody('<input id="x" readonly />');
    expect(resolve({ id: "x" }, document)).toBe(UNRESOLVED);
  });

  test("a hidden element (hidden attribute) is treated as UNRESOLVED", () => {
    setBody('<input id="x" hidden />');
    expect(resolve({ id: "x" }, document)).toBe(UNRESOLVED);
  });

  test("a display:none element is treated as UNRESOLVED", () => {
    setBody('<input id="x" style="display:none" />');
    expect(resolve({ id: "x" }, document)).toBe(UNRESOLVED);
  });

  test("no tier resolving at all yields UNRESOLVED, never a throw", () => {
    setBody("<div></div>");
    expect(() => resolve({ id: "nope", name: "nope", labelText: "nope" }, document)).not.toThrow();
    expect(resolve({ id: "nope", name: "nope", labelText: "nope" }, document)).toBe(UNRESOLVED);
  });

  test("an empty strategy (all tiers absent) yields UNRESOLVED without throwing", () => {
    setBody("<input />");
    expect(resolve({}, document)).toBe(UNRESOLVED);
  });
});
