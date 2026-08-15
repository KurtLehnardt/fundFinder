"use client";
import { useState } from "react";
import { TIER_LABEL, TIER_COLOR, type Match } from "@/lib/types";

const money = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${n}`;

export default function OpportunityCard({ m, index }: { m: Match; index: number }) {
  const [open, setOpen] = useState(index === 0);
  const color = TIER_COLOR[m.tier];
  const o = m.opportunity;

  return (
    <article className="relative border border-rule bg-white">
      <span className="spine" style={{ background: color }} aria-hidden />

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
            </div>
            <div className="eyebrow mt-1">match</div>
          </div>
        </div>

        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 font-mono text-[12px]">
          {(o.fundingLow || o.fundingHigh) && (
            <div>
              <dt className="inline text-slate-550">Value </dt>
              <dd className="inline">{money(o.fundingLow ?? 0)}–{money(o.fundingHigh ?? 0)}</dd>
            </div>
          )}
          {o.deadline && (
            <div>
              <dt className="inline text-slate-550">Deadline </dt>
              <dd className="inline">{o.deadline}</dd>
            </div>
          )}
          <div>
            <dt className="inline text-slate-550">Type </dt>
            <dd className="inline capitalize">{o.kind}</dd>
          </div>
        </dl>
      </button>

      {open && (
        <div className="reveal border-t border-rule px-6 pb-6 pt-5">
          {m.criteria.length > 0 && (
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
          <Section title="What could make you ineligible" body={m.whyIneligible} accent />
          <Section title="What you should verify" body={m.whatToVerify} />

          {m.history && (
            <div className="mt-6 border-t border-rule pt-5">
              <p className="eyebrow mb-3">Similar companies funded</p>
              <div className="mb-4 flex flex-wrap gap-x-8 gap-y-3">
                <Stat n={m.history.similarCompanies} label="similar companies" />
                <Stat n={money(m.history.totalAwarded)} label="total awarded" />
                <Stat n={money(m.history.medianAward)} label="median award" />
                <Stat n={m.history.inState} label="in Utah" />
              </div>
              <table className="w-full font-mono text-[11px]">
                <thead>
                  <tr className="border-b border-rule text-left text-slate-550">
                    <th className="py-1.5 font-normal">Company</th>
                    <th className="py-1.5 font-normal">Agency</th>
                    <th className="py-1.5 text-right font-normal">Amount</th>
                    <th className="py-1.5 text-right font-normal">Year</th>
                  </tr>
                </thead>
                <tbody>
                  {m.history.recipients.map((r, i) => (
                    <tr key={i} className="border-b border-rule/60">
                      <td className="py-1.5 pr-3">{r.company}</td>
                      <td className="py-1.5 pr-3 text-slate-550">{r.agency}</td>
                      <td className="py-1.5 text-right">{money(r.amount)}</td>
                      <td className="py-1.5 text-right text-slate-550">{r.year}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-6 border-t border-rule pt-5">
            <p className="eyebrow mb-2">What to do next</p>
            <p className="font-body text-[14px] leading-relaxed">{m.whatToDoNext}</p>
            {o.url && (
              <a href={o.url} target="_blank" rel="noreferrer"
                 className="mt-3 inline-block font-mono text-[12px] text-federal underline underline-offset-4">
                Open the official listing
              </a>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

function Section({ title, body, accent }: { title: string; body: string; accent?: boolean }) {
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
