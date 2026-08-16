import { describe, expect, test } from "vitest";
import { applyTransform } from "../src/lib/transforms";

describe("applyTransform — pure value transforms (spec §3.2)", () => {
  test("identity / undefined transform id returns the value unchanged", () => {
    expect(applyTransform("hello", "identity")).toBe("hello");
    expect(applyTransform("hello", undefined)).toBe("hello");
  });

  test("date_iso_to_mmddyyyy converts YYYY-MM-DD to MM/DD/YYYY", () => {
    expect(applyTransform("2026-08-16", "date_iso_to_mmddyyyy")).toBe("08/16/2026");
  });

  test("date_iso_to_mmddyyyy handles a full ISO datetime by taking the date portion", () => {
    expect(applyTransform("2026-08-16T12:00:00Z", "date_iso_to_mmddyyyy")).toBe("08/16/2026");
  });

  test("date_iso_to_mmddyyyy returns non-ISO input unchanged rather than guessing", () => {
    expect(applyTransform("not-a-date", "date_iso_to_mmddyyyy")).toBe("not-a-date");
  });

  test("state_name_to_code maps a full state name to its 2-letter code", () => {
    expect(applyTransform("California", "state_name_to_code")).toBe("CA");
    expect(applyTransform("new york", "state_name_to_code")).toBe("NY");
    expect(applyTransform("  Idaho  ", "state_name_to_code")).toBe("ID");
  });

  test("state_name_to_code returns unrecognized input unchanged", () => {
    expect(applyTransform("Not A State", "state_name_to_code")).toBe("Not A State");
  });

  test("entity_type_to_sf424_option currently passes the human label through unchanged", () => {
    expect(applyTransform("For-profit — small business", "entity_type_to_sf424_option")).toBe(
      "For-profit — small business",
    );
  });

  test("currency_plain strips $ and thousands separators", () => {
    expect(applyTransform("$1,250.00", "currency_plain")).toBe("1250.00");
    expect(applyTransform("$500", "currency_plain")).toBe("500");
  });

  test("currency_plain returns non-numeric input unchanged", () => {
    expect(applyTransform("not a number", "currency_plain")).toBe("not a number");
  });
});
