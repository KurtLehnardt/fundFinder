import { z } from "zod";
import type { AssembledPackage } from "./contracts/package";

/**
 * The app→extension handoff envelope (spec §6.3). Validated on import by
 * `packageValidator.ts`. `externally_connectable` is deliberately NOT
 * declared anywhere in this extension (spec §6.2) — the ONLY way a package
 * reaches the extension is a human picking a file / pasting text into the
 * popup's import screen.
 */
export interface GrantedExportEnvelope {
  format: "granted.autofill.package"; // exact literal; anything else refused
  version: 1; // envelope format version; unknown ⇒ refused
  generated_at: string; // ISO-8601
  opportunity_id: string; // binds payload to an opportunity
  program_title: string;
  /** Canonical-JSON SHA-256 of `payload`, hex. Integrity / tamper-evidence. */
  digest: { alg: "SHA-256"; value: string };
  /** RESERVED for a future app-signing key; omitted under current no-server-key constraint. */
  signature?: { alg: string; value: string; keyId: string };
  /** The WS-G / G5 AssembledPackage, re-validated on import against the vendored contracts. */
  payload: AssembledPackage;
}

// ---------------------------------------------------------------------------
// Canonical JSON — MUST match the app-side (T7) exporter byte-for-byte.
// ---------------------------------------------------------------------------

/**
 * Deterministic canonical-JSON serialization:
 *   - objects  → keys sorted ascending by JS default string sort, each
 *                `JSON.stringify(key) + ":" + canonicalize(val)` joined by
 *                `,` and wrapped in `{}` — NO spaces.
 *   - arrays   → `[` + elements canonicalized in order joined by `,` + `]`.
 *   - primitives (string/number/boolean/null) → `JSON.stringify(value)`.
 *
 * `undefined` values on an object are DROPPED (matching `JSON.stringify`'s
 * own behavior for object properties), so canonicalizing a value that went
 * through a normal JS object literal never emits a stray `"key":undefined`.
 * This is the ONE spec (spec §6.3 / §9.4) both the app exporter and this
 * extension's importer implement identically — anchored by a shared test
 * vector (`test/canonicalize.test.ts`).
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    // string | number | boolean | null | undefined — JSON.stringify(undefined)
    // is itself `undefined` (not a string); callers never canonicalize a bare
    // top-level `undefined`, but array elements normalize it to "null" below.
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    const items = value.map((el) => (el === undefined ? "null" : canonicalize(el)));
    return `[${items.join(",")}]`;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`);
  return `{${parts.join(",")}}`;
}

/** Lowercase-hex encoding of a digest `ArrayBuffer`. */
function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Canonical-JSON SHA-256 of `payload`, lowercase hex. Uses the Web Crypto API
 * (`crypto.subtle`), available in both the extension runtime (service worker
 * + popup) and jsdom/Vitest test environments — no Node `crypto` import, so
 * this stays a pure browser-API function.
 */
export async function digestPayload(payload: unknown): Promise<string> {
  const canonical = canonicalize(payload);
  const bytes = new TextEncoder().encode(canonical);
  const digestBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return toHex(digestBuffer);
}

// ---------------------------------------------------------------------------
// Envelope schema
// ---------------------------------------------------------------------------

const DigestSchema = z.object({
  alg: z.literal("SHA-256"),
  value: z
    .string()
    .regex(/^[0-9a-f]{64}$/, "digest.value must be lowercase-hex SHA-256 (64 hex chars)"),
});

const SignatureSchema = z.object({
  alg: z.string().min(1),
  value: z.string().min(1),
  keyId: z.string().min(1),
});

/**
 * Loose structural schema for `AssembledPackage`. This is deliberately NOT
 * the load-bearing honesty gate — that is `PrefilledFormsSchema` re-run over
 * `payload.forms` in `packageValidator.ts` (spec §6.3 step 5), which reruns
 * the actual anti-fabrication `superRefine`s. This schema only guards against
 * a payload that is missing entire top-level sections or has the wrong
 * primitive types, so a garbled/truncated payload is refused before any
 * deeper (and more expensive) validation runs.
 */
export const AssembledPackagePayloadSchema = z.object({
  opportunity_id: z.string().min(1),
  program_title: z.string().min(1),
  generated_at: z.string().min(1),
  narrativeStatus: z.enum(["drafted", "unavailable"]),
  narrativeNote: z.string().optional(),
  requirementsAvailable: z.boolean(),
  narratives: z.array(z.record(z.string(), z.unknown())),
  draftableSections: z.array(z.record(z.string(), z.unknown())),
  forms: z.record(z.string(), z.unknown()),
  budget: z.record(z.string(), z.unknown()),
  checklist: z.record(z.string(), z.unknown()),
  gaps: z.array(z.string()),
});

export const GrantedExportEnvelopeSchema = z.object({
  format: z.literal("granted.autofill.package"),
  version: z.literal(1),
  generated_at: z.string().min(1),
  opportunity_id: z.string().min(1),
  program_title: z.string().min(1),
  digest: DigestSchema,
  signature: SignatureSchema.optional(),
  payload: AssembledPackagePayloadSchema,
});

export type GrantedExportEnvelopeParsed = z.infer<typeof GrantedExportEnvelopeSchema>;
