"use client";

import { useRef, useState } from "react";
import { isFlagEnabled } from "@/lib/flags";
import {
  getAutoApplyRequirements,
  setAutoApplyRequirements,
  type AutoApplyRequirements,
} from "@/lib/mockAuth";
import { useDialogA11y } from "@/components/useDialogA11y";

/**
 * FE-06 — Settings panel, reached via the hamburger menu (AppMenu.tsx) or the
 * Auto Apply modal's "Add these in Settings" link. Holds the "Auto-apply
 * requirements" form: the same SAM.gov/UEI/AOR/E-Biz POC facts the (stubbed)
 * Auto Apply feature and R8.1 eligibility screening both care about.
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

  const [form, setForm] = useState<AutoApplyRequirements>(() => getAutoApplyRequirements());
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setAutoApplyRequirements(form);
    setSavedAt(Date.now());
  }

  function update<K extends keyof AutoApplyRequirements>(key: K, value: AutoApplyRequirements[K]) {
    setSavedAt(null);
    setForm((prev) => ({ ...prev, [key]: value }));
  }

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

  const closeIconBtnClass = design
    ? "absolute right-4 top-4 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-structure-on-canvas focus-visible:ring-offset-2"
    : "absolute right-4 top-4 text-slate-550 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-federal focus-visible:ring-offset-2";

  const saveBtnClass = design
    ? "rounded-sm border border-structure-on-canvas px-4 py-2 font-mono text-[11px] uppercase tracking-eyebrow text-structure-on-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-structure-on-canvas focus-visible:ring-offset-2"
    : "rounded-sm border border-federal px-4 py-2 font-mono text-[11px] uppercase tracking-eyebrow text-federal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-federal focus-visible:ring-offset-2";

  const closeTextBtnClass = design
    ? "font-mono text-[11px] uppercase tracking-eyebrow text-foreground underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-structure-on-canvas focus-visible:ring-offset-2"
    : "font-mono text-[11px] uppercase tracking-eyebrow text-slate-550 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-federal focus-visible:ring-offset-2";

  const savedMsgClass = design
    ? "font-mono text-[11px] uppercase tracking-eyebrow text-structure-on-canvas"
    : "font-mono text-[11px] uppercase tracking-eyebrow text-fit-strong";

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

        <form onSubmit={handleSave}>
          <fieldset className={fieldWrapClass}>
            <legend className={legendClass}>Active SAM.gov registration</legend>
            <div className="mt-2 flex items-center gap-4">
              <label className={`flex items-center gap-1.5 ${labelTextClass}`}>
                <input
                  type="radio"
                  name="samRegistered"
                  checked={form.samRegistered === true}
                  onChange={() => update("samRegistered", true)}
                />
                Yes
              </label>
              <label className={`flex items-center gap-1.5 ${labelTextClass}`}>
                <input
                  type="radio"
                  name="samRegistered"
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
            <label className={legendClass} htmlFor="settings-uei">
              UEI (Unique Entity Identifier)
            </label>
            <input
              id="settings-uei"
              type="text"
              value={form.uei}
              onChange={(e) => update("uei", e.target.value)}
              placeholder="e.g. ABC123DEF456"
              className={inputClass}
            />
          </div>

          <fieldset className={fieldWrapClass}>
            <legend className={legendClass}>Authorized AOR</legend>
            <label className={`mt-2 block ${labelTextClass}`} htmlFor="settings-aor-name">
              Name
              <input
                id="settings-aor-name"
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
            <button type="submit" className={saveBtnClass}>
              Save
            </button>
            <button type="button" onClick={onClose} className={closeTextBtnClass}>
              Close
            </button>
            <span aria-live="polite" className={savedMsgClass}>
              {savedAt ? "Saved" : ""}
            </span>
          </div>
        </form>
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
