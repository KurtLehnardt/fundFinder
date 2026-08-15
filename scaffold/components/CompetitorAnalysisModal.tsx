"use client";

import { useRef } from "react";
import { useDialogA11y } from "@/components/useDialogA11y";

/**
 * PRO-01 — Pro-upsell stub shown when someone clicks the locked "Analyze
 * competing companies" button in an opportunity card's award-history
 * section. Competitor analysis (R5) doesn't exist yet; this is honest
 * about that and doesn't take payment, invent stats, or claim a
 * guarantee/federal affiliation (R7.7 / §11). Mirrors AutoApplyModal.tsx's
 * structure and a11y pattern (FE-06).
 */

export default function CompetitorAnalysisModal({ onClose }: { onClose: () => void }) {
  // Design revamp: USWDS 60/30/10 restyle is the DEFAULT on this A/B branch
  // (previously gated behind r7_design).
  const design = true;
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  useDialogA11y(dialogRef, onClose, closeBtnRef);

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

  const closeTextBtnClass = design
    ? "font-mono text-[11px] uppercase tracking-eyebrow text-foreground underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-structure-on-canvas focus-visible:ring-offset-2"
    : "font-mono text-[11px] uppercase tracking-eyebrow text-slate-550 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-federal focus-visible:ring-offset-2";

  const closeIconBtnClass = design
    ? "absolute right-4 top-4 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-structure-on-canvas focus-visible:ring-offset-2"
    : "absolute right-4 top-4 text-slate-550 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-federal focus-visible:ring-offset-2";

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
        aria-labelledby="competitor-analysis-modal-title"
        aria-describedby="competitor-analysis-modal-desc"
        className={panelClass}
        onClick={(e) => e.stopPropagation()}
      >
        <button ref={closeBtnRef} type="button" onClick={onClose} aria-label="Close" className={closeIconBtnClass}>
          <XIcon className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2 pr-8">
          <LockIcon className="h-3.5 w-3.5" design={design} />
          <p className={eyebrowClass}>Pro feature &middot; not available yet</p>
        </div>

        <h2 id="competitor-analysis-modal-title" className={titleClass}>
          Analyze competing companies
        </h2>

        <p id="competitor-analysis-modal-desc" className={bodyClass}>
          Competitor analysis would summarize which companies won similar awards and how your
          organization's profile compares to them. We haven't built that yet, so nothing is
          analyzed here today — this screen doesn't look anything up, and it doesn't invent
          numbers about your competition.
        </p>

        <p className={bodyClass}>
          When it ships, it will be part of a Pro plan we're building toward. It won't guarantee
          you an award, and it doesn't imply any endorsement or affiliation with the funding
          agency or the federal government.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button type="button" onClick={onClose} className={closeTextBtnClass}>
            Close
          </button>
        </div>

        <p className={footnoteClass}>
          This is a preview, not a purchase — no payment is collected and no analysis is ever run
          from this screen.
        </p>
      </div>
    </div>
  );
}

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
