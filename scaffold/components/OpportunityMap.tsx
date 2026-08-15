"use client";
import OpportunityCard from "./OpportunityCard";
import type { OpportunityMap as MapT } from "@/lib/types";

const money = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M+` : `$${Math.round(n / 1e3)}K+`);

export default function OpportunityMap({ map }: { map: MapT }) {
  const w = map.weakFieldFinding;

  return (
    <div className="reveal">
      {/* Summary band — the first thing a founder reads. */}
      <div className="grid grid-cols-2 gap-px border border-rule bg-rule sm:grid-cols-4">
        <Cell n={String(map.summary.highPotential)} label="high-potential opportunities" />
        <Cell n={money(map.summary.fundingIdentified)} label="potential funding identified" />
        <Cell n={String(map.summary.agencies)} label="relevant agencies" />
        <Cell n={String(map.summary.closingIn90Days)} label="closing within 90 days" />
      </div>

      {/* The honest no. Deliberate, not an error state. */}
      {w && (
        <section className="mt-8 border border-ink bg-ink px-7 py-7 text-paper">
          <p className="eyebrow text-paper/55">A finding, not a dead end</p>
          <h2 className="mt-3 font-display text-[24px] font-medium leading-snug">{w.headline}</h2>
          <p className="mt-3 max-w-2xl font-body text-[15px] leading-relaxed text-paper/85">{w.reasoning}</p>

          <p className="eyebrow mt-7 text-paper/55">Where to look instead</p>
          <ul className="mt-3 grid gap-4 sm:grid-cols-2">
            {w.redirects.map((r, i) => (
              <li key={i} className="border-l-2 border-paper/25 pl-4">
                <p className="font-display text-[15px] font-medium">{r.label}</p>
                <p className="mt-1 font-body text-[13px] leading-relaxed text-paper/70">{r.why}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {map.followUps.length > 0 && (
        <section className="mt-8 border border-rule bg-white px-6 py-5">
          <p className="eyebrow mb-3">A few things would sharpen this</p>
          <ul className="space-y-2">
            {map.followUps.map((q, i) => (
              <li key={i} className="font-body text-[14px] text-slate-550">{q}</li>
            ))}
          </ul>
        </section>
      )}

      {map.matches.length > 0 && (
        <section className="mt-8">
          <p className="eyebrow mb-4">
            {w ? "Adjacent and partial matches" : "Your opportunity map"}
          </p>
          <div className="space-y-3">
            {map.matches.map((m, i) => (
              <OpportunityCard key={m.opportunity.id} m={m} index={i} />
            ))}
          </div>
        </section>
      )}

      {map.agencyIntelligence.length > 0 && (
        <section className="mt-10 border-t border-rule pt-7">
          <p className="eyebrow mb-4">Agencies that matter most to you</p>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {map.agencyIntelligence.map((a) => (
              <div key={a.agency}>
                <p className="font-display text-[15px] font-medium">{a.agency}</p>
                <p className="font-mono text-[11px] text-slate-550">
                  {a.opportunityCount} {a.opportunityCount === 1 ? "opportunity" : "opportunities"}
                </p>
                <p className="mt-1.5 font-body text-[13px] leading-relaxed text-slate-550">{a.why}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="mt-10 border-t border-rule pt-5 font-body text-[12px] leading-relaxed text-slate-550">
        These are assessments, not eligibility determinations. Confirm requirements with the
        program officer before you invest time in an application.
      </p>
    </div>
  );
}

function Cell({ n, label }: { n: string; label: string }) {
  return (
    <div className="bg-paper px-5 py-6">
      <div className="font-display text-[30px] font-bold leading-none">{n}</div>
      <div className="eyebrow mt-2 leading-snug">{label}</div>
    </div>
  );
}
