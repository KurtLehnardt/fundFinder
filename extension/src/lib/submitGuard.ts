/**
 * The submit-guard (spec §4.3, INV-1). HARDCODED and UNCONDITIONAL: this
 * denylist ALWAYS wins over any config `advanceControls` allowlist. There is
 * NO configuration path that lets the extension click a submit/sign/certify
 * control — a config-authoring test (`test/submitGuard.test.ts`) proves that
 * even a submit-labeled control placed in a portal config's `advanceControls`
 * is still blocked here.
 *
 * This module has exactly one job: given a candidate element about to be
 * programmatically clicked, decide — from its own visible text/value/name/
 * id/aria-label — whether it is a submit/sign/certify/attest/file control.
 * If it matches, the caller (navigator.ts) MUST NOT click it.
 */

/**
 * Case-insensitive denylist. Matches whole-word occurrences of submit/sign/
 * certify/attest/finalize/file-application phrasing, per spec §4.3.
 */
export const SUBMIT_GUARD_PATTERN =
  /\b(submit|sign|e[-\s]?sign|certif(?:y|ication)|attest|finali[sz]e|file\s+application|sign\s*&?\s*(?:and\s*)?submit|submit\s+application|complete\s+submission)\b/i;

/** Normalize whitespace for a stable, comparable string. */
function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Gather every text signal the denylist checks: visible text, value, name, id, aria-label. */
function candidateStrings(el: Element): string[] {
  const strings: string[] = [];

  const text = el.textContent;
  if (text) strings.push(normalize(text));

  if (el instanceof HTMLInputElement || el instanceof HTMLButtonElement) {
    if (el.value) strings.push(normalize(el.value));
  }

  const name = el.getAttribute("name");
  if (name) strings.push(normalize(name));

  const id = el.getAttribute("id");
  if (id) strings.push(normalize(id));

  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) strings.push(normalize(ariaLabel));

  return strings;
}

/**
 * True iff `el` matches the hardcoded submit-guard denylist against ANY of
 * its visible text, `value`, `name`, `id`, or `aria-label`. This function is
 * the ONLY authority the navigator consults before a programmatic click —
 * it is called UNCONDITIONALLY, regardless of whether the control appears in
 * a config `advanceControls` allowlist (INV-1: the denylist always wins).
 */
export function isForbiddenControl(el: Element): boolean {
  return candidateStrings(el).some((s) => SUBMIT_GUARD_PATTERN.test(s));
}
