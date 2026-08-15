"use client";
import { useState } from "react";
import { TEST_CASES } from "@/lib/testCases";
import { isFlagEnabled } from "@/lib/flags";
import { useAuth } from "@/components/AuthProvider";
import { clearAllLocalData } from "@/lib/mockAuth";
import SearchProgress from "@/components/SearchProgress";

export default function IntakeForm({ onResult }: { onResult: (m: any) => void }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Real pipeline milestone streamed from /api/match (drives SearchProgress).
  const [progress, setProgress] = useState<{ pct: number; label: string } | null>(null);
  // FE-01: gates the CON-02 USWDS restyle (60/30/10 tokens). Off = v1 look.
  const design = isFlagEnabled("r7_design");

  // r9_0_mockauth (CON-03): flag off -> no consent/delete UI, v1 path unchanged.
  // This control gates NOTHING server-side — the pipeline call below sends
  // `description` regardless of `consent.granted`. Consent only decides whether
  // a description may later be reused beyond the user's own run (§5.3); no such
  // reuse pipeline exists yet (out of scope for PLT-01), so today the checkbox
  // only produces a local, timestamped, revocable record.
  const mockAuthOn = isFlagEnabled("r9_0_mockauth");
  const { consent, setConsent, signOut } = useAuth();
  const [justCleared, setJustCleared] = useState(false);

  function handleDeleteMyData() {
    clearAllLocalData();
    // clearAllLocalData only touches localStorage — resync the in-memory auth
    // state too, or a signed-in user / granted consent would keep rendering
    // as if nothing happened until next reload.
    signOut();
    setConsent(false);
    setJustCleared(true);
    window.setTimeout(() => setJustCleared(false), 4000);
  }

  async function run(description: string) {
    setLoading(true);
    setError(null);
    setProgress(null);
    try {
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });

      // Validation errors come back as plain JSON (non-streamed).
      const ctype = res.headers.get("content-type") ?? "";
      if (!res.ok && ctype.includes("application/json")) {
        const j = await res.json();
        throw new Error(j.error ?? "Something went wrong.");
      }
      // Fallback for environments without a readable stream: parse as one JSON blob.
      if (!res.body) {
        const j = await res.json();
        onResult(j);
        return;
      }

      // Stream: newline-delimited JSON of {type:"progress"|"result"|"error"}.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let streamDone = false;
      while (!streamDone) {
        const { value, done } = await reader.read();
        streamDone = done;
        if (value) buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let msg: any;
          try { msg = JSON.parse(line); } catch { continue; }
          if (msg.type === "progress") {
            setProgress({ pct: msg.pct ?? 0, label: msg.label ?? "" });
          } else if (msg.type === "result") {
            onResult(msg.map);
          } else if (msg.type === "error") {
            throw new Error(msg.error ?? "Matching failed.");
          }
        }
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }

  const labelClass = design
    ? "block mb-3 font-mono text-[11px] uppercase tracking-eyebrow text-structure-on-canvas"
    : "eyebrow block mb-3";

  // Borders are the "structure" role per R7.2 (navy carries links/secondary
  // buttons/borders); card fill uses canvas-alt, the 60% "card fills" token.
  const textareaClass = design
    ? "w-full resize-none rounded-sm border border-structure-on-canvas bg-canvas-alt p-4 font-body text-[15px] leading-relaxed text-foreground outline-none focus:border-structure-on-canvas focus:ring-2 focus:ring-structure-on-canvas"
    : "w-full resize-none rounded-sm border border-rule bg-white p-4 font-body text-[15px] leading-relaxed outline-none focus:border-federal focus:ring-2 focus:ring-federal/15";

  // The ONLY green surface in the whole app: primary CTA fill (R7.2's 10%).
  const primaryButtonClass = design
    ? "rounded-sm bg-action px-5 py-2.5 font-mono text-[12px] uppercase tracking-eyebrow text-token-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
    : "rounded-sm bg-ink px-5 py-2.5 font-mono text-[12px] uppercase tracking-eyebrow text-paper transition hover:bg-federal disabled:cursor-not-allowed disabled:opacity-35";

  const orLabelClass = design ? "font-mono text-[11px] text-foreground" : "font-mono text-[11px] text-slate-550";

  // Sample/test-case buttons are secondary actions -> navy structure, not green.
  const sampleButtonClass = design
    ? "rounded-sm border border-structure-on-canvas bg-canvas-alt px-3 py-1.5 font-mono text-[11px] text-structure-on-canvas transition hover:bg-structure hover:text-token-white disabled:opacity-40"
    : "rounded-sm border border-rule bg-white px-3 py-1.5 font-mono text-[11px] text-slate-550 transition hover:border-federal hover:text-federal disabled:opacity-40";

  // Error state is a legitimate semantic role -> `error` token. As a 2px
  // border (non-text, 3:1 threshold) this passes AA against canvas-alt/canvas
  // (verified ~4.37:1 in the CON-02 report); avoid it as bare small text.
  const errorClass = design
    ? "mt-4 border-l-2 border-error bg-canvas-alt px-4 py-3 font-body text-sm text-foreground"
    : "mt-4 border-l-2 border-fit-adjacent bg-white px-4 py-3 font-body text-sm text-ink";

  return (
    <div>
      <label htmlFor="co" className={labelClass}>Tell us about your company</label>
      <textarea
        id="co"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder="What you build, who it's for, how many people, revenue, what you've raised, and how much you're looking for."
        className={textareaClass}
      />

      {mockAuthOn && (
        <div className="mt-3 border-l-2 border-rule bg-white px-4 py-3">
          <label className="flex cursor-pointer items-start gap-2.5 font-body text-[13px] leading-relaxed text-ink">
            <input
              type="checkbox"
              checked={consent.granted}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-federal"
            />
            <span>
              Let fundFinder reuse this description to improve matching for other founders.
              Off by default — we never use it for anything else, and you can turn it off
              anytime.
            </span>
          </label>
          {consent.granted && consent.grantedAt && (
            <p className="mt-1.5 pl-[26px] font-mono text-[11px] text-slate-550">
              Consented {new Date(consent.grantedAt).toLocaleString()}.
            </p>
          )}

          <div className="mt-3 flex items-center gap-3 pl-[26px]">
            <button
              type="button"
              onClick={handleDeleteMyData}
              className="font-mono text-[11px] uppercase tracking-eyebrow text-slate-550 underline decoration-dotted underline-offset-2 transition hover:text-federal"
            >
              Delete my data
            </button>
            {justCleared && (
              <span className="font-mono text-[11px] text-slate-550">
                Local data cleared.
              </span>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => run(text)}
          disabled={loading || text.trim().length < 20}
          className={primaryButtonClass}
        >
          {loading ? "Searching…" : "Find opportunities"}
        </button>
        <span className={orLabelClass}>or try a test case</span>
      </div>

      {loading && (
        <SearchProgress design={design} realPct={progress?.pct} realLabel={progress?.label} />
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {TEST_CASES.map((tc) => (
          <button
            key={tc.id}
            onClick={() => { setText(tc.text); run(tc.text); }}
            disabled={loading}
            className={sampleButtonClass}
          >
            {tc.label}
          </button>
        ))}
      </div>

      {error && (
        <p className={errorClass}>
          {error}
        </p>
      )}
    </div>
  );
}
