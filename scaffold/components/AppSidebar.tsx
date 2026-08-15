"use client";

/**
 * AppSidebar.tsx — FE-07 left slide-out drawer (claude.ai-style), gated behind
 * the default-OFF `left_sidebar` flag (the trigger lives in AppMenu). Replaces
 * the old hamburger dropdown.
 *
 * Everything here is LOCAL-ONLY (localStorage) and gates/charges NOTHING. The
 * billing section is an explicitly-labeled MOCK with no real payment (§11); the
 * auto-apply / competitor previews it unlocks remain honest previews that submit
 * nothing (§5.3 — no server retention).
 *
 * Accessibility reuses useDialogA11y (focus trap + Esc + scroll-lock +
 * return-focus). The slide-in is a CSS transform transition; the global
 * prefers-reduced-motion rule in globals.css disables it, and no drawer state is
 * ever conveyed by motion alone. Token-styled throughout (dual-class `design`
 * pattern), no raw hex.
 */

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useBilling } from "@/components/BillingProvider";
import { useSearchDraft } from "@/components/SearchDraftProvider";
import { useDialogA11y } from "@/components/useDialogA11y";
import SettingsForm from "@/components/SettingsForm";
import { clearAllLocalData } from "@/lib/mockAuth";
import { BILLING_TIERS, type BillingTier } from "@/lib/billing/mockBilling";
import {
  getGrants,
  addGrant,
  setGrantStatus,
  removeGrant,
  type Grant,
  type GrantStatus,
} from "@/lib/grants/grantsStore";
import {
  getDescriptions,
  createDescription,
  renameDescription,
  deleteDescription,
  saveVersion,
  setActiveVersion,
  type CompanyDescription,
} from "@/lib/descriptions/descriptionsStore";

type SectionId = "settings" | "grants" | "descriptions" | "account" | "billing";

const STATUS_LABEL: Record<GrantStatus, string> = {
  unapplied: "Unapplied for",
  pending: "Pending",
  granted: "Granted",
};
const STATUS_ORDER: GrantStatus[] = ["unapplied", "pending", "granted"];

export default function AppSidebar({ onClose }: { onClose: () => void }) {
  // Design revamp: CON-02 60/30/10 tokens are the default look; darkMode is
  // "media", so these tokens flip automatically and the drawer honors system
  // dark mode. (v1 fallback branches are retained but unreachable.)
  const design = true;
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  useDialogA11y(dialogRef, onClose, closeBtnRef);

  const { user, signOut, setConsent } = useAuth();
  const { tier, setTier } = useBilling();
  const { requestSearchDraft } = useSearchDraft();

  // Slide-in: start off-screen, flip after mount so the transform transitions.
  const [mounted, setMounted] = useState(false);
  const [openSection, setOpenSection] = useState<SectionId>("settings");

  // Local stores (SSR-safe: start empty, hydrate after mount).
  const [grants, setGrants] = useState<Grant[]>([]);
  const [descriptions, setDescriptions] = useState<CompanyDescription[]>([]);

  const [newGrantTitle, setNewGrantTitle] = useState("");
  const [newDescName, setNewDescName] = useState("");
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState("");
  const [versionDrafts, setVersionDrafts] = useState<Record<string, string>>({});

  const [confirming, setConfirming] = useState<null | "delete" | "close">(null);
  const [justCleared, setJustCleared] = useState(false);

  useEffect(() => {
    setMounted(true);
    setGrants(getGrants());
    setDescriptions(getDescriptions());
  }, []);

  // ---- handlers -----------------------------------------------------------
  function toggleSection(id: SectionId) {
    setOpenSection((cur) => (cur === id ? cur : id));
  }

  function handleAddGrant(e: React.FormEvent) {
    e.preventDefault();
    if (newGrantTitle.trim().length === 0) return;
    setGrants(addGrant(newGrantTitle));
    setNewGrantTitle("");
  }

  function handleCreateDescription(e: React.FormEvent) {
    e.preventDefault();
    if (newDescName.trim().length === 0) return;
    setDescriptions(createDescription(newDescName));
    setNewDescName("");
  }

  function handleSaveVersion(descId: string) {
    const draft = versionDrafts[descId] ?? "";
    if (draft.trim().length === 0) return;
    setDescriptions(saveVersion(descId, draft));
    setVersionDrafts((prev) => ({ ...prev, [descId]: "" }));
  }

  function handleRestore(descId: string, versionId: string, text: string) {
    setDescriptions(setActiveVersion(descId, versionId));
    // Bring the version's text back into that description's editor.
    setVersionDrafts((prev) => ({ ...prev, [descId]: text }));
  }

  function handleUseThis(text: string) {
    requestSearchDraft(text);
    onClose();
  }

  function resetLocalStateAfterClear() {
    setGrants([]);
    setDescriptions([]);
    setVersionDrafts({});
    setTier("free");
    signOut();
    setConsent(false);
    setConfirming(null);
  }

  function handleDeleteMyData() {
    clearAllLocalData();
    resetLocalStateAfterClear();
    setJustCleared(true);
  }

  function handleCloseAccount() {
    clearAllLocalData();
    resetLocalStateAfterClear();
    setJustCleared(true);
  }

  // ---- class helpers (dual-class `design` pattern) ------------------------
  const backdropClass = "absolute inset-0 bg-black/60";

  const panelBase =
    "relative z-10 flex h-full w-full flex-col overflow-y-auto transition-transform duration-200 ease-out sm:max-w-[320px]";
  const panelSkin = design
    ? "border-r border-structure-on-canvas bg-canvas text-foreground shadow-overlay"
    : "border-r border-rule bg-white text-ink shadow-overlay";
  const panelClass = `${panelBase} ${panelSkin} ${mounted ? "translate-x-0" : "-translate-x-full"}`;

  const headerClass = design
    ? "sticky top-0 z-10 flex items-center justify-between border-b border-structure-on-canvas bg-canvas px-5 py-4"
    : "sticky top-0 z-10 flex items-center justify-between border-b border-rule bg-white px-5 py-4";

  const titleClass = design
    ? "font-mono text-[11px] uppercase tracking-eyebrow text-structure-on-canvas"
    : "font-mono text-[11px] uppercase tracking-eyebrow text-slate-550";

  const closeBtnClass = design
    ? "flex min-h-[36px] min-w-[36px] items-center justify-center rounded-sm border border-structure-on-canvas text-structure-on-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-structure-on-canvas focus-visible:ring-offset-2"
    : "flex min-h-[36px] min-w-[36px] items-center justify-center rounded-sm border border-rule text-slate-550 transition hover:border-federal hover:text-federal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-federal focus-visible:ring-offset-2";

  const sectionToggleClass = design
    ? "flex w-full items-center justify-between border-t border-structure-on-canvas px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-structure-on-canvas focus-visible:ring-inset"
    : "flex w-full items-center justify-between border-t border-rule px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-federal focus-visible:ring-inset";

  const sectionLabelClass = design
    ? "font-mono text-[12px] uppercase tracking-eyebrow text-foreground"
    : "font-mono text-[12px] uppercase tracking-eyebrow text-ink";

  const bodyClass = "px-5 pb-6 pt-1";

  const noteClass = design
    ? "font-body text-[12px] leading-relaxed text-foreground"
    : "font-body text-[12px] leading-relaxed text-slate-550";

  const inputClass = design
    ? "w-full rounded-sm border border-structure-on-canvas bg-canvas px-2.5 py-1.5 font-body text-[13px] text-foreground"
    : "w-full rounded-sm border border-rule bg-white px-2.5 py-1.5 font-body text-[13px] text-ink";

  const btnClass = design
    ? "shrink-0 rounded-sm border border-structure-on-canvas px-3 py-1.5 font-mono text-[11px] uppercase tracking-eyebrow text-structure-on-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-structure-on-canvas focus-visible:ring-offset-2"
    : "shrink-0 rounded-sm border border-federal px-3 py-1.5 font-mono text-[11px] uppercase tracking-eyebrow text-federal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-federal focus-visible:ring-offset-2";

  const linkBtnClass = design
    ? "font-mono text-[11px] uppercase tracking-eyebrow text-structure-on-canvas underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-structure-on-canvas focus-visible:ring-offset-2"
    : "font-mono text-[11px] uppercase tracking-eyebrow text-slate-550 underline underline-offset-4 transition hover:text-federal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-federal focus-visible:ring-offset-2";

  const dangerBtnClass = design
    ? "rounded-sm border border-error px-3 py-1.5 font-mono text-[11px] uppercase tracking-eyebrow text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-structure-on-canvas focus-visible:ring-offset-2"
    : "rounded-sm border border-fit-adjacent px-3 py-1.5 font-mono text-[11px] uppercase tracking-eyebrow text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-federal focus-visible:ring-offset-2";

  const selectClass = design
    ? "rounded-sm border border-structure-on-canvas bg-canvas px-2 py-1 font-mono text-[11px] text-foreground"
    : "rounded-sm border border-rule bg-white px-2 py-1 font-mono text-[11px] text-ink";

  const rowCardClass = design
    ? "rounded-sm border border-structure-on-canvas bg-canvas-alt p-3"
    : "rounded-sm border border-rule bg-paper p-3";

  const versionRowClass = design
    ? "rounded-sm border border-structure-on-canvas bg-canvas p-2.5"
    : "rounded-sm border border-rule bg-white p-2.5";

  function tierCardClass(active: boolean) {
    const base =
      "flex w-full flex-col gap-1 rounded-sm border px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";
    if (design) {
      return `${base} ${active ? "border-structure-on-canvas bg-canvas-alt" : "border-structure-on-canvas bg-canvas"} focus-visible:ring-structure-on-canvas`;
    }
    return `${base} ${active ? "border-federal bg-paper" : "border-rule bg-white"} focus-visible:ring-federal`;
  }

  function renderSectionHeader(id: SectionId, label: string) {
    const isOpen = openSection === id;
    return (
      <button
        type="button"
        onClick={() => toggleSection(id)}
        aria-expanded={isOpen}
        className={sectionToggleClass}
      >
        <span className={sectionLabelClass}>{label}</span>
        <Chevron
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""} ${design ? "text-structure-on-canvas" : "text-slate-550"}`}
        />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex overflow-hidden">
      <div className={backdropClass} onClick={onClose} aria-hidden />

      <aside
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-sidebar-title"
        className={panelClass}
      >
        <div className={headerClass}>
          <h2 id="app-sidebar-title" className={titleClass}>
            Account &amp; settings
          </h2>
          <button ref={closeBtnRef} type="button" onClick={onClose} aria-label="Close menu" className={closeBtnClass}>
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* 1 — Settings ------------------------------------------------------ */}
        {renderSectionHeader("settings", "Settings")}
        {openSection === "settings" && (
          <div className={bodyClass}>
            <p className={noteClass}>
              Auto-apply requirements — stored on this device only, never sent to a server.
            </p>
            <SettingsForm />
          </div>
        )}

        {/* 2 — Grants applied for ------------------------------------------- */}
        {renderSectionHeader("grants", "Grants applied for")}
        {openSection === "grants" && (
          <div className={bodyClass}>
            <form onSubmit={handleAddGrant} className="flex items-center gap-2">
              <input
                type="text"
                value={newGrantTitle}
                onChange={(e) => setNewGrantTitle(e.target.value)}
                placeholder="＋ Track a grant by title"
                aria-label="Grant title"
                className={inputClass}
              />
              <button type="submit" className={btnClass}>
                Add
              </button>
            </form>

            {grants.length === 0 ? (
              <p className={`mt-3 ${noteClass}`}>No grants tracked yet.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {grants.map((g) => (
                  <li key={g.id} className={rowCardClass}>
                    <p className={design ? "font-body text-[13px] text-foreground" : "font-body text-[13px] text-ink"}>
                      {g.title}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <label className="flex items-center gap-1.5">
                        <span className="sr-only">Status for {g.title}</span>
                        <select
                          value={g.status}
                          onChange={(e) => setGrants(setGrantStatus(g.id, e.target.value as GrantStatus))}
                          className={selectClass}
                        >
                          {STATUS_ORDER.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() => setGrants(removeGrant(g.id))}
                        className={linkBtnClass}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* 3 — Company descriptions ----------------------------------------- */}
        {renderSectionHeader("descriptions", "Company descriptions")}
        {openSection === "descriptions" && (
          <div className={bodyClass}>
            <form onSubmit={handleCreateDescription} className="flex items-center gap-2">
              <input
                type="text"
                value={newDescName}
                onChange={(e) => setNewDescName(e.target.value)}
                placeholder="＋ New description name"
                aria-label="New description name"
                className={inputClass}
              />
              <button type="submit" className={btnClass}>
                Create
              </button>
            </form>

            {descriptions.length === 0 ? (
              <p className={`mt-3 ${noteClass}`}>No saved descriptions yet.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-3">
                {descriptions.map((d) => (
                  <li key={d.id} className={rowCardClass}>
                    <div className="flex items-center justify-between gap-2">
                      {editingNameId === d.id ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            setDescriptions(renameDescription(d.id, editingNameValue));
                            setEditingNameId(null);
                          }}
                          className="flex flex-1 items-center gap-2"
                        >
                          <input
                            type="text"
                            value={editingNameValue}
                            onChange={(e) => setEditingNameValue(e.target.value)}
                            aria-label="Rename description"
                            className={inputClass}
                          />
                          <button type="submit" className={btnClass}>
                            Save
                          </button>
                        </form>
                      ) : (
                        <>
                          <p className={design ? "font-body text-[14px] font-medium text-foreground" : "font-body text-[14px] font-medium text-ink"}>
                            {d.name}
                          </p>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingNameId(d.id);
                                setEditingNameValue(d.name);
                              }}
                              className={linkBtnClass}
                            >
                              Rename
                            </button>
                            <button
                              type="button"
                              onClick={() => setDescriptions(deleteDescription(d.id))}
                              className={linkBtnClass}
                            >
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="mt-2">
                      <textarea
                        value={versionDrafts[d.id] ?? ""}
                        onChange={(e) => setVersionDrafts((prev) => ({ ...prev, [d.id]: e.target.value }))}
                        rows={3}
                        placeholder="Write or paste a company description…"
                        aria-label={`New version for ${d.name}`}
                        className={`resize-none ${inputClass}`}
                      />
                      <div className="mt-2 flex items-center gap-2">
                        <button type="button" onClick={() => handleSaveVersion(d.id)} className={btnClass}>
                          Save version
                        </button>
                      </div>
                    </div>

                    {d.versions.length > 0 && (
                      <ul className="mt-3 flex flex-col gap-2">
                        {d.versions
                          .slice()
                          .reverse()
                          .map((v) => {
                            const isActive = d.activeVersionId === v.id;
                            return (
                              <li key={v.id} className={versionRowClass}>
                                <div className="flex items-center justify-between gap-2">
                                  <span className={design ? "font-mono text-[10px] text-foreground" : "font-mono text-[10px] text-slate-550"}>
                                    {new Date(v.createdAt).toLocaleString()}
                                    {isActive ? " · active" : ""}
                                  </span>
                                </div>
                                <p className={`mt-1 whitespace-pre-wrap font-body text-[12px] leading-relaxed ${design ? "text-foreground" : "text-ink"}`}>
                                  {v.text}
                                </p>
                                <div className="mt-2 flex items-center gap-3">
                                  <button
                                    type="button"
                                    onClick={() => handleRestore(d.id, v.id, v.text)}
                                    className={linkBtnClass}
                                  >
                                    Restore
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleUseThis(v.text)}
                                    className={btnClass}
                                  >
                                    Use this
                                  </button>
                                </div>
                              </li>
                            );
                          })}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* 4 — Account ------------------------------------------------------ */}
        {renderSectionHeader("account", "Account")}
        {openSection === "account" && (
          <div className={bodyClass}>
            <div className="flex flex-col gap-3">
              {/* Delete my data */}
              {confirming === "delete" ? (
                <div className={rowCardClass} role="group" aria-label="Confirm delete my data">
                  <p className={noteClass}>
                    Delete all locally-stored data (settings, grants, descriptions, tier, sign-in)?
                    This can&apos;t be undone.
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    <button type="button" onClick={handleDeleteMyData} className={dangerBtnClass}>
                      Confirm delete
                    </button>
                    <button type="button" onClick={() => setConfirming(null)} className={linkBtnClass}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setJustCleared(false);
                    setConfirming("delete");
                  }}
                  className={`self-start ${dangerBtnClass}`}
                >
                  Delete my data
                </button>
              )}

              {/* Close account */}
              {confirming === "close" ? (
                <div className={rowCardClass} role="group" aria-label="Confirm close account">
                  <p className={noteClass}>
                    Close this (mock) account? This clears all local data and signs you out. No
                    server is contacted.
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    <button type="button" onClick={handleCloseAccount} className={dangerBtnClass}>
                      Confirm close
                    </button>
                    <button type="button" onClick={() => setConfirming(null)} className={linkBtnClass}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setJustCleared(false);
                    setConfirming("close");
                  }}
                  className={`self-start ${dangerBtnClass}`}
                >
                  Close account
                </button>
              )}

              {/* Log out — only when signed in */}
              {user && (
                <button type="button" onClick={() => signOut()} className={`self-start ${btnClass}`}>
                  Log out
                </button>
              )}

              {justCleared && (
                <p className={design ? "font-mono text-[11px] text-structure-on-canvas" : "font-mono text-[11px] text-slate-550"} aria-live="polite">
                  Local data cleared.
                </p>
              )}
            </div>
          </div>
        )}

        {/* 5 — Billing (MOCK) ----------------------------------------------- */}
        {renderSectionHeader("billing", "Billing")}
        {openSection === "billing" && (
          <div className={bodyClass}>
            <p className={noteClass}>
              Mock plans — selecting one is a local demo switch only. No payment is taken and no
              server is contacted. It just previews how each plan would unlock features.
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              {BILLING_TIERS.map((t) => {
                const active = tier === t.id;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setTier(t.id as BillingTier)}
                      aria-pressed={active}
                      className={tierCardClass(active)}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className={design ? "font-mono text-[12px] uppercase tracking-eyebrow text-foreground" : "font-mono text-[12px] uppercase tracking-eyebrow text-ink"}>
                          {t.label}
                          {active ? " · current" : ""}
                        </span>
                        <span className={design ? "font-display text-[15px] font-bold text-foreground" : "font-display text-[15px] font-bold text-ink"}>
                          {t.priceLabel}
                        </span>
                      </span>
                      <span className={design ? "font-body text-[12px] leading-relaxed text-foreground" : "font-body text-[12px] leading-relaxed text-slate-550"}>
                        {t.blurb}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className={`mt-3 ${noteClass}`}>
              This is a mock. No real charge, ever.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}

function Chevron({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 6l4 4 4-4" />
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
