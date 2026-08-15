"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDialogA11y } from "@/components/useDialogA11y";
import { useBilling } from "@/components/BillingProvider";
import { useEntitlements } from "@/lib/entitlements/useEntitlements";
import CompetitorResults from "@/components/CompetitorResults";
import demoCompetitorFixture from "@/data/demo-competitor-fastercontrol.json";

/**
 * R5 (PRO-01) — Competitor & Grant Intelligence, Max-gated + demo-first.
 *
 * Evolves the old "not built yet" stub into the real demoable slice. Gating
 * reads the UNIFIED billing interface (Phase-4 #41): the reactive tier from
 * `useBilling()` is passed into `useEntitlements(tier)`, so this modal never
 * introduces a second source of truth and stays in sync with the OpportunityCard
 * padlocks and the sidebar billing selector.
 *
 *   - Non-Max (competitorEnabled === false): a "Maximum plan" padlock + honest
 *     description, a primary "Upgrade to Max" (flips the labeled MOCK billing
 *     tier — charges nothing), and a secondary "Demo this" that renders the
 *     captured example.
 *   - Max (competitorEnabled === true): a primary "View example analysis". The
 *     LIVE personalized run is a named follow-up (/api/competitors); for now
 *     both tiers see the SAME real example fixture, honestly labeled as such.
 *
 * The example itself (CompetitorResults) is built from REAL public federal award
 * data captured once (scripts/5-competitors.mjs) and is validated through the
 * grounding contract at its boundary. It is never presented as a live run and
 * never fabricates an award or amount (R7.7).
 *
 * Portaled to document.body so the fixed overlay escapes the opportunity card's
 * stacking/overflow context (matching AutoApplyModal); `useDialogA11y` inerts the
 * background and traps focus. Top-aligned + scrollable for the taller results view.
 */
export default function CompetitorAnalysisModal({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  useDialogA11y(dialogRef, onClose, closeBtnRef);

  // Unified billing (Phase-4 #41): reactive tier -> entitlement view.
  const { tier, setTier } = useBilling();
  const { competitorEnabled } = useEntitlements(tier);
  const isMax = competitorEnabled; // competitor_intelligence is a Max-only feature.

  const [showResults, setShowResults] = useState(false);

  const panelClass = `relative max-h-[calc(100dvh-4rem)] w-full ${
    showResults ? "max-w-3xl" : "max-w-lg"
  } overflow-y-auto rounded-lg border border-structure-on-canvas bg-canvas p-6 text-foreground shadow-overlay`;

  const eyebrowClass = "font-mono text-[11px] uppercase tracking-eyebrow text-structure-on-canvas";
  const titleClass = "mt-2 text-balance font-display text-[24px] font-bold leading-snug text-foreground";
  const bodyClass = "mt-3 text-pretty font-body text-[14px] leading-relaxed text-foreground";
  const closeIconBtnClass =
    "absolute right-3 top-3 rounded-sm p-1 text-foreground transition hover:bg-canvas-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-structure-on-canvas focus-visible:ring-offset-2";
  const footnoteClass =
    "mt-6 border-t border-structure-on-canvas pt-4 text-pretty font-body text-[11px] leading-relaxed text-foreground";

  // Green bg-action is reserved for the ONE primary CTA (R7 60/30/10).
  const primaryBtnClass =
    "inline-flex min-h-[44px] items-center rounded-sm bg-action px-4 py-2 font-mono text-[11px] uppercase tracking-eyebrow text-token-white transition hover:opacity-90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-structure-on-canvas focus-visible:ring-offset-2";
  const secondaryBtnClass =
    "inline-flex min-h-[44px] items-center rounded-sm border border-structure-on-canvas px-4 py-2 font-mono text-[11px] uppercase tracking-eyebrow text-structure-on-canvas transition hover:bg-structure hover:text-token-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-structure-on-canvas focus-visible:ring-offset-2";
  const textBtnClass =
    "inline-flex min-h-[44px] items-center font-mono text-[11px] uppercase tracking-eyebrow text-foreground underline underline-offset-4 transition hover:text-structure-on-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-structure-on-canvas focus-visible:ring-offset-2";

  const recordCount = Array.isArray((demoCompetitorFixture as { records?: unknown[] }).records)
    ? (demoCompetitorFixture as { records: unknown[] }).records.length
    : 0;

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-8 sm:items-center"
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

        {showResults ? (
          <div className="pr-6">
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={() => setShowResults(false)} className={textBtnClass}>
                ‹ Back
              </button>
            </div>
            <h2 id="competitor-analysis-modal-title" className="sr-only">
              Competitor &amp; grant intelligence — example analysis
            </h2>
            <p id="competitor-analysis-modal-desc" className="sr-only">
              An example competitor and grant analysis built from real public federal award data.
            </p>
            <div className="mt-3">
              <CompetitorResults raw={demoCompetitorFixture} />
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 pr-8">
              <LockIcon className="h-3.5 w-3.5" />
              <p className={eyebrowClass}>{isMax ? "Maximum plan · included" : "Maximum plan"}</p>
            </div>

            <h2 id="competitor-analysis-modal-title" className={titleClass}>
              Competitor &amp; grant intelligence
            </h2>

            <p id="competitor-analysis-modal-desc" className={bodyClass}>
              Find companies that won federal funding in your space, see how they described themselves
              to win, and get tailored, cited recommendations for what to emphasize. Every company and
              dollar amount comes from public federal award records (USAspending, NIH RePORTER, NSF) —
              nothing is invented, and each one links back to its official source so you can verify it.
            </p>

            {isMax ? (
              <p className={bodyClass}>
                Live, personalized analysis of your own company is coming soon. In the meantime, here
                is a saved example built from {recordCount} real public award records — clearly labeled
                as an example, not a live run.
              </p>
            ) : (
              <p className={bodyClass}>
                This is part of the <strong>Maximum</strong> plan. You can preview exactly what it
                produces right now with a saved example — no upgrade, no charge, no live call.
              </p>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              {isMax ? (
                <button type="button" onClick={() => setShowResults(true)} className={primaryBtnClass}>
                  View example analysis
                </button>
              ) : (
                <>
                  <button type="button" onClick={() => setTier("max")} className={primaryBtnClass}>
                    Upgrade to Max
                  </button>
                  <button type="button" onClick={() => setShowResults(true)} className={secondaryBtnClass}>
                    Demo this
                  </button>
                </>
              )}
              <button type="button" onClick={onClose} className={textBtnClass}>
                Close
              </button>
            </div>

            <p className={footnoteClass}>
              {isMax
                ? "This screen runs no live analysis and submits nothing. The example uses real, public award data captured once."
                : "“Upgrade to Max” selects a labeled demo billing tier — it collects no payment and syncs nowhere. It doesn’t imply any endorsement or affiliation with a funding agency or the federal government."}
            </p>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${className ?? ""} text-structure-on-canvas`.trim()}
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
