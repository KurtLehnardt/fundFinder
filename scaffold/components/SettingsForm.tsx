"use client";

import { useState } from "react";
import { isFlagEnabled } from "@/lib/flags";
import {
  getAutoApplyRequirements,
  setAutoApplyRequirements,
  type AutoApplyRequirements,
} from "@/lib/mockAuth";

/**
 * SettingsForm.tsx — the auto-apply requirements form body, extracted from
 * SettingsPanel (FE-06) so it can be reused verbatim by BOTH the existing
 * Settings modal and the FE-07 left-sidebar's Settings section.
 *
 * Presentational + self-contained: it owns its own form state and persists to
 * localStorage via lib/mockAuth (getAutoApplyRequirements / setAutoApplyRequirements)
 * exactly as before — nothing here is sent anywhere, and "Delete my data"
 * clears it with everything else.
 *
 * `onClose` is optional: the modal passes it so the "Close" text button renders
 * in the button row (keeping SettingsPanel's markup identical); the sidebar
 * section omits it (there is nothing to close — it's an inline section).
 */
export default function SettingsForm({ onClose }: { onClose?: () => void }) {
  const design = isFlagEnabled("r7_design");

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
        {onClose && (
          <button type="button" onClick={onClose} className={closeTextBtnClass}>
            Close
          </button>
        )}
        <span aria-live="polite" className={savedMsgClass}>
          {savedAt ? "Saved" : ""}
        </span>
      </div>
    </form>
  );
}
