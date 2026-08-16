import { z } from "zod";
import { GrantedExportEnvelopeSchema, digestPayload, type GrantedExportEnvelope } from "./envelope";
import { PrefilledFormsSchema } from "./contracts/applicationForms";
import { FOUNDER_TODO_PATTERN } from "./contracts/applicationDraft";

/**
 * The user-mediated import pipeline (spec §6.3, INV-8). Each step REFUSES —
 * never a partial import. The payload is treated strictly as inert DATA: it
 * is never interpreted as a selector, URL, script, or command, at any step.
 */

/** 512 KB raw-size cap (spec §6.3 step 1) — bounds memory before any parse. */
export const MAX_IMPORT_BYTES = 512 * 1024;

export type ImportFailureReason =
  | "too_large"
  | "invalid_json"
  | "invalid_envelope"
  | "digest_mismatch"
  | "invalid_forms_contract"
  | "honesty_violation";

export interface ImportFailure {
  ok: false;
  reason: ImportFailureReason;
  message: string;
}

export interface ImportSuccess {
  ok: true;
  envelope: GrantedExportEnvelope;
}

export type ImportResult = ImportFailure | ImportSuccess;

function fail(reason: ImportFailureReason, message: string): ImportFailure {
  return { ok: false, reason, message };
}

/**
 * Defense-in-depth final honesty guard (spec §6.3 step 6), on top of the
 * `PrefilledFormsSchema.superRefine` re-run in step 5: explicitly re-walk
 * every field and refuse if any `prefilled` field lacks `value`/`source`, or
 * any gap carries a value. (Step 5 already structurally guarantees this via
 * the vendored schema's own `superRefine`; this is a belt-and-suspenders
 * re-check that does not trust the schema pass alone, in case a future
 * schema change accidentally weakens the `superRefine`.)
 */
function honestyGuardPasses(forms: z.infer<typeof PrefilledFormsSchema>): boolean {
  for (const form of forms.forms) {
    for (const field of form.fields) {
      if (field.status === "prefilled") {
        if (!field.value || field.value.trim().length === 0) return false;
        if (!field.source || field.source.trim().length === 0) return false;
        if (FOUNDER_TODO_PATTERN.test(field.display)) return false;
      } else {
        if (field.value !== undefined) return false;
        if (field.source !== undefined) return false;
        if (!FOUNDER_TODO_PATTERN.test(field.display)) return false;
      }
    }
  }
  return true;
}

/**
 * Validate a raw imported string end-to-end: size → JSON → envelope schema →
 * integrity digest → vendored Zod contracts (`payload.forms`) → honesty
 * guard. Returns either the validated envelope (ready to store) or a typed
 * failure with a specific, human-readable reason. NEVER throws.
 */
export async function validateImport(raw: string): Promise<ImportResult> {
  // 1. Size cap — reject BEFORE parse.
  const byteLength = new TextEncoder().encode(raw).length;
  if (byteLength > MAX_IMPORT_BYTES) {
    return fail("too_large", `Package is ${byteLength} bytes, which exceeds the ${MAX_IMPORT_BYTES}-byte limit.`);
  }

  // 2. JSON parse.
  let rawJson: unknown;
  try {
    rawJson = JSON.parse(raw);
  } catch {
    return fail("invalid_json", "That file isn't valid JSON. Re-export the package from Granted and try again.");
  }

  // 3. Envelope schema. Zod-validate structurally (literal format/version,
  // digest shape, and a loose AssembledPackage top-level shape).
  const envelopeParse = GrantedExportEnvelopeSchema.safeParse(rawJson);
  if (!envelopeParse.success) {
    return fail(
      "invalid_envelope",
      `This package couldn't be verified — its shape doesn't match a Granted export: ${envelopeParse.error.issues[0]?.message ?? "unknown shape mismatch"}.`,
    );
  }

  // 4. Integrity digest. Recompute over the RAW, pre-Zod `payload` (Zod's
  // z.object() strips unknown top-level keys on parse, which would silently
  // change what gets hashed if we digested the parsed value instead) and
  // compare against the envelope's declared digest.
  const rawPayload = (rawJson as { payload?: unknown }).payload;
  const recomputedDigest = await digestPayload(rawPayload);
  if (recomputedDigest !== envelopeParse.data.digest.value) {
    return fail(
      "digest_mismatch",
      "This package couldn't be verified — its contents don't match its integrity digest. Re-export from Granted rather than editing the file.",
    );
  }

  // 5. Contract re-validation. Re-parse `payload.forms` through the VENDORED
  // PrefilledFormsSchema — this re-runs the honesty superRefine (grounded ⇒
  // value+source; gap ⇒ placeholder-only; gaps exactly the gap-display set).
  const formsParse = PrefilledFormsSchema.safeParse(envelopeParse.data.payload.forms);
  if (!formsParse.success) {
    return fail(
      "invalid_forms_contract",
      `This package couldn't be verified — its form data failed the honesty contract: ${formsParse.error.issues[0]?.message ?? "unknown validation failure"}.`,
    );
  }

  // 6. Honesty invariants (defense-in-depth, explicit final guard).
  if (!honestyGuardPasses(formsParse.data)) {
    return fail(
      "honesty_violation",
      "This package couldn't be verified — it contains a field that is neither fully grounded nor an honest gap.",
    );
  }

  // All steps passed. Re-assemble the envelope with the RE-VALIDATED `forms`
  // object attached (so downstream consumers see the exact re-parsed,
  // strictly-typed shape, not merely the loosely-typed one from step 3).
  // `narratives`/`budget`/`checklist`/`draftableSections` are only
  // STRUCTURALLY checked (step 3's loose schema) — spec §6.3 step 5 only
  // mandates re-running the honesty contract over `payload.forms` — so the
  // cast below is deliberate: those fields are still inert, already-passed
  // data, just not re-validated field-by-field the way `forms` is.
  const envelope: GrantedExportEnvelope = {
    ...envelopeParse.data,
    payload: {
      ...envelopeParse.data.payload,
      forms: formsParse.data,
    } as unknown as GrantedExportEnvelope["payload"],
  };

  return { ok: true, envelope };
}
