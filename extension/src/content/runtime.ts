import { resolvePortalForUrl } from "../config";
import { runFill, type RunFillOutput } from "./fillEngine";
import { detectCurrentStep, advanceToNextStep, type StepDetection, type AdvanceOutcome } from "./navigator";
import type { AssembledPackage } from "../lib/contracts/package";

/**
 * Per-portal content-script entry point (declared per portal in
 * `manifest.config.ts`). Runs in an ISOLATED WORLD (spec §3.1): a separate JS
 * heap from the portal page, sharing only the DOM. This file's ONLY
 * interaction with the page is: read DOM, write DOM values, dispatch DOM
 * events, read back DOM values — never evaluating page-supplied strings, and
 * NEVER making a network call (INV-7; enforced by ESLint + the static-scan
 * test, since this file lives under `src/content/**`).
 *
 * This script performs NO action on its own initiative. It only responds to
 * messages sent by the popup in direct response to a user gesture (INV-1's
 * "user-initiated advance", spec §4.2). It never fills or navigates on page
 * load, on a timer, or via a mutation observer.
 */

const LAST_WRITTEN_STORAGE_KEY = "grantedFillState";

type ContentMessage =
  | { type: "GET_PORTAL_STATUS" }
  | { type: "FILL_STEP"; pkg: AssembledPackage; stepId: string }
  | { type: "ADVANCE_STEP" };

type PortalStatusResponse =
  | { ok: true; portalId: string; displayName: string; step: StepDetection }
  | { ok: false; reason: "no_portal_config_for_url" };

type FillStepResponse = { ok: true; result: RunFillOutput } | { ok: false; reason: "no_portal_config_for_url" };

type AdvanceStepResponse =
  | { ok: true; outcome: AdvanceOutcome }
  | { ok: false; reason: "no_portal_config_for_url" };

async function readLastWritten(): Promise<Record<string, string>> {
  const stored = await chrome.storage.session.get(LAST_WRITTEN_STORAGE_KEY);
  const value = stored[LAST_WRITTEN_STORAGE_KEY];
  return value && typeof value === "object" ? (value as Record<string, string>) : {};
}

async function writeLastWritten(lastWritten: Record<string, string>): Promise<void> {
  await chrome.storage.session.set({ [LAST_WRITTEN_STORAGE_KEY]: lastWritten });
}

async function handleMessage(
  message: ContentMessage,
): Promise<PortalStatusResponse | FillStepResponse | AdvanceStepResponse> {
  const fieldMap = resolvePortalForUrl(window.location.href);

  if (message.type === "GET_PORTAL_STATUS") {
    if (!fieldMap) return { ok: false, reason: "no_portal_config_for_url" };
    return {
      ok: true,
      portalId: fieldMap.portalId,
      displayName: fieldMap.displayName,
      step: detectCurrentStep({ fieldMap }),
    };
  }

  if (message.type === "FILL_STEP") {
    if (!fieldMap) return { ok: false, reason: "no_portal_config_for_url" };
    const lastWritten = await readLastWritten();
    const output = runFill({ fieldMap, stepId: message.stepId, pkg: message.pkg, lastWritten });
    await writeLastWritten(output.lastWritten);
    return { ok: true, result: output };
  }

  if (message.type === "ADVANCE_STEP") {
    if (!fieldMap) return { ok: false, reason: "no_portal_config_for_url" };
    return { ok: true, outcome: advanceToNextStep(fieldMap) };
  }

  // Exhaustiveness guard — an unrecognized message type is ignored, never guessed at.
  return { ok: false, reason: "no_portal_config_for_url" };
}

chrome.runtime.onMessage.addListener((message: ContentMessage, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true; // keep the message channel open for the async response
});
