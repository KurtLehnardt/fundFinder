"use client";
import { useState } from "react";
import { TEST_CASES } from "@/lib/testCases";
import { isFlagEnabled } from "@/lib/flags";
import { useAuth } from "@/components/AuthProvider";
import { clearAllLocalData } from "@/lib/mockAuth";

export default function IntakeForm({ onResult }: { onResult: (m: any) => void }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div>
      <label htmlFor="co" className="eyebrow block mb-3">Tell us about your company</label>
      <textarea
        id="co"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder="What you build, who it's for, how many people, revenue, what you've raised, and how much you're looking for."
        className="w-full resize-none rounded-sm border border-rule bg-white p-4 font-body text-[15px] leading-relaxed outline-none focus:border-federal focus:ring-2 focus:ring-federal/15"
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
          className="rounded-sm bg-ink px-5 py-2.5 font-mono text-[12px] uppercase tracking-eyebrow text-paper transition hover:bg-federal disabled:cursor-not-allowed disabled:opacity-35"
        >
          {loading ? "Reading the federal register…" : "Find opportunities"}
        </button>
        <span className="font-mono text-[11px] text-slate-550">or try a test case</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {TEST_CASES.map((tc) => (
          <button
            key={tc.id}
            onClick={() => { setText(tc.text); run(tc.text); }}
            disabled={loading}
            className="rounded-sm border border-rule bg-white px-3 py-1.5 font-mono text-[11px] text-slate-550 transition hover:border-federal hover:text-federal disabled:opacity-40"
          >
            {tc.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-4 border-l-2 border-fit-adjacent bg-white px-4 py-3 font-body text-sm text-ink">
          {error}
        </p>
      )}
    </div>
  );
}
