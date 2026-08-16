import { describe, expect, test, beforeEach } from "vitest";
import { detectCurrentStep, advanceToNextStep, isTerminalStep } from "../src/content/navigator";
import type { PortalFieldMap } from "../src/config/schema";

beforeEach(() => {
  document.body.innerHTML = "";
});

function twoStepFieldMap(advanceLabel = "Save & Continue"): PortalFieldMap {
  return {
    portalId: "grants_gov",
    displayName: "Test Portal",
    urlMatch: ["https://example.test/*"],
    steps: [
      { stepId: "page1", title: "Page 1", order: 0, landmark: { labelText: "Application for Federal Assistance" } },
      { stepId: "page2", title: "Page 2", order: 1, landmark: { labelText: "Estimated Funding" } },
    ],
    advanceControls: [{ labelText: advanceLabel }],
    fields: [],
  };
}

describe("detectCurrentStep", () => {
  test("resolves the step whose landmark is present", () => {
    document.body.innerHTML = "<h2>Application for Federal Assistance</h2>";
    const detection = detectCurrentStep({ fieldMap: twoStepFieldMap() });
    expect(detection.status).toBe("known");
    if (detection.status === "known") expect(detection.step.stepId).toBe("page1");
  });

  test("reports unknown when no landmark resolves", () => {
    document.body.innerHTML = "<div>Nothing recognizable</div>";
    const detection = detectCurrentStep({ fieldMap: twoStepFieldMap() });
    expect(detection).toEqual({ status: "unknown", reason: "no_landmark_resolved" });
  });

  test("reports unknown (ambiguous) when more than one landmark resolves simultaneously", () => {
    document.body.innerHTML = "<h2>Application for Federal Assistance</h2><h2>Estimated Funding</h2>";
    const detection = detectCurrentStep({ fieldMap: twoStepFieldMap() });
    expect(detection).toEqual({ status: "unknown", reason: "ambiguous_landmarks" });
  });

  test("reports unknown when the config has no steps at all (e.g. nih_assist seed)", () => {
    const empty: PortalFieldMap = {
      portalId: "nih_assist",
      displayName: "x",
      urlMatch: [],
      steps: [],
      advanceControls: [],
      fields: [],
    };
    expect(detectCurrentStep({ fieldMap: empty })).toEqual({ status: "unknown", reason: "no_steps_configured" });
  });
});

describe("advanceToNextStep — user-initiated, submit-guard always wins (INV-1)", () => {
  test("clicks a clean advance control and reports advanced:true", () => {
    document.body.innerHTML = '<h2>Application for Federal Assistance</h2><button id="btn">Save & Continue</button>';
    let clicked = false;
    document.getElementById("btn")!.addEventListener("click", () => (clicked = true));

    const outcome = advanceToNextStep(twoStepFieldMap());
    expect(outcome).toEqual({ advanced: true });
    expect(clicked).toBe(true);
  });

  test("NEVER clicks a control matching the submit-guard denylist, even if it is the configured advanceControls entry", () => {
    document.body.innerHTML = '<h2>Application for Federal Assistance</h2><button id="btn">Sign and Submit</button>';
    let clicked = false;
    document.getElementById("btn")!.addEventListener("click", () => (clicked = true));

    const outcome = advanceToNextStep(twoStepFieldMap("Sign and Submit"));
    expect(outcome).toEqual({ advanced: false, reason: "blocked_by_submit_guard" });
    expect(clicked).toBe(false);
  });

  test("refuses to advance when the current step cannot be detected", () => {
    document.body.innerHTML = "<div>unrelated content</div>";
    const outcome = advanceToNextStep(twoStepFieldMap());
    expect(outcome).toEqual({ advanced: false, reason: "no_current_step" });
  });

  test("refuses to advance past the LAST enumerated step (terminal boundary, spec §4.4)", () => {
    document.body.innerHTML = '<h2>Estimated Funding</h2><button>Save & Continue</button>';
    const outcome = advanceToNextStep(twoStepFieldMap());
    expect(outcome).toEqual({ advanced: false, reason: "terminal_step" });
  });

  test("the final step is never auto-advanced even if a (mis-scoped) advance control were resolvable", () => {
    document.body.innerHTML = '<h2>Estimated Funding</h2><button id="btn">Save & Continue</button>';
    let clicked = false;
    document.getElementById("btn")!.addEventListener("click", () => (clicked = true));
    advanceToNextStep(twoStepFieldMap());
    expect(clicked).toBe(false);
  });

  test("reports no_advance_control_resolved when the allowlisted control isn't present on the page", () => {
    document.body.innerHTML = "<h2>Application for Federal Assistance</h2>";
    const outcome = advanceToNextStep(twoStepFieldMap());
    expect(outcome).toEqual({ advanced: false, reason: "no_advance_control_resolved" });
  });
});

describe("isTerminalStep", () => {
  test("true for the step with the max configured order", () => {
    const fm = twoStepFieldMap();
    expect(isTerminalStep(fm, fm.steps[1]!)).toBe(true);
    expect(isTerminalStep(fm, fm.steps[0]!)).toBe(false);
  });

  test("true (vacuously) when there are no steps configured", () => {
    const empty: PortalFieldMap = { portalId: "nih_assist", displayName: "x", urlMatch: [], steps: [], advanceControls: [], fields: [] };
    expect(isTerminalStep(empty, { stepId: "x", title: "x", order: 0 })).toBe(true);
  });
});
