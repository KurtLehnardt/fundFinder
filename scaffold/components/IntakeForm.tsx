"use client";
import { useState } from "react";
import { TEST_CASES } from "@/lib/testCases";
import { isFlagEnabled } from "@/lib/flags";

export default function IntakeForm({ onResult }: { onResult: (m: any) => void }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // FE-01: gates the CON-02 USWDS restyle (60/30/10 tokens). Off = v1 look.
  const design = isFlagEnabled("r7_design");

  async function run(description: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
      onResult(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
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

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => run(text)}
          disabled={loading || text.trim().length < 20}
          className={primaryButtonClass}
        >
          {loading ? "Reading the federal register…" : "Find opportunities"}
        </button>
        <span className={orLabelClass}>or try a test case</span>
      </div>

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
