"use client";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import {
  PROFILE_FIELD_META,
  PROFILE_FIELD_META_BY_KEY,
  MATERIAL_PROFILE_FIELDS,
  isFieldProvided,
  CompanyProfileSchema,
  type CompanyProfile,
  type ProfileFieldMeta,
} from "@/lib/contracts/companyProfile";
import type { Provenance, Provenanced } from "@/lib/contracts/primitives";
import type { StartupProfile } from "@/lib/types";
import { readJSON, writeJSON } from "@/lib/localStore";

/**
 * B1b — ProfileQuestionnaire: the structured, gap-first intake form.
 *
 * Replaces the free-text box as the PRIMARY way founders give FundFinder the
 * 13 B1a profile fields (`PROFILE_FIELD_META`, `lib/contracts/companyProfile.ts`)
 * — 5 required + 8 optional-but-material, required first, then progressive
 * disclosure of the material fields once required is complete (or the founder
 * opts in early).
 *
 * THE CORE GUARANTEE ("never re-ask a provided field"): a field the profile
 * already provides (`isFieldProvided`) NEVER renders as an input — it renders
 * as a read-only summary row with an explicit "Edit" affordance. This is true
 * whether the value came from the founder typing it, from a restored
 * localStorage draft, or from the free-text AUTOFILL below. A fully-filled
 * profile therefore has ZERO gaps left to ask about; the caller uses the
 * `complete` flag on `onSubmit` to skip the R1 AI interview entirely for that
 * case (see components/IntakeForm.tsx).
 *
 * AUTOFILL: a founder can still paste free text. It POSTs to
 * `/api/extract-profile` (a thin wrapper around the live pipeline's
 * `extractProfile`, `lib/claude.ts`) and maps the result onto these same 13
 * fields at `model_inferred` provenance — never silently overwriting a
 * `user_stated`/`verified` fact already on the form (mirrors the
 * never-overwrite guard in `lib/interview/mergeAnswers.ts`). The founder then
 * confirms/edits each pre-filled field like any other.
 *
 * PERSISTENCE (§5.3 — localStorage-only, no server retention): the whole
 * draft profile lives in `localStorage` via `lib/localStore.ts` and is never
 * sent anywhere except folded into the plain description string handed to
 * `/api/match` when the founder submits — exactly like today's free-text flow.
 *
 * GAP-DETECTION NOTE: `computeGaps` below intentionally reimplements
 * `lib/interview/generateQuestions.ts`'s `detectGaps` (same two atoms:
 * `MATERIAL_PROFILE_FIELDS` + `isFieldProvided`) rather than importing it.
 * `generateQuestions.ts` imports the OpenAI SDK at module scope for its own
 * server-only call; a "use client" component must not pull a *runtime*
 * binding from that module or the SDK ships in the client bundle (see the
 * identical type-only-import guard in `components/IntakeForm.tsx`). The
 * reused logic is the two atoms themselves, both pure/client-safe.
 */

const STORAGE_KEY = "ff.questionnaire.profile.v1";

/** The in-progress draft: a subset of `CompanyProfile`'s provenanced cells. */
type ProfileDraft = Partial<CompanyProfile>;

const PROFILE_SHAPE = CompanyProfileSchema.shape as Record<string, z.ZodTypeAny>;

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing — no React, no network).
// ---------------------------------------------------------------------------

/** The material fields (required + material) still missing from `profile`. */
export function computeGaps(profile: ProfileDraft): ProfileFieldMeta[] {
  return MATERIAL_PROFILE_FIELDS.filter((m) => !isFieldProvided(profile, m.field));
}

/**
 * Compile the filled fields into a plain description string: the founder's
 * own `raw_text` verbatim, then one "Label: value" line per other provided
 * field. Mirrors `lib/interview/mergeAnswers.ts`'s `buildEnrichedDescription`
 * shape so the existing `/api/match` + gap-detection heuristics downstream see
 * the same kind of text they already handle.
 */
export function buildDescriptionFromProfile(profile: ProfileDraft): string {
  const rawText = (profile.raw_text?.value ?? "").trim();
  const bag = profile as Record<string, { value?: unknown } | undefined>;
  const lines: string[] = [];
  for (const m of PROFILE_FIELD_META) {
    if (m.field === "raw_text") continue;
    if (!isFieldProvided(profile, m.field)) continue;
    const raw = bag[m.field]?.value;
    const rendered = Array.isArray(raw) ? raw.join(", ") : String(raw);
    lines.push(`${m.label}: ${rendered}`);
  }
  if (lines.length === 0) return rawText;
  return [rawText, "", "Additional details:", ...lines].join("\n");
}

/** Map the v1 `StartupProfile` extraction result onto the 13 B1a field keys. */
export function mapStartupProfileToValues(sp: StartupProfile): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (field: string, v: string | number | undefined | null) => {
    if (v === undefined || v === null) return;
    const s = String(v).trim();
    if (s.length > 0) out[field] = s;
  };
  put("raw_text", sp.description);
  put("industry", sp.industry);
  put("technology", sp.technology);
  put("location", sp.location);
  put("use_of_funds", sp.useOfFunds);
  if (typeof sp.employees === "number" && Number.isFinite(sp.employees) && sp.employees >= 0) {
    put("employee_count", String(Math.round(sp.employees)));
  }
  put("revenue", sp.revenue);
  put("funding_stage", sp.fundingStage);
  put("capital_raised", sp.capitalRaised);
  put("rd_activities", sp.rdActivities);
  put("product_maturity", sp.productMaturity);
  put("target_customers", sp.targetCustomers);
  put("capital_requirement", sp.capitalRequirement);
  return out;
}

function coerceRaw(meta: ProfileFieldMeta, trimmed: string): unknown {
  if (meta.inputType === "integer") {
    const n = Number(trimmed);
    return Number.isFinite(n) ? Math.round(n) : undefined;
  }
  return trimmed;
}

/**
 * Whether an incoming write of `incoming` provenance may replace a field
 * currently holding `existing` provenance. Mirrors the never-overwrite guard
 * in `lib/interview/mergeAnswers.ts`: a `model_inferred` autofill guess may
 * never clobber a `user_stated`/`verified` fact the founder already gave.
 */
function canWriteProvenance(existing: Provenance | undefined, incoming: Provenance): boolean {
  if (existing === undefined) return true;
  if (incoming === "user_stated" || incoming === "verified") return true;
  return existing === "model_inferred";
}

/**
 * Build the provenanced cell `field` should hold for a raw form value, or
 * `null` when the write is uncoercible, invalid against the real contract
 * schema, or blocked by `canWriteProvenance`. Pure — the caller decides what
 * to do with `null` (typically: leave the existing value alone).
 */
export function computeFieldCell(
  meta: ProfileFieldMeta,
  rawValue: string,
  provenance: Provenance,
  existing: { provenance: Provenance } | undefined,
): Provenanced<unknown> | null {
  const trimmed = rawValue.trim();
  if (trimmed.length === 0) return null;
  if (!canWriteProvenance(existing?.provenance, provenance)) return null;
  const coerced = coerceRaw(meta, trimmed);
  if (coerced === undefined) return null;
  const shape = PROFILE_SHAPE[meta.field];
  if (!shape) return null;
  const candidate = {
    value: coerced,
    provenance,
    confidence: provenance === "user_stated" || provenance === "verified" ? 1 : 0.6,
  };
  const res = shape.safeParse(candidate);
  return res.success ? (res.data as Provenanced<unknown>) : null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface ProfileQuestionnaireProps {
  /** Disables every input/button — e.g. while a search is already running. */
  disabled?: boolean;
  /** Seed/re-seed the description field from outside (e.g. the sidebar
   *  drawer's "Use this" action). Bump `externalNonce` to force a re-seed
   *  even when the text is identical to what's already there. */
  externalText?: string;
  externalNonce?: number;
  /** Fires whenever the compiled description changes, so the parent can
   *  mirror it for its own checks (sample-replace confirm, "Try again"). */
  onDescriptionChange?: (text: string) => void;
  /** Fires when the founder submits. `complete` is true iff every required +
   *  material field (all 13) is provided — the parent uses this to skip the
   *  R1 AI interview entirely (a fully-filled form asks zero questions). */
  onSubmit: (description: string, meta: { complete: boolean }) => void;
  /** Dual-styling toggle, matching the rest of the app's components. */
  design?: boolean;
}

export default function ProfileQuestionnaire({
  disabled = false,
  externalText,
  externalNonce,
  onDescriptionChange,
  onSubmit,
  design = true,
}: ProfileQuestionnaireProps) {
  const [profile, setProfile] = useState<ProfileDraft>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [editingFields, setEditingFields] = useState<Set<string>>(new Set());
  const [showOptional, setShowOptional] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate the draft from localStorage once, client-only (readJSON no-ops
  // during SSR and returns the fallback).
  useEffect(() => {
    const stored = readJSON<ProfileDraft>(STORAGE_KEY, {});
    if (stored && Object.keys(stored).length > 0) setProfile(stored);
    setHydrated(true);
  }, []);

  // Persist on every change — but only after hydration, so the initial empty
  // state never races the read above and clobbers a real stored draft.
  useEffect(() => {
    if (!hydrated) return;
    writeJSON(STORAGE_KEY, profile);
  }, [profile, hydrated]);

  function commitField(field: string, rawValue: string, provenance: Provenance) {
    setValues((v) => ({ ...v, [field]: rawValue }));
    const meta = PROFILE_FIELD_META_BY_KEY[field];
    if (!meta) return;
    setProfile((prev) => {
      const bag = prev as Record<string, Provenanced<unknown> | undefined>;
      const existing = bag[field];
      const trimmed = rawValue.trim();
      if (trimmed.length === 0) {
        if (existing === undefined) return prev;
        const next = { ...bag };
        delete next[field];
        return next as ProfileDraft;
      }
      const cell = computeFieldCell(meta, rawValue, provenance, existing);
      if (!cell) return prev;
      return { ...prev, [field]: cell } as ProfileDraft;
    });
  }

  // Bubble the compiled description up on every profile change so the parent
  // can mirror it (sample-replace confirm, "Try again" fallback).
  useEffect(() => {
    onDescriptionChange?.(buildDescriptionFromProfile(profile));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // An explicit external action (e.g. "Use this" in the sidebar) always wins:
  // re-seed the description at user_stated provenance.
  useEffect(() => {
    if (externalNonce === undefined) return;
    if (externalText === undefined || externalText.trim().length === 0) return;
    commitField("raw_text", externalText, "user_stated");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalNonce]);

  const gaps = useMemo(() => computeGaps(profile), [profile]);
  const requiredGaps = useMemo(() => gaps.filter((g) => g.requirement === "required"), [gaps]);
  const isComplete = gaps.length === 0;
  const canSubmit = requiredGaps.length === 0;

  // Progressive disclosure: once every required field is in, open the
  // optional section automatically (still opt-out-able via the toggle below
  // isn't needed — nothing forces the founder to fill it; "Find opportunities"
  // is already enabled at this point).
  useEffect(() => {
    if (requiredGaps.length === 0) setShowOptional(true);
  }, [requiredGaps.length]);

  function draftFor(field: string): string {
    if (field in values) return values[field] ?? "";
    const bag = profile as Record<string, { value?: unknown } | undefined>;
    const value = bag[field]?.value;
    if (value === undefined || value === null) return "";
    return Array.isArray(value) ? value.join(", ") : String(value);
  }

  function startEdit(field: string) {
    setEditingFields((prev) => {
      const next = new Set(prev);
      next.add(field);
      return next;
    });
  }
  function stopEdit(field: string) {
    setEditingFields((prev) => {
      if (!prev.has(field)) return prev;
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  }

  async function runAutofill() {
    const text = pasteText.trim();
    if (text.length < 20) {
      setExtractError("Add a bit more detail before autofilling — a sentence or two is enough.");
      return;
    }
    setExtracting(true);
    setExtractError(null);
    try {
      const res = await fetch("/api/extract-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: text }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setExtractError(j?.error ?? "Autofill didn't work — you can still fill the form by hand.");
        return;
      }
      // The pasted text itself is user_stated (they wrote it); everything the
      // extractor derived from it is model_inferred until confirmed/edited.
      commitField("raw_text", text, "user_stated");
      const sp = j?.profile as StartupProfile | null | undefined;
      if (sp) {
        const mapped = mapStartupProfileToValues(sp);
        for (const [field, value] of Object.entries(mapped)) {
          if (field === "raw_text") continue;
          commitField(field, value, "model_inferred");
        }
      }
      setPasteOpen(false);
      setPasteText("");
    } catch {
      setExtractError("Autofill didn't work — you can still fill the form by hand.");
    } finally {
      setExtracting(false);
    }
  }

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit(buildDescriptionFromProfile(profile), { complete: isComplete });
  }

  function clearSaved() {
    setProfile({});
    setValues({});
    setEditingFields(new Set());
    setShowOptional(false);
    writeJSON(STORAGE_KEY, {});
  }

  // ---- styling: dual-class design-token / v1 pattern, matching
  // PreSearchInterview.tsx / IntakeForm.tsx exactly (same tokens, no new hex). ----

  const sectionHeadingClass = design
    ? "block font-mono text-[11px] uppercase tracking-eyebrow text-structure-on-canvas"
    : "eyebrow block";

  const introClass = design
    ? "mt-1 text-pretty font-body text-[13px] leading-relaxed text-foreground"
    : "mt-1 font-body text-[13px] leading-relaxed text-slate-550";

  const fieldWrapClass = "flex flex-col";

  const fieldLabelClass = design
    ? "mb-1 block font-mono text-[11px] uppercase tracking-eyebrow text-structure-on-canvas"
    : "mb-1 block font-mono text-[11px] uppercase tracking-eyebrow text-slate-550";

  const textareaBigClass = design
    ? "w-full resize-none rounded-sm border border-structure-on-canvas bg-canvas-alt p-4 font-body text-[15px] leading-relaxed text-foreground outline-none focus:border-structure-on-canvas focus:ring-2 focus:ring-structure-on-canvas disabled:cursor-not-allowed disabled:opacity-60"
    : "w-full resize-none rounded-sm border border-rule bg-white p-4 font-body text-[15px] leading-relaxed outline-none focus:border-federal focus:ring-2 focus:ring-federal/15 disabled:cursor-not-allowed disabled:opacity-60";

  const textareaSmallClass = design
    ? "w-full resize-none rounded-sm border border-structure-on-canvas bg-canvas-alt px-3 py-2 font-body text-[14px] leading-relaxed text-foreground outline-none focus:ring-2 focus:ring-structure-on-canvas disabled:cursor-not-allowed disabled:opacity-60"
    : "w-full resize-none rounded-sm border border-rule bg-white px-3 py-2 font-body text-[14px] leading-relaxed outline-none focus:border-federal focus:ring-2 focus:ring-federal/15 disabled:cursor-not-allowed disabled:opacity-60";

  const textInputClass = design
    ? "w-full rounded-sm border border-structure-on-canvas bg-canvas-alt px-3 py-2 font-body text-[14px] text-foreground outline-none focus:ring-2 focus:ring-structure-on-canvas disabled:cursor-not-allowed disabled:opacity-60"
    : "w-full rounded-sm border border-rule bg-white px-3 py-2 font-body text-[14px] text-ink outline-none focus:border-federal focus:ring-2 focus:ring-federal/15 disabled:cursor-not-allowed disabled:opacity-60";

  const selectClass = textInputClass;

  const radioLabelClass = design
    ? "flex cursor-pointer items-center gap-2 font-body text-[14px] text-foreground"
    : "flex cursor-pointer items-center gap-2 font-body text-[14px] text-ink";

  const radioInputClass = design ? "h-4 w-4 shrink-0 accent-structure" : "h-4 w-4 shrink-0 accent-federal";

  const providedRowClass = design
    ? "flex items-start justify-between gap-3 rounded-sm bg-canvas-alt px-3 py-2"
    : "flex items-start justify-between gap-3 rounded-sm border border-rule bg-white px-3 py-2";

  const providedLabelClass = design
    ? "block font-mono text-[11px] uppercase tracking-eyebrow text-structure-on-canvas"
    : "block font-mono text-[11px] uppercase tracking-eyebrow text-slate-550";

  const providedValueClass = design
    ? "mt-0.5 text-pretty font-body text-[14px] leading-relaxed text-foreground"
    : "mt-0.5 font-body text-[14px] leading-relaxed text-ink";

  const editButtonClass = design
    ? "shrink-0 font-mono text-[11px] uppercase tracking-eyebrow text-structure-on-canvas underline decoration-dotted underline-offset-2 transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-structure-on-canvas focus-visible:ring-offset-2"
    : "shrink-0 font-mono text-[11px] uppercase tracking-eyebrow text-federal underline decoration-dotted underline-offset-2 disabled:cursor-not-allowed disabled:opacity-40";

  const primaryButtonClass = design
    ? "min-h-[44px] rounded-sm bg-action px-5 py-2.5 font-mono text-[12px] uppercase tracking-eyebrow text-token-white shadow-sm transition hover:opacity-90 hover:shadow active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-structure-on-canvas focus-visible:ring-offset-2"
    : "min-h-[44px] rounded-sm bg-ink px-5 py-2.5 font-mono text-[12px] uppercase tracking-eyebrow text-paper transition hover:bg-federal disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-federal focus-visible:ring-offset-2";

  const secondaryButtonClass = design
    ? "min-h-[44px] rounded-sm border border-structure-on-canvas bg-canvas-alt px-4 py-2.5 font-mono text-[12px] uppercase tracking-eyebrow text-structure-on-canvas transition hover:bg-structure hover:text-token-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-structure-on-canvas focus-visible:ring-offset-2"
    : "min-h-[44px] rounded-sm border border-rule bg-white px-4 py-2.5 font-mono text-[12px] uppercase tracking-eyebrow text-slate-550 transition hover:border-federal hover:text-federal disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-federal focus-visible:ring-offset-2";

  const hintTextClass = design
    ? "font-mono text-[11px] uppercase tracking-eyebrow text-structure-on-canvas"
    : "font-mono text-[11px] uppercase tracking-eyebrow text-slate-550";

  // CON-02: `error` is a fill/border-only semantic role — never bare inline
  // text color (that pairing fails AA and is explicitly flagged "DO NOT USE"
  // in scripts/design/contrast-check.mjs's advisory table). The message text
  // stays `text-foreground` (AA-safe); the left border carries the "this is
  // an error" signal instead, same pattern as IntakeForm.tsx's errorClass.
  const errorTextClass = design
    ? "border-l-2 border-error pl-2 text-pretty font-body text-[12px] leading-relaxed text-foreground"
    : "border-l-2 border-fit-adjacent pl-2 font-body text-[12px] leading-relaxed text-ink";

  const clearLinkClass = design
    ? "font-mono text-[11px] uppercase tracking-eyebrow text-foreground underline decoration-dotted underline-offset-2 transition hover:text-structure-on-canvas disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-structure-on-canvas focus-visible:ring-offset-2"
    : "font-mono text-[11px] uppercase tracking-eyebrow text-slate-550 underline decoration-dotted underline-offset-2 disabled:cursor-not-allowed disabled:opacity-40";

  const pasteTriggerClass = secondaryButtonClass;

  const pastePanelClass = design
    ? "mt-3 rounded-lg bg-canvas-alt p-4 shadow-card"
    : "mt-3 rounded-sm border border-rule bg-white p-4";

  // ---- field rendering ----

  function renderField(meta: ProfileFieldMeta) {
    const provided = isFieldProvided(profile, meta.field) && !editingFields.has(meta.field);

    if (provided) {
      const bag = profile as Record<string, { value: unknown }>;
      const raw = bag[meta.field].value;
      const display = Array.isArray(raw) ? raw.join(", ") : String(raw);
      return (
        <div key={meta.field} className={providedRowClass}>
          <div className="min-w-0">
            <span className={providedLabelClass}>{meta.label}</span>
            <p className={providedValueClass}>{display}</p>
          </div>
          <button
            type="button"
            onClick={() => startEdit(meta.field)}
            className={editButtonClass}
            disabled={disabled}
          >
            Edit
          </button>
        </div>
      );
    }

    const value = draftFor(meta.field);

    if (meta.inputType === "single_select" || meta.inputType === "range_select") {
      return (
        <div key={meta.field} className={fieldWrapClass}>
          <label htmlFor={`pq-${meta.field}`} className={fieldLabelClass}>
            {meta.label}
          </label>
          <select
            id={`pq-${meta.field}`}
            value={value}
            disabled={disabled}
            onChange={(e) => {
              commitField(meta.field, e.target.value, "user_stated");
              stopEdit(meta.field);
            }}
            className={selectClass}
          >
            <option value="">Select…</option>
            {meta.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (meta.inputType === "integer") {
      return (
        <div key={meta.field} className={fieldWrapClass}>
          <label htmlFor={`pq-${meta.field}`} className={fieldLabelClass}>
            {meta.label}
          </label>
          <input
            id={`pq-${meta.field}`}
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={value}
            disabled={disabled}
            onChange={(e) => setValues((v) => ({ ...v, [meta.field]: e.target.value }))}
            onBlur={(e) => {
              commitField(meta.field, e.target.value, "user_stated");
              stopEdit(meta.field);
            }}
            className={textInputClass}
          />
        </div>
      );
    }

    if (meta.inputType === "boolean_text") {
      const choiceKey = `${meta.field}__choice`;
      const detailKey = `${meta.field}__detail`;
      const choice = values[choiceKey] ?? "";
      const detail = values[detailKey] ?? "";
      const commitBooleanText = (nextChoice: string, nextDetail: string) => {
        const combined =
          nextChoice === "Yes" ? (nextDetail.trim() ? `Yes — ${nextDetail.trim()}` : "Yes") : nextChoice === "No" ? "No" : "";
        commitField(meta.field, combined, "user_stated");
        if (combined.length > 0) stopEdit(meta.field);
      };
      return (
        <div key={meta.field} className={fieldWrapClass}>
          <span className={fieldLabelClass}>{meta.label}</span>
          <div className="mt-1 flex gap-4">
            {["Yes", "No"].map((opt) => (
              <label key={opt} className={radioLabelClass}>
                <input
                  type="radio"
                  name={`pq-${meta.field}`}
                  checked={choice === opt}
                  disabled={disabled}
                  onChange={() => {
                    setValues((v) => ({ ...v, [choiceKey]: opt }));
                    commitBooleanText(opt, detail);
                  }}
                  className={radioInputClass}
                />
                {opt}
              </label>
            ))}
          </div>
          {choice === "Yes" && (
            <input
              type="text"
              placeholder="Briefly describe (optional)"
              value={detail}
              disabled={disabled}
              onChange={(e) => setValues((v) => ({ ...v, [detailKey]: e.target.value }))}
              onBlur={(e) => commitBooleanText("Yes", e.target.value)}
              className={`${textInputClass} mt-2`}
            />
          )}
        </div>
      );
    }

    // free_text: raw_text, industry, technology, location, use_of_funds, target_customers
    const isBig = meta.field === "raw_text";
    return (
      <div key={meta.field} className={fieldWrapClass}>
        <label htmlFor={`pq-${meta.field}`} className={fieldLabelClass}>
          {meta.label}
        </label>
        <textarea
          id={`pq-${meta.field}`}
          rows={isBig ? 5 : 2}
          value={value}
          disabled={disabled}
          placeholder={isBig ? "What you build, who it's for, and how much you need." : undefined}
          onChange={(e) => setValues((v) => ({ ...v, [meta.field]: e.target.value }))}
          onBlur={(e) => {
            commitField(meta.field, e.target.value, "user_stated");
            if (e.target.value.trim().length > 0) stopEdit(meta.field);
          }}
          className={isBig ? textareaBigClass : textareaSmallClass}
        />
      </div>
    );
  }

  const requiredFields = PROFILE_FIELD_META.filter((m) => m.requirement === "required");
  const materialFields = PROFILE_FIELD_META.filter((m) => m.requirement === "material");

  return (
    <div>
      {/* Free-text AUTOFILL — a secondary affordance behind a visual break,
          same posture as IntakeForm's sample-company picker. */}
      <div>
        <button
          type="button"
          onClick={() => setPasteOpen((o) => !o)}
          aria-expanded={pasteOpen}
          disabled={disabled}
          className={pasteTriggerClass}
        >
          {pasteOpen ? "Hide paste box" : "Paste a description to autofill"}
        </button>

        {pasteOpen && (
          <div className={pastePanelClass}>
            <label htmlFor="pq-paste" className={fieldLabelClass}>
              Paste your company description
            </label>
            <textarea
              id="pq-paste"
              rows={4}
              value={pasteText}
              disabled={disabled || extracting}
              onChange={(e) => setPasteText(e.target.value)}
              className={`${textareaBigClass} mt-1`}
            />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={runAutofill}
                disabled={disabled || extracting || pasteText.trim().length < 20}
                className={secondaryButtonClass}
              >
                {extracting ? "Reading…" : "Autofill fields"}
              </button>
              {extractError && <span className={errorTextClass}>{extractError}</span>}
            </div>
          </div>
        )}
      </div>

      {/* Required fields — the search needs these to route at all. */}
      <div className="mt-5">
        <span className={sectionHeadingClass}>Tell us about your company</span>
        <div className="mt-3 flex flex-col gap-4">{requiredFields.map(renderField)}</div>
      </div>

      {/* Optional-but-material fields — progressive disclosure: revealed once
          the required set is complete, or on demand via the toggle. */}
      <div className="mt-5 border-t border-structure-on-canvas pt-4">
        {!showOptional ? (
          <button
            type="button"
            onClick={() => setShowOptional(true)}
            disabled={disabled}
            className={secondaryButtonClass}
          >
            + Add optional details (improves matches)
          </button>
        ) : (
          <div>
            <span className={sectionHeadingClass}>A few more details (optional)</span>
            <p className={introClass}>
              None of these are required — but each one changes which programs match.
            </p>
            <div className="mt-3 flex flex-col gap-4">{materialFields.map(renderField)}</div>
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" onClick={handleSubmit} disabled={disabled || !canSubmit} className={primaryButtonClass}>
          Find opportunities
        </button>
        {requiredGaps.length > 0 && (
          <span className={hintTextClass}>
            {requiredGaps.length} required field{requiredGaps.length === 1 ? "" : "s"} left
          </span>
        )}
        <button type="button" onClick={clearSaved} disabled={disabled} className={clearLinkClass}>
          Clear saved answers
        </button>
      </div>
    </div>
  );
}
