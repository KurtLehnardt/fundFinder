"use client";

import { useEffect, useRef, useState } from "react";
import {
  getAutoApplyRequirements,
  setAutoApplyRequirements,
  type AutoApplyRequirements,
} from "@/lib/mockAuth";
import { useAuth } from "@/components/AuthProvider";
import { useBilling } from "@/components/BillingProvider";
import { useDialogA11y } from "@/components/useDialogA11y";
import { useEntitlements } from "@/lib/entitlements/useEntitlements";

/**
 * R6 — assisted-apply DEMO flow (behind the default-off `r6_auto_apply` flag).
 *
 * A single, walkable modal stepper that shows founders what pre-approval for
 * assisted application actually requires:
 *   1. Sign in (R9)      — the same sign-in gate the rest of the app uses.
 *   2. Requirements      — record the four SAM.gov facts + a satisfied/not
 *                          checklist; "Submit for approval" is disabled until
 *                          all four are satisfied.
 *   3. Admin review      — an honest "pending" screen. Nothing was submitted.
 *
 * This is a PREVIEW / STUB, and it is honest about it (R7.7 / §11):
 *   - It NEVER submits an application, and says so on every step.
 *   - No payment is taken, no stats are invented, no guarantee or federal
 *     affiliation is implied.
 *   - "Pro" is framing only, via the client-only `useEntitlements` stub, which
 *     gates NOTHING server-side. The walkthrough proceeds regardless.
 *
 * Reuse note: the four-fact editor is the SAME form as SettingsPanel, reused
 * INLINE here rather than by rendering <SettingsPanel/> nested. SettingsPanel
 * is itself a full dialog with its own `useDialogA11y` focus-trap + `aria-modal`
 * backdrop; mounting it inside this dialog would put two simultaneous focus
 * traps and two `aria-modal` dialogs over the same document (Esc/Tab handlers
 * would fight, and Esc in Settings would tear down the whole flow). The app
 * never stacks two dialogs — AutoApplyModal closes itself before opening
 * Settings. So per the task's sanctioned escape hatch we keep ONE dialog and
 * one focus trap, reading/writing the same `getAutoApplyRequirements` /
 * `setAutoApplyRequirements` from lib/mockAuth.ts that SettingsPanel uses.
 */

type Step = "signin" | "requirements" | "review";
type RequirementKey = "sam" | "uei" | "aor" | "ebiz";

const REQUIREMENTS: Array<{ key: RequirementKey; label: string; detail: string }> = [
  {
    key: "sam",
    label: "Active SAM.gov registration",
    detail: "The federal government's vendor registry — most awards can't be paid out without it.",
  },
  {
    key: "uei",
    label: "UEI (Unique Entity Identifier)",
    detail: "Your organization's federal ID number, issued when you register in SAM.gov.",
  },
  {
    key: "aor",
    label: "Authorized AOR (Authorized Organization Representative)",
    detail: "The person SAM.gov has on file as allowed to submit and sign applications for your organization.",
  },
  {
    key: "ebiz",
    label: "E-Biz POC delegation",
    detail:
      "Your Electronic Business Point of Contact has delegated AOR authority in SAM.gov — required before an AOR can act.",
  },
];

const STEP_ORDER: Step[] = ["signin", "requirements", "review"];

export default function AutoApplyFlow({ onClose }: { onClose: () => void }) {
  // Design revamp: USWDS 60/30/10 restyle is the DEFAULT on this A/B branch
  // (previously gated behind r7_design).
  const design = true;
  const { user, signIn } = useAuth();
  // Pro *framing* only — this gates nothing and entitles nothing (see the stub).
  // Source the tier from the reactive BillingProvider context (single source of
  // truth) so this framing stays in lockstep with the OpportunityCard padlocks.
  const { tier: billingTier } = useBilling();
  const entitlements = useEntitlements(billingTier);

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  useDialogA11y(dialogRef, onClose, closeBtnRef);

  // Already-signed-in users skip straight to the requirements step.
  const [step, setStep] = useState<Step>(user ? "requirements" : "signin");
  const [form, setForm] = useState<AutoApplyRequirements>(() => getAutoApplyRequirements());
  const [saved, setSaved] = useState(false);

  // Auto-advance past sign-in as soon as a user is present. For the mock this
  // is instant (signIn resolves synchronously); for real Supabase auth the
  // browser leaves for Google and returns via /auth/callback — on return a
  // signed-in user resumes past this step.
  useEffect(() => {
    if (user && step === "signin") setStep("requirements");
  }, [user, step]);

  const satisfied: Record<RequirementKey, boolean> = {
    sam: form.samRegistered,
    uei: form.uei.trim().length > 0,
    aor: form.aorOnFile || form.aorName.trim().length > 0,
    ebiz: form.eBizPocOnFile,
  };
  const allSatisfied = satisfied.sam && satisfied.uei && satisfied.aor && satisfied.ebiz;

  function update<K extends keyof AutoApplyRequirements>(key: K, value: AutoApplyRequirements[K]) {
    setSaved(false);
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSaveRequirements(e: React.FormEvent) {
    e.preventDefault();
    // Device-local only (lib/mockAuth.ts) — never sent to a server.
    setAutoApplyRequirements(form);
    setSaved(true);
  }

  function handleSubmitForApproval() {
    // Persist the self-reported facts locally, then show the honest "pending"
    // screen. This DOES NOT submit an application anywhere.
    setAutoApplyRequirements(form);
    setStep("review");
  }

  const stepIndex = STEP_ORDER.indexOf(step);

  /* ---- Shared dual-className tokens (mirrors AutoApplyModal / SettingsPanel) ---- */

  const panelClass = design
    ? "relative max-h-[85vh] w-full max-w-lg overflow-y-auto border border-structure-on-canvas bg-canvas p-6 text-foreground"
    : "relative max-h-[85vh] w-full max-w-lg overflow-y-auto border border-rule bg-white p-6 text-ink";

  const eyebrowClass = design
    ? "font-mono text-[11px] uppercase tracking-eyebrow text-structure-on-canvas"
    : "eyebrow";

  const titleClass = design
    ? "mt-2 font-display text-[24px] font-bold leading-snug text-foreground"
    : "mt-2 font-display text-[24px] font-bold leading-snug";

  const bodyClass = design
    ? "mt-3 font-body text-[14px] leading-relaxed text-foreground"
    : "mt-3 font-body text-[14px] leading-relaxed text-slate-550";

  const metClass = design ? "text-structure-on-canvas" : "text-fit-strong";
  const mutedClass = design ? "text-foreground" : "text-slate-550";

  const reqLabelClass = design
    ? "font-body text-[13px] font-medium text-foreground"
    : "font-body text-[13px] font-medium text-ink";
  const reqStatusClass = design
    ? "font-body text-[13px] font-normal text-foreground"
    : "font-body text-[13px] font-normal text-slate-550";
  const reqDetailClass = design
    ? "mt-0.5 font-body text-[12px] leading-relaxed text-foreground"
    : "mt-0.5 font-body text-[12px] leading-relaxed text-slate-550";

  const stepDotClass = design
    ? "font-mono text-[11px] uppercase tracking-eyebrow text-foreground"
    : "font-mono text-[11px] uppercase tracking-eyebrow text-slate-550";
  const stepDotActiveClass = design
    ? "font-mono text-[11px] uppercase tracking-eyebrow text-structure-on-canvas"
    : "font-mono text-[11px] uppercase tracking-eyebrow text-federal";

  const legendClass = design
    ? "font-mono text-[11px] uppercase tracking-eyebrow text-foreground"
    : "font-mono text-[11px] uppercase tracking-eyebrow text-slate-550";

  const fieldWrapClass = design
    ? "mt-5 border-t border-structure-on-canvas pt-4 first:mt-4 first:border-t-0 first:pt-0"
    : "mt-5 border-t border-rule pt-4 first:mt-4 first:border-t-0 first:pt-0";

  const inputClass = design
    ? "mt-1.5 w-full rounded-sm border border-structure-on-canvas bg-canvas px-2.5 py-1.5 font-body text-[13px] text-foreground"
    : "mt-1.5 w-full rounded-sm border border-rule bg-white px-2.5 py-1.5 font-body text-[13px] text-ink";

  const labelTextClass = design ? "font-body text-[13px] text-foreground" : "font-body text-[13px] text-ink";

  const primaryBtnClass = design
    ? "rounded-sm bg-action px-4 py-2 font-mono text-[11px] uppercase tracking-eyebrow text-token-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-structure-on-canvas focus-visible:ring-offset-2"
    : "rounded-sm bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-eyebrow text-paper transition hover:bg-federal disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-federal focus-visible:ring-offset-2";

  const secondaryBtnClass = design
    ? "rounded-sm border border-structure-on-canvas px-4 py-2 font-mono text-[11px] uppercase tracking-eyebrow text-structure-on-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-structure-on-canvas focus-visible:ring-offset-2"
    : "rounded-sm border border-federal px-4 py-2 font-mono text-[11px] uppercase tracking-eyebrow text-federal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-federal focus-visible:ring-offset-2";

  const closeTextBtnClass = design
    ? "font-mono text-[11px] uppercase tracking-eyebrow text-foreground underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-structure-on-canvas focus-visible:ring-offset-2"
    : "font-mono text-[11px] uppercase tracking-eyebrow text-slate-550 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-federal focus-visible:ring-offset-2";

  const closeIconBtnClass = design
    ? "absolute right-4 top-4 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-structure-on-canvas focus-visible:ring-offset-2"
    : "absolute right-4 top-4 text-slate-550 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-federal focus-visible:ring-offset-2";

  const savedMsgClass = design
    ? "font-mono text-[11px] uppercase tracking-eyebrow text-structure-on-canvas"
    : "font-mono text-[11px] uppercase tracking-eyebrow text-fit-strong";

  const footnoteClass = design
    ? "mt-6 border-t border-structure-on-canvas pt-4 font-body text-[11px] leading-relaxed text-foreground"
    : "mt-6 border-t border-rule pt-4 font-body text-[11px] leading-relaxed text-slate-550";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auto-apply-flow-title"
        aria-describedby="auto-apply-flow-desc"
        className={panelClass}
        onClick={(e) => e.stopPropagation()}
      >
        <button ref={closeBtnRef} type="button" onClick={onClose} aria-label="Close" className={closeIconBtnClass}>
          <XIcon className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2 pr-8">
          <LockIcon className="h-3.5 w-3.5" design={design} />
          <p className={eyebrowClass}>
            {entitlements.isPro ? "Pro feature" : "Pro feature preview"} &middot; nothing is submitted
          </p>
        </div>

        <h2 id="auto-apply-flow-title" className={titleClass}>
          Assisted application
        </h2>

        {/* Step indicator — three labelled steps; the current one is emphasized. */}
        <ol className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
          {STEP_ORDER.map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <span
                className={i === stepIndex ? stepDotActiveClass : stepDotClass}
                aria-current={i === stepIndex ? "step" : undefined}
              >
                {i + 1}. {STEP_LABEL[s]}
              </span>
              {i < STEP_ORDER.length - 1 && (
                <span className={stepDotClass} aria-hidden="true">
                  &rarr;
                </span>
              )}
            </li>
          ))}
        </ol>

        {step === "signin" && (
          <div>
            <p id="auto-apply-flow-desc" className={bodyClass}>
              Assisted application is a Pro feature we&rsquo;re building toward. This is a preview so
              you can see what it would need before it could act on your behalf — starting with
              signing in. Nothing is submitted anywhere, and no payment is collected.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <button type="button" onClick={() => signIn()} className={primaryBtnClass}>
                Continue with Google
              </button>
              <button type="button" onClick={onClose} className={closeTextBtnClass}>
                Close
              </button>
            </div>
          </div>
        )}

        {step === "requirements" && (
          <div>
            <p id="auto-apply-flow-desc" className={bodyClass}>
              Here&rsquo;s what assisted application would need on file before it could act for you.
              Record what&rsquo;s true below (stored on this device only) — everything has to be in
              place before you can submit for approval. Nothing here submits an application.
            </p>

            <ul className="mt-4 space-y-3">
              {REQUIREMENTS.map((r) => (
                <li key={r.key} className="flex gap-3">
                  <span className={satisfied[r.key] ? metClass : mutedClass} aria-hidden="true">
                    {satisfied[r.key] ? "✓" : "○"}
                  </span>
                  <span className="min-w-0">
                    <span className={reqLabelClass}>
                      {r.label}{" "}
                      <span className={reqStatusClass}>
                        {satisfied[r.key] ? "(satisfied)" : "(not yet)"}
                      </span>
                    </span>
                    <span className={`block ${reqDetailClass}`}>{r.detail}</span>
                  </span>
                </li>
              ))}
            </ul>

            {/* Same four facts as SettingsPanel, reused inline (see header note). */}
            <form onSubmit={handleSaveRequirements}>
              <fieldset className={fieldWrapClass}>
                <legend className={legendClass}>Active SAM.gov registration</legend>
                <div className="mt-2 flex items-center gap-4">
                  <label className={`flex items-center gap-1.5 ${labelTextClass}`}>
                    <input
                      type="radio"
                      name="flow-samRegistered"
                      checked={form.samRegistered === true}
                      onChange={() => update("samRegistered", true)}
                    />
                    Yes
                  </label>
                  <label className={`flex items-center gap-1.5 ${labelTextClass}`}>
                    <input
                      type="radio"
                      name="flow-samRegistered"
                      checked={form.samRegistered === false}
                      onChange={() => update("samRegistered", false)}
                    />
                    No
                  </label>
                </div>
                {form.samRegistered && (
                  <label className={`mt-2 block ${labelTextClass}`}>
                    Registration date (optional)
                    <input
                      type="date"
                      value={form.samRegisteredDate}
                      onChange={(e) => update("samRegisteredDate", e.target.value)}
                      className={inputClass}
                    />
                  </label>
                )}
              </fieldset>

              <div className={fieldWrapClass}>
                <label className={legendClass} htmlFor="flow-uei">
                  UEI (Unique Entity Identifier)
                </label>
                <input
                  id="flow-uei"
                  type="text"
                  value={form.uei}
                  onChange={(e) => update("uei", e.target.value)}
                  placeholder="e.g. ABC123DEF456"
                  className={inputClass}
                />
              </div>

              <fieldset className={fieldWrapClass}>
                <legend className={legendClass}>Authorized AOR</legend>
                <label className={`mt-2 block ${labelTextClass}`} htmlFor="flow-aor-name">
                  Name
                  <input
                    id="flow-aor-name"
                    type="text"
                    value={form.aorName}
                    onChange={(e) => update("aorName", e.target.value)}
                    placeholder="Who's authorized to sign for your org"
                    className={inputClass}
                  />
                </label>
                <label className={`mt-2 flex items-center gap-2 ${labelTextClass}`}>
                  <input
                    type="checkbox"
                    checked={form.aorOnFile}
                    onChange={(e) => update("aorOnFile", e.target.checked)}
                  />
                  Confirm on file with SAM.gov
                </label>
              </fieldset>

              <fieldset className={fieldWrapClass}>
                <legend className={legendClass}>E-Biz POC delegation</legend>
                <label className={`mt-2 flex items-center gap-2 ${labelTextClass}`}>
                  <input
                    type="checkbox"
                    checked={form.eBizPocOnFile}
                    onChange={(e) => update("eBizPocOnFile", e.target.checked)}
                  />
                  Confirm the Electronic Business POC has delegated AOR authority
                </label>
              </fieldset>

              <div className="mt-6 flex flex-wrap items-center gap-4">
                <button type="submit" className={secondaryBtnClass}>
                  Save
                </button>
                <span aria-live="polite" className={savedMsgClass}>
                  {saved ? "Saved" : ""}
                </span>
              </div>
            </form>

            <div className="mt-6 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={handleSubmitForApproval}
                disabled={!allSatisfied}
                aria-disabled={!allSatisfied}
                className={primaryBtnClass}
              >
                Submit for approval
              </button>
              <button type="button" onClick={onClose} className={closeTextBtnClass}>
                Close
              </button>
            </div>
            {!allSatisfied && (
              <p className={`mt-2 ${reqDetailClass}`}>
                All four requirements must be satisfied before you can submit for approval.
              </p>
            )}
          </div>
        )}

        {step === "review" && (
          <div>
            <p className={`mt-4 font-display text-[18px] font-bold leading-snug ${design ? "text-foreground" : "text-ink"}`}>
              Admin review required prior to granting auto-apply approval.
            </p>
            <p id="auto-apply-flow-desc" className={bodyClass}>
              That&rsquo;s the end of this preview. To be clear about what just happened: nothing was
              submitted to SAM.gov or any grant portal, no application was filed, and no payment was
              taken. Your answers stayed on this device. Assisted application isn&rsquo;t live yet —
              when it is, approval would still be reviewed by a person first.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <button type="button" onClick={onClose} className={secondaryBtnClass}>
                Close
              </button>
            </div>
          </div>
        )}

        <p className={footnoteClass}>
          This is a preview of a Pro feature, not a purchase — no payment is collected, no
          application is ever submitted, and nothing here implies a guarantee or any federal
          government affiliation.
        </p>
      </div>
    </div>
  );
}

const STEP_LABEL: Record<Step, string> = {
  signin: "Sign in",
  requirements: "Requirements",
  review: "Admin review",
};

function LockIcon({ className, design }: { className?: string; design: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${className ?? ""} ${design ? "text-structure-on-canvas" : "text-slate-550"}`.trim()}
      aria-hidden="true"
    >
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
