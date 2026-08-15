"use client";
import { useState } from "react";
import { TEST_CASES } from "@/lib/testCases";
import { isFlagEnabled } from "@/lib/flags";
import { useAuth } from "@/components/AuthProvider";
import { clearAllLocalData } from "@/lib/mockAuth";
import { BRAND } from "@/lib/brand";
import SearchProgress from "@/components/SearchProgress";
import PreSearchInterview from "@/components/PreSearchInterview";
// Type-only: generateQuestions.ts imports the OpenAI SDK at runtime. A
// type-only import is erased at compile time, so no server-only runtime
// (or the OPENAI_API_KEY it reads) ever reaches this client bundle.
import type { InterviewQuestion } from "@/lib/interview/generateQuestions";

// FE-02 (R7.1): one honest, non-numeric one-liner per sample so the picker
// reads as "fictional example companies," not a filter on the user's own
// business. Keep these purely descriptive — no invented stats beyond what's
// already in TEST_CASES[].text.
const SAMPLE_BLURBS: Record<string, string> = {
  "ai-healthcare": "Fictional health-tech startup easing nurses' admin workload with AI.",
  manufacturing: "Fictional hardware startup scaling up lightweight aerospace component manufacturing.",
  water: "Fictional climate-tech startup using sensors and AI to cut municipal water loss.",
  cyber: "Fictional cybersecurity startup building AI-powered threat detection.",
  marketplace: "Fictional local marketplace startup — an intentionally hard case likely to return few or no strong matches.",
};

export default function IntakeForm({ onResult }: { onResult: (m: any) => void }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Real pipeline milestone streamed from /api/match (drives SearchProgress).
  const [progress, setProgress] = useState<{ pct: number; label: string } | null>(null);
  // FE-02 (R7.1): sample-company picker is collapsed by default; it's a
  // secondary affordance behind a real visual break, not an inline filter row.
  const [samplesOpen, setSamplesOpen] = useState(false);
  // FE-01: gates the CON-02 USWDS restyle (60/30/10 tokens). Off = v1 look.
  const design = isFlagEnabled("r7_design");

  // R1 (FE-03): pre-search interview. Off (default) = today's behavior
  // EXACTLY — beginSearch() below short-circuits straight to run(), and
  // interviewPhase never leaves "idle", so nothing new ever renders.
  const interviewOn = isFlagEnabled("r1_interview");
  const [interviewPhase, setInterviewPhase] = useState<"idle" | "generating" | "questions">("idle");
  const [interviewQuestions, setInterviewQuestions] = useState<InterviewQuestion[]>([]);
  // The exact description /api/interview generated questions for — captured
  // at beginSearch() time, independent of subsequent edits to `text`, so
  // PreSearchInterview's "Search anyway" always searches what the founder
  // actually asked the interview about.
  const [originalDescription, setOriginalDescription] = useState("");

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

  // R1 (FE-03): single entry point for both the CTA and the sample picker.
  // Flag off -> straight to run(), unchanged. Flag on -> ask INT-01 for a
  // cheap/fast set of routing questions first; any failure or an empty
  // interview (description already resolves cleanly) falls back to run()
  // directly so a broken interview never blocks the free path.
  async function beginSearch(description: string) {
    if (!interviewOn) {
      run(description);
      return;
    }
    setError(null);
    setInterviewPhase("generating");
    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      if (!res.ok) {
        setInterviewPhase("idle");
        run(description);
        return;
      }
      const j = await res.json();
      const questions: InterviewQuestion[] = Array.isArray(j?.questions) ? j.questions : [];
      if (questions.length === 0) {
        setInterviewPhase("idle");
        run(description);
        return;
      }
      setInterviewQuestions(questions);
      setOriginalDescription(description);
      setInterviewPhase("questions");
    } catch {
      // Network error / bad JSON — never block the free path.
      setInterviewPhase("idle");
      run(description);
    }
  }

  function handleInterviewComplete(enrichedDescription: string) {
    setInterviewPhase("idle");
    run(enrichedDescription);
  }

  function handleInterviewSkip() {
    setInterviewPhase("idle");
    run(originalDescription);
  }

  // FE-02 (R7.1): picking a sample goes straight to run() (streaming,
  // SearchProgress, caching — all untouched/wired identically), bypassing
  // the R1 pre-search interview even when that flag is on: samples are
  // pre-written and the user has no refining answers to give, so there's
  // nothing for the interview to ask. Only confirm-before-overwrite is new,
  // and only when there's meaningful user text already in the box.
  function selectSample(tc: (typeof TEST_CASES)[number]) {
    if (text.trim().length > 0) {
      const ok = window.confirm("Replace your description with this sample company?");
      if (!ok) return;
    }
    setText(tc.text);
    setSamplesOpen(false);
    run(tc.text);
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
    ? "min-h-[44px] rounded-sm bg-action px-5 py-2.5 font-mono text-[12px] uppercase tracking-eyebrow text-token-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-structure-on-canvas focus-visible:ring-offset-2"
    : "min-h-[44px] rounded-sm bg-ink px-5 py-2.5 font-mono text-[12px] uppercase tracking-eyebrow text-paper transition hover:bg-federal disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-federal focus-visible:ring-offset-2";

  // FE-02 (R7.1): the sample-company picker lives below a real visual break
  // (border-t + vertical space), not inline with the CTA. It's a secondary
  // affordance -> navy "structure" role, never green (`bg-action` is
  // reserved for the primary CTA only).
  const sampleSectionClass = design
    ? "mt-6 border-t border-structure-on-canvas pt-5"
    : "mt-6 border-t border-rule pt-5";

  const sampleTriggerClass = design
    ? "min-h-[44px] rounded-sm border border-structure-on-canvas bg-canvas-alt px-4 py-2.5 font-mono text-[12px] uppercase tracking-eyebrow text-structure-on-canvas transition hover:bg-structure hover:text-token-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-structure-on-canvas focus-visible:ring-offset-2"
    : "min-h-[44px] rounded-sm border border-rule bg-white px-4 py-2.5 font-mono text-[12px] uppercase tracking-eyebrow text-slate-550 transition hover:border-federal hover:text-federal disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-federal focus-visible:ring-offset-2";

  // Expanded picker panel gets its own subtle background-tone shift (on top
  // of the border-t break above) so it reads as a distinct, optional area.
  const samplePanelClass = design
    ? "mt-3 rounded-sm border border-structure-on-canvas bg-canvas-alt p-4"
    : "mt-3 rounded-sm border border-rule bg-white p-4";

  const samplePanelIntroClass = design
    ? "font-body text-[13px] leading-relaxed text-foreground"
    : "font-body text-[13px] leading-relaxed text-slate-550";

  // List items, not chips: each is a full-width card with a label + one-line
  // description so it reads as "pick an example company," not a filter.
  // `group` + `group-hover:*` on the children lets the hover-fill state
  // (navy on r7_design, federal-blue text on v1) recolor both label and
  // blurb together, matching the required white-on-structure-fill pairing.
  const sampleItemClass = design
    ? "group flex min-h-[44px] w-full flex-col justify-center gap-0.5 rounded-sm border border-structure-on-canvas bg-canvas px-3.5 py-2.5 text-left transition hover:bg-structure disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-structure-on-canvas focus-visible:ring-offset-2"
    : "group flex min-h-[44px] w-full flex-col justify-center gap-0.5 rounded-sm border border-rule bg-paper px-3.5 py-2.5 text-left transition hover:border-federal disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-federal focus-visible:ring-offset-2";

  const sampleItemLabelClass = design
    ? "font-mono text-[12px] uppercase tracking-eyebrow text-structure-on-canvas group-hover:text-token-white"
    : "font-mono text-[12px] uppercase tracking-eyebrow text-ink group-hover:text-federal";

  const sampleItemBlurbClass = design
    ? "font-body text-[13px] leading-relaxed text-foreground group-hover:text-token-white"
    : "font-body text-[13px] leading-relaxed text-slate-550 group-hover:text-federal";

  // Error state is a legitimate semantic role -> `error` token. As a 2px
  // border (non-text, 3:1 threshold) this passes AA against canvas-alt/canvas
  // (verified ~4.37:1 in the CON-02 report); avoid it as bare small text.
  const errorClass = design
    ? "mt-4 border-l-2 border-error bg-canvas-alt px-4 py-3 font-body text-sm text-foreground"
    : "mt-4 border-l-2 border-fit-adjacent bg-white px-4 py-3 font-body text-sm text-ink";

  // R1 (FE-03): lightweight status while /api/interview is in flight — NOT
  // the big SearchProgress bar, which is reserved for the expensive
  // /api/match phase.
  const interviewStatusClass = design
    ? "mt-4 font-mono text-[12px] text-structure-on-canvas"
    : "mt-4 font-mono text-[12px] text-federal";

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
        disabled={interviewPhase !== "idle"}
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
              Opt in to sharing anonymized usage data so {BRAND} can analyze usage patterns
              and improve the product. Optional — it never changes your results. Off by
              default, and you can turn it off anytime.
            </span>
          </label>
          {consent.granted && consent.grantedAt && (
            <p className="mt-1.5 pl-[26px] font-mono text-[11px] text-slate-550">
              Opted in {new Date(consent.grantedAt).toLocaleString()}.
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3 pl-[26px]">
            <button
              type="button"
              onClick={handleDeleteMyData}
              className="font-mono text-[11px] uppercase tracking-eyebrow text-slate-550 underline decoration-dotted underline-offset-2 transition hover:text-federal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-federal focus-visible:ring-offset-2"
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

      {interviewPhase === "idle" && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={() => beginSearch(text)}
            disabled={loading || text.trim().length < 20}
            className={primaryButtonClass}
          >
            {loading ? "Searching…" : "Find opportunities"}
          </button>
        </div>
      )}

      {/* R1 (FE-03): brief status while INT-01 generates routing questions.
          Not the SearchProgress bar — that's reserved for /api/match. */}
      {interviewPhase === "generating" && (
        <p className={interviewStatusClass} role="status" aria-live="polite">
          Preparing a few quick questions…
        </p>
      )}

      {/* R1 (FE-03): inline (non-modal) interview — questions phase, then an
          editable review of the enriched description, before the expensive
          /api/match search fires. "Search anyway" always available. */}
      {interviewPhase === "questions" && (
        <PreSearchInterview
          questions={interviewQuestions}
          originalDescription={originalDescription}
          design={design}
          onComplete={handleInterviewComplete}
          onSkip={handleInterviewSkip}
        />
      )}

      {loading && (
        <SearchProgress design={design} realPct={progress?.pct} realLabel={progress?.label} />
      )}

      {/* FE-02 (R7.1): sample-company picker — a real visual break (border-t
          + vertical space) separates this from the user's own description,
          so it reads as "try an example," not a filter on their business. */}
      {interviewPhase === "idle" && (
        <div className={sampleSectionClass}>
          <button
            type="button"
            onClick={() => setSamplesOpen((open) => !open)}
            aria-expanded={samplesOpen}
            disabled={loading}
            className={sampleTriggerClass}
          >
            {samplesOpen ? "Hide sample companies" : "See a sample company"}
          </button>

          {samplesOpen && (
            <div className={samplePanelClass}>
              <p className={samplePanelIntroClass}>
                These are fictional example companies — pick one to see how {BRAND} works.
              </p>
              <ul className="mt-3 flex flex-col gap-2">
                {TEST_CASES.map((tc) => (
                  <li key={tc.id}>
                    <button
                      type="button"
                      onClick={() => selectSample(tc)}
                      disabled={loading}
                      className={sampleItemClass}
                    >
                      <span className={sampleItemLabelClass}>{tc.label}</span>
                      <span className={sampleItemBlurbClass}>{SAMPLE_BLURBS[tc.id]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className={errorClass}>
          {error}
        </p>
      )}
    </div>
  );
}
