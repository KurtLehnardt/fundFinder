import type { PortalFieldMap, PortalStep } from "../config/schema";
import { resolve, UNRESOLVED } from "./selectorResolver";
import { isForbiddenControl } from "../lib/submitGuard";

/**
 * Step-through navigation (spec §4). Section order comes ONLY from the
 * config (`PortalStep.order`) — the navigator never infers flow from page
 * content. Advancing is USER-INITIATED: this module exposes plain functions;
 * nothing here calls itself automatically. The popup (§5) is the only caller,
 * and it only calls `advanceToNextStep` in direct response to a user clicking
 * "Go to next section." Every candidate advance control is run through the
 * submit-guard (`isForbiddenControl`) before any click — and that check
 * ALWAYS wins over the config `advanceControls` allowlist (INV-1).
 */

export interface DetectStepInput {
  fieldMap: PortalFieldMap;
  root?: ParentNode;
}

export type StepDetection =
  | { status: "known"; step: PortalStep }
  | { status: "unknown"; reason: "no_landmark_resolved" | "ambiguous_landmarks" | "no_steps_configured" };

/**
 * Detect which configured step the page is currently on, via each step's
 * `landmark` selector (resolved through the same tiered resolver as field
 * bindings). If no landmark resolves, OR more than one resolves
 * simultaneously, the navigator reports "step unknown" rather than guessing
 * — it never advances from an unknown state.
 */
export function detectCurrentStep(input: DetectStepInput): StepDetection {
  const root = input.root ?? document;
  if (input.fieldMap.steps.length === 0) {
    return { status: "unknown", reason: "no_steps_configured" };
  }

  const resolved: PortalStep[] = [];
  for (const step of input.fieldMap.steps) {
    if (!step.landmark) continue;
    const el = resolve(step.landmark, root);
    if (el !== UNRESOLVED) resolved.push(step);
  }

  if (resolved.length === 0) return { status: "unknown", reason: "no_landmark_resolved" };
  if (resolved.length > 1) return { status: "unknown", reason: "ambiguous_landmarks" };
  return { status: "known", step: resolved[0]! };
}

export type AdvanceOutcome =
  | { advanced: true }
  | {
      advanced: false;
      reason:
        | "no_current_step"
        | "terminal_step"
        | "no_advance_control_resolved"
        | "blocked_by_submit_guard";
    };

/**
 * Advance from the current step to the next, per spec §4.2/§4.4:
 *  1. Detect the current step (landmark). Unknown ⇒ refuse to advance.
 *  2. Terminal boundary — the current step's `order` is the max configured
 *     `order` ⇒ refuse (this IS the last step; never auto-advance past it).
 *  3. Resolve a candidate control from the config `advanceControls`
 *     allowlist. The FIRST one that resolves is the candidate.
 *  4. Run it through the submit-guard denylist — UNCONDITIONALLY, regardless
 *     of it being in the allowlist. A match ⇒ refuse (`blocked_by_submit_guard`),
 *     surfacing the terminal boundary; NEVER click it.
 *  5. Clean ⇒ click it. (The caller re-runs `detectCurrentStep` afterward —
 *     this function does not, since portals may load the next step
 *     asynchronously.)
 *
 * This function performs a REAL click and must only ever be invoked in
 * direct response to a user gesture (the popup's "Go to next section"
 * button) — never on a timer, a mutation observer, or page load.
 */
export function advanceToNextStep(fieldMap: PortalFieldMap, root: ParentNode = document): AdvanceOutcome {
  const detection = detectCurrentStep({ fieldMap, root });
  if (detection.status !== "known") return { advanced: false, reason: "no_current_step" };

  const maxOrder = Math.max(...fieldMap.steps.map((s) => s.order));
  if (detection.step.order >= maxOrder) {
    return { advanced: false, reason: "terminal_step" };
  }

  for (const strategy of fieldMap.advanceControls) {
    const el = resolve(strategy, root);
    if (el === UNRESOLVED) continue;

    // Submit-guard ALWAYS wins, unconditionally — even for a control drawn
    // from the config allowlist (INV-1).
    if (isForbiddenControl(el)) {
      return { advanced: false, reason: "blocked_by_submit_guard" };
    }

    if (el instanceof HTMLElement) el.click();
    return { advanced: true };
  }

  return { advanced: false, reason: "no_advance_control_resolved" };
}

/** True iff the given step is the last enumerated step (terminal boundary, spec §4.4). */
export function isTerminalStep(fieldMap: PortalFieldMap, step: PortalStep): boolean {
  if (fieldMap.steps.length === 0) return true;
  const maxOrder = Math.max(...fieldMap.steps.map((s) => s.order));
  return step.order >= maxOrder;
}
