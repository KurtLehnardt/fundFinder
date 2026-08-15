"use client";
import { useEffect, useRef, useState } from "react";

/**
 * SearchProgress — the loading experience while /api/match runs (novel input can
 * take ~2 minutes: embed → hybrid search → eligibility → explain).
 *
 * HYBRID progress: the backend streams REAL pipeline milestones (props `realPct`
 * / `realLabel`) — those are a monotonic FLOOR the bar snaps up to. Between
 * milestones a gentle time-based creep keeps the bar moving, capped just below
 * the next real milestone so a real step always reads as an upward jump, never a
 * backwards correction. Nothing here ever claims 100% — the parent unmounts this
 * the moment the real result arrives.
 *
 * The rotating facts are real, hedged figures about federal funding — not invented
 * numbers. Honest claims are the whole point of this product; keep them true.
 */

const FACTS: string[] = [
  "SBIR and STTR award more than $4 billion a year to small businesses — it's often called America's Seed Fund.",
  "SBIR/STTR funding is non-dilutive: no equity taken, nothing to repay. You keep your company and your IP.",
  "Eleven federal agencies run SBIR programs — from the NIH and NSF to the Department of Defense and NASA.",
  "Every agency with a large R&D budget must set aside a slice of it specifically for small businesses.",
  "A Phase I award is typically $50k–$300k to prove feasibility; Phase II can run past $1M to build it.",
  "grants.gov lists thousands of open opportunities across 26 federal grant-making agencies at any given time.",
  "The U.S. government is one of the largest funders of research and development in the world.",
  "Companies often qualify for more programs than they expect — that's exactly what this search is checking.",
];

const FACT_EVERY = 8; // seconds per fact
const TICK_MS = 200;
const EASE_K = 0.008; // per-tick ease toward the phase cap (~90% of a gap in ~60s)

/** Soft ceiling for the time-creep given the last real milestone reached. Each
 *  cap sits BELOW the next real milestone (5→18→32→46→52→90) so the next real
 *  step is always a visible jump up, never a correction down. */
function softCap(floor: number): number {
  if (floor >= 90) return 98;
  if (floor >= 52) return 88; // the long scoring/explaining phase
  if (floor >= 46) return 50;
  if (floor >= 32) return 44;
  if (floor >= 18) return 30;
  if (floor >= 5) return 16;
  return 12;
}

export default function SearchProgress({
  design,
  realPct,
  realLabel,
}: {
  design?: boolean;
  realPct?: number;
  realLabel?: string;
}) {
  const [display, setDisplay] = useState(4);
  const [elapsed, setElapsed] = useState(0);
  const floorRef = useRef(0);

  // A real milestone raises the monotonic floor and snaps the bar up to include it.
  useEffect(() => {
    if (typeof realPct === "number" && realPct > floorRef.current) {
      floorRef.current = realPct;
      setDisplay((d) => Math.max(d, realPct));
    }
  }, [realPct]);

  // Time-creep toward the current phase cap; keeps motion between real steps.
  useEffect(() => {
    const started = Date.now();
    const id = window.setInterval(() => {
      setElapsed((Date.now() - started) / 1000);
      setDisplay((d) => {
        const cap = softCap(floorRef.current);
        if (d >= cap) return d; // hold at the cap until the next real step lands
        return Math.min(cap, d + (cap - d) * EASE_K);
      });
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const label = realLabel || "Reading the federal register…";
  const fact = FACTS[Math.floor(elapsed / FACT_EVERY) % FACTS.length];
  const mm = Math.floor(elapsed / 60);
  const ss = Math.floor(elapsed % 60).toString().padStart(2, "0");
  const pct = Math.round(display);

  // Polish: elevated card (fixes a broken /30 alpha border that CSS-var-backed
  // tokens can't compute), and the progress FILL is the spec-reserved `action`
  // green (R7.2: green = primary CTA + progress fill only). The fill animates
  // via an interruptible width transition — never a keyframe — so a real
  // milestone snaps up cleanly and never masks state.
  const cardClass = design
    ? "mt-4 rounded-lg bg-canvas-alt px-4 py-4 shadow-card"
    : "mt-4 rounded-sm border border-rule bg-white px-4 py-4";
  const trackClass = design
    ? "h-2.5 w-full overflow-hidden rounded-full bg-canvas"
    : "h-2.5 w-full overflow-hidden rounded-full bg-rule/50";
  const fillClass = design
    ? "h-full rounded-full bg-action transition-[width] duration-700 ease-out"
    : "h-full rounded-full bg-federal transition-[width] duration-700 ease-out";
  const phaseClass = design
    ? "font-mono text-[12px] text-structure-on-canvas"
    : "font-mono text-[12px] text-federal";
  const mutedClass = design
    ? "font-mono text-[12px] tabular-nums text-foreground"
    : "font-mono text-[12px] tabular-nums text-slate-550";
  const factClass = design
    ? "mt-3 text-pretty font-body text-[13px] leading-relaxed text-foreground"
    : "mt-3 font-body text-[13px] leading-relaxed text-ink";

  return (
    <div className={cardClass} role="status" aria-live="polite" aria-label={`Searching — ${label}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className={phaseClass}>{label}</span>
        <span className={mutedClass} aria-hidden="true">
          {pct}% · {mm}:{ss}
        </span>
      </div>

      <div className={trackClass}>
        <div className={fillClass} style={{ width: `${pct}%` }} />
      </div>

      {/* key={fact} remounts on each rotation; `reveal` gives a gentle one-shot
          fade-in (low-frequency, reduced-motion-safe) as facts cycle. */}
      <p key={fact} className={`${factClass} reveal`}>
        <span className="font-mono text-[11px] uppercase tracking-eyebrow opacity-70">Did you know&nbsp;·&nbsp;</span>
        {fact}
      </p>

      <p className={`mt-3 text-pretty ${mutedClass}`}>
        First-time searches read live federal data and can take up to two minutes. Hang tight.
      </p>
    </div>
  );
}
