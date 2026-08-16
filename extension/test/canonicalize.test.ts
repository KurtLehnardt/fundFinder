import { describe, expect, test } from "vitest";
import { canonicalize, digestPayload } from "../src/lib/envelope";

describe("canonicalize", () => {
  test("the shared test vector — anchors app-side/extension-side agreement (spec §6.3/§9.4)", () => {
    expect(canonicalize({ b: 1, a: [3, 2], c: { x: true } })).toBe('{"a":[3,2],"b":1,"c":{"x":true}}');
  });

  test("sorts object keys ascending by default JS string sort, recursively", () => {
    expect(canonicalize({ z: 1, m: { z: 1, a: 2 }, a: 3 })).toBe('{"a":3,"m":{"a":2,"z":1},"z":1}');
  });

  test("no spaces introduced by serialization itself (separators, not string content)", () => {
    // Note: a space INSIDE a string VALUE (e.g. "x y") is legitimate content,
    // not serialization whitespace — canonical JSON forbids the latter
    // (no space after `:` or `,`), not the former.
    const out = canonicalize({ a: 1, b: [1, 2, 3] });
    expect(out).toBe('{"a":1,"b":[1,2,3]}');
    expect(out).not.toContain(", ");
    expect(out).not.toContain(": ");
  });

  test("arrays preserve element order (not sorted)", () => {
    expect(canonicalize([3, 1, 2])).toBe("[3,1,2]");
  });

  test("primitives use plain JSON.stringify", () => {
    expect(canonicalize("hello")).toBe('"hello"');
    expect(canonicalize(42)).toBe("42");
    expect(canonicalize(true)).toBe("true");
    expect(canonicalize(null)).toBe("null");
  });

  test("undefined object properties are dropped, matching JSON.stringify semantics", () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  test("nested arrays of objects canonicalize deterministically regardless of input key order", () => {
    const a = canonicalize({ list: [{ y: 2, x: 1 }] });
    const b = canonicalize({ list: [{ x: 1, y: 2 }] });
    expect(a).toBe(b);
    expect(a).toBe('{"list":[{"x":1,"y":2}]}');
  });

  test("is deterministic across repeated calls on the same shape with different key insertion order", () => {
    const obj1 = { one: 1, two: 2, three: 3 };
    const obj2 = { three: 3, one: 1, two: 2 };
    expect(canonicalize(obj1)).toBe(canonicalize(obj2));
  });
});

describe("digestPayload", () => {
  test("produces a lowercase-hex 64-character SHA-256 digest", async () => {
    const digest = await digestPayload({ a: 1 });
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  test("is deterministic for the same canonical payload", async () => {
    const d1 = await digestPayload({ b: 1, a: 2 });
    const d2 = await digestPayload({ a: 2, b: 1 });
    expect(d1).toBe(d2);
  });

  test("changes when the payload changes", async () => {
    const d1 = await digestPayload({ a: 1 });
    const d2 = await digestPayload({ a: 2 });
    expect(d1).not.toBe(d2);
  });
});
