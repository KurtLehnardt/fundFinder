"use client";
import { useState } from "react";
import { TIER_LABEL, TIER_COLOR, type Match, type Opportunity } from "@/lib/types";

const money = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${n}`;

/** Friendly labels so we never render "Rd". */
const KIND_LABEL: Record<string, string> = {
  grant: "Grant",
  rd: "R&D",
  assistance: "Assistance",
  procurement: "Procurement",
};

/**
 * Darker tier text for the small 11px label + score so they clear WCAG
 * contrast on white. The 3px spine keeps the original, brighter TIER_COLOR.
 */
const TIER_TEXT: Record<string, string> = {
  likely: "#1E7A4C",
  verify: "#8A6012",
  adjacent: "#A5451F",
  none: "#6B7280",
};

/** One-sided ranges must never read "$500K–$0". */
function fundingRange(o: Opportunity): string | null {
  const { fundingLow: low, fundingHigh: high } = o;
  const hasLow = typeof low === "number" && low > 0;
  const hasHigh = typeof high === "number" && high > 0;
  if (hasLow && hasHigh) return `${money(low!)}–${money(high!)}`;
  if (hasHigh) return `up to ${money(high!)}`;
  if (hasLow) return `${money(low!)}+`;
  return null;
}

export default function OpportunityCard({ m, index }: { m: Match; index: number }) {
  // Expand the first three cards so criteria / ineligibility / history read at a glance.
  const [open, setOpen] = useState(index < 3);
  const spine = TIER_COLOR[m.tier] ?? "#6B7280";
  const color = TIER_TEXT[m.tier] ?? "#6B7280";
  const o = m.opportunity;
  const value = fundingRange(o);
  const kindLabel = KIND_LABEL[o.kind] ?? o.kind;

  // "What could make you ineligible" is spec-mandatory — never render it blank.
  const ineligible = m.whyIneligible?.trim()
    ? m.whyIneligible
    : "No disqualifying factors surfaced from your description, but eligibility still turns on the program's formal requirements. Confirm size standards, required registrations, and topic scope with the program officer before applying.";

  const nextSteps = m.whatToDoNext?.trim();

  return (
    <article className="relative border border-rule bg-white">
      <span className="spine" style={{ background: spine }} aria-hidden />

      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full px-6 py-5 text-left"
      >
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <span className="font-mono text-[11px] uppercase tracking-eyebrow" style={{ color }}>
              {TIER_LABEL[m.tier]}
            </span>
            <h3 className="mt-1.5 font-display text-[19px] font-medium leading-snug">{o.program}</h3>
            <p className="mt-1 font-mono text-[12px] text-slate-550">{o.agency}</p>
          </div>

          <div className="shrink-0 text-right">
            <div className="font-display text-[26px] font-bold leading-none" style={{ color }}>
              {m.score}
              <span className="text-[15px] font-medium">%</span>
            </div>
            <div className="eyebrow mt-1">match</div>
          </div>
        </div>

        <dl className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-2 font-mono text-[12px]">
          {value && (
            <div>
              <dt className="inline text-slate-550">Value </dt>
              <dd className="inline">{value}</dd>
            </div>
          )}
          {o.deadline && (
            <div>
              <dt className="inline text-slate-550">Deadline </dt>
              <dd className="inline">{o.deadline}</dd>
            </div>
          )}
          {o.forecasted && (
            <span className="rounded-sm border border-rule px-1.5 py-0.5 text-[10px] uppercase tracking-eyebrow text-slate-550">
              Forecasted
            </span>
          )}
          <div>
            <dt className="inline text-slate-550">Type </dt>
            <dd className="inline">{kindLabel}</dd>
          </div>
        </dl>
      </button>

      {open && (
        <div className="reveal border-t border-rule px-6 pb-6 pt-5">
          {m.criteria?.length > 0 && (
            <ul className="mb-6 grid gap-1.5 sm:grid-cols-2">
              {m.criteria.map((c, i) => (
                <li key={i} className="flex gap-2 font-body text-[13px]">
                  <span className={c.met ? "text-fit-strong" : "text-slate-550"} aria-hidden>
                    {c.met ? "✓" : "○"}
                  </span>
                  <span className={c.met ? "" : "text-slate-550"}>{c.label}</span>
                </li>
              ))}
            </ul>
          )}

          <Section title="Why we think you're a fit" body={m.whyFit} />
          <Section title="What could make you ineligible" body={ineligible} accent />
          <Section title="What you should verify" body={m.whatToVerify} />

          {m.history && (
            <div className="mt-6 border-t border-rule pt-5">
              <p className="eyebrow mb-3">Similar companies funded</p>
              <div className="mb-4 flex flex-wrap gap-x-8 gap-y-3">
                <Stat n={m.history.similarCompanies} label="similar companies" />
                <Stat n={money(m.history.totalAwarded)} label="total awarded" />
                <Stat n={money(m.history.medianAward)} label="median award" />
                <Stat n={m.history.inState} label="in Utah" />
                <Stat n={m.history.inVertical} label="in your vertical" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[440px] font-mono text-[11px]">
                  <thead>
                    <tr className="border-b border-rule text-left text-slate-550">
                      <th className="py-1.5 font-normal">Company</th>
                      <th className="py-1.5 font-normal">Program</th>
                      <th className="py-1.5 font-normal">Agency</th>
                      <th className="py-1.5 text-right font-normal">Amount</th>
                      <th className="py-1.5 text-right font-normal">Year</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.history.recipients.map((r, i) => (
                      <tr key={i} className="border-b border-rule/60">
                        <td className="py-1.5 pr-3">{r.company}</td>
                        <td className="py-1.5 pr-3 text-slate-550">{r.program}</td>
                        <td className="py-1.5 pr-3 text-slate-550">{r.agency}</td>
                        <td className="py-1.5 pr-3 text-right">{money(r.amount)}</td>
                        <td className="py-1.5 text-right text-slate-550">{r.year}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(nextSteps || o.url) && (
            <div className="mt-6 border-t border-rule pt-5">
              <p className="eyebrow mb-2">What to do next</p>
              {nextSteps && <p className="font-body text-[14px] leading-relaxed">{nextSteps}</p>}
              {o.url && (
                <a href={o.url} target="_blank" rel="noreferrer"
                   className="mt-3 inline-block font-mono text-[12px] text-federal underline underline-offset-4">
                  Open the official listing
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function Section({ title, body, accent }: { title: string; body?: string; accent?: boolean }) {
  if (!body || !body.trim()) return null;
  return (
    <div className={`mb-5 ${accent ? "border-l-2 border-fit-verify pl-4" : ""}`}>
      <p className="eyebrow mb-1.5">{title}</p>
      <p className="font-body text-[14px] leading-relaxed">{body}</p>
    </div>
  );
}

function Stat({ n, label }: { n: number | string; label: string }) {
  return (
    <div>
      <div className="font-display text-[20px] font-bold leading-none">{n}</div>
      <div className="eyebrow mt-1">{label}</div>
    </div>
  );
}
