import { describe, expect, test, beforeEach } from "vitest";
import { writeValue, readValue, normalizeForCompare } from "../src/content/domIO";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("writeValue / readValue — spec §3.2 native value-set discipline", () => {
  test("text: uses the native setter and dispatches input + change", () => {
    document.body.innerHTML = '<input id="x" />';
    const el = document.getElementById("x") as HTMLInputElement;
    let inputFired = false;
    let changeFired = false;
    el.addEventListener("input", () => (inputFired = true));
    el.addEventListener("change", () => (changeFired = true));

    const outcome = writeValue(el, "text", "hello");
    expect(outcome.wrote).toBe(true);
    expect(el.value).toBe("hello");
    expect(inputFired).toBe(true);
    expect(changeFired).toBe(true);
  });

  test("text: bypasses a framework-style overridden `value` setter/getter (React-like value tracker)", () => {
    document.body.innerHTML = '<input id="x" />';
    const el = document.getElementById("x") as HTMLInputElement;

    // Simulate a React-style value-tracking shim that intercepts direct
    // `el.value = x` assignment on the INSTANCE (not the prototype).
    let shimCalls = 0;
    Object.defineProperty(el, "value", {
      configurable: true,
      get() {
        return "";
      },
      set() {
        shimCalls += 1;
      },
    });

    writeValue(el, "text", "hello");
    // The native PROTOTYPE setter was used, bypassing the instance shim.
    expect(shimCalls).toBe(0);
  });

  test("textarea: writes via native setter", () => {
    document.body.innerHTML = "<textarea id='x'></textarea>";
    const el = document.getElementById("x") as HTMLTextAreaElement;
    writeValue(el, "textarea", "long text");
    expect(el.value).toBe("long text");
  });

  test("date: writes via native setter (as plain text; portal owns the exact date-input semantics)", () => {
    document.body.innerHTML = '<input id="x" type="date" />';
    const el = document.getElementById("x") as HTMLInputElement;
    writeValue(el, "date", "2026-08-16");
    expect(el.value).toBe("2026-08-16");
  });

  test("select: matches an option by normalized text and sets value + dispatches change", () => {
    document.body.innerHTML = '<select id="x"><option value="ca">California</option><option value="ny">New York</option></select>';
    const el = document.getElementById("x") as HTMLSelectElement;
    let changed = false;
    el.addEventListener("change", () => (changed = true));

    const outcome = writeValue(el, "select", "New York");
    expect(outcome.wrote).toBe(true);
    expect(el.value).toBe("ny");
    expect(changed).toBe(true);
  });

  test("select: byValue optionMatch takes priority", () => {
    document.body.innerHTML = '<select id="x"><option value="ca">California</option><option value="ny">New York</option></select>';
    const el = document.getElementById("x") as HTMLSelectElement;
    writeValue(el, "select", "irrelevant text", { byValue: "ca" });
    expect(el.value).toBe("ca");
  });

  test("select: no matching option ⇒ not written, note explains why (never guessed)", () => {
    document.body.innerHTML = '<select id="x"><option value="ca">California</option></select>';
    const el = document.getElementById("x") as HTMLSelectElement;
    const before = el.value;
    const outcome = writeValue(el, "select", "Texas");
    expect(outcome.wrote).toBe(false);
    expect(outcome.note).toMatch(/no matching/i);
    expect(el.value).toBe(before);
  });

  test("radio: selects the matching option in the group by text", () => {
    document.body.innerHTML = `
      <input type="radio" id="r1" name="entityType" value="nonprofit" />
      <label for="r1">Nonprofit</label>
      <input type="radio" id="r2" name="entityType" value="forprofit" />
      <label for="r2">For-profit</label>
    `;
    const el = document.getElementById("r1") as HTMLInputElement;
    const outcome = writeValue(el, "radio", "For-profit");
    expect(outcome.wrote).toBe(true);
    expect((document.getElementById("r2") as HTMLInputElement).checked).toBe(true);
    expect((document.getElementById("r1") as HTMLInputElement).checked).toBe(false);
  });

  test("checkbox: sets checked from an explicit grounded boolean-like string", () => {
    document.body.innerHTML = '<input type="checkbox" id="x" />';
    const el = document.getElementById("x") as HTMLInputElement;
    writeValue(el, "checkbox", "true");
    expect(el.checked).toBe(true);
    writeValue(el, "checkbox", "false");
    expect(el.checked).toBe(false);
  });
});

describe("readValue", () => {
  test("text/textarea/date reads .value", () => {
    document.body.innerHTML = '<input id="x" value="abc" />';
    expect(readValue(document.getElementById("x")!, "text")).toBe("abc");
  });

  test("select reads the selected option's text", () => {
    document.body.innerHTML = '<select id="x"><option value="ca">California</option></select>';
    expect(readValue(document.getElementById("x")!, "select")).toBe("California");
  });

  test("checkbox reads the checked state as a string", () => {
    document.body.innerHTML = '<input type="checkbox" id="x" checked />';
    expect(readValue(document.getElementById("x")!, "checkbox")).toBe("true");
  });
});

describe("normalizeForCompare", () => {
  test("collapses whitespace and trims", () => {
    expect(normalizeForCompare("  hello   world  ")).toBe("hello world");
  });
});
