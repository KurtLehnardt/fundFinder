"use client";

import { useRef } from "react";
import { isFlagEnabled } from "@/lib/flags";
import { useDialogA11y } from "@/components/useDialogA11y";
import SettingsForm from "@/components/SettingsForm";

/**
 * FE-06 — Settings panel, reached via the hamburger menu (AppMenu.tsx) or the
 * Auto Apply modal's "Add these in Settings" link. Holds the "Auto-apply
 * requirements" form: the same SAM.gov/UEI/AOR/E-Biz POC facts the (stubbed)
 * Auto Apply feature and R8.1 eligibility screening both care about.
 *
 * FE-07 — the form body itself now lives in the reusable <SettingsForm/>
 * (shared with the left-sidebar's Settings section). This dialog is unchanged:
 * it renders the same eyebrow/title/note + close chrome and the same form
 * inside, with the "Close" button preserved by passing `onClose` through.
 *
 * Persisted to localStorage only (lib/mockAuth.ts) — nothing here is sent
 * anywhere, and PLT-01's "Delete my data" clears it along with everything
 * else, since it lives under the same STORAGE_KEYS map.
 */
export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const design = isFlagEnabled("r7_design");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  useDialogA11y(dialogRef, onClose, closeBtnRef);

  const panelClass = design
    ? "relative max-h-[85vh] w-full max-w-md overflow-y-auto border border-structure-on-canvas bg-canvas p-6 text-foreground"
    : "relative max-h-[85vh] w-full max-w-md overflow-y-auto border border-rule bg-white p-6 text-ink";

  const eyebrowClass = design
    ? "font-mono text-[11px] uppercase tracking-eyebrow text-structure-on-canvas"
    : "eyebrow";

  const titleClass = design
    ? "mt-2 font-display text-[22px] font-bold leading-snug text-foreground"
    : "mt-2 font-display text-[22px] font-bold leading-snug";

  const noteClass = design
    ? "mt-2 font-body text-[12px] leading-relaxed text-foreground"
    : "mt-2 font-body text-[12px] leading-relaxed text-slate-550";

  const closeIconBtnClass = design
    ? "absolute right-4 top-4 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-structure-on-canvas focus-visible:ring-offset-2"
    : "absolute right-4 top-4 text-slate-550 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-federal focus-visible:ring-offset-2";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-panel-title"
        className={panelClass}
        onClick={(e) => e.stopPropagation()}
      >
        <button ref={closeBtnRef} type="button" onClick={onClose} aria-label="Close" className={closeIconBtnClass}>
          <XIcon className="h-4 w-4" />
        </button>

        <p className={eyebrowClass}>Settings</p>
        <h2 id="settings-panel-title" className={titleClass}>
          Auto-apply requirements
        </h2>
        <p className={noteClass}>
          These values are stored on this device only (your browser's local storage) — never sent
          to a server. Recording them here doesn't submit anything or turn Auto Apply on; it just
          lets the Auto Apply preview show what's already in place.
        </p>

        <SettingsForm onClose={onClose} />
      </div>
    </div>
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
