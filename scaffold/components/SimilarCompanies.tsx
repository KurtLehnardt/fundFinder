"use client";
import type { VerifiedRecipient } from "@/lib/similar/aggregate";

/**
 * D1 — free "Similar companies funded" AGGREGATE panel.
 *
 * Pure presentational component: it renders the already-deduped, already
 * verified-only `VerifiedRecipient[]` produced by
 * `aggregateSimilarCompanies()` (`lib/similar/aggregate.ts`). It does not
 * fetch, score, or analyze anything itself — that pure function is the single
 * source of truth for dedupe + ordering + the cap.
 *
 * Honesty (per the D1 brief): this is a rollup of verified PUBLIC federal
 * award records, not a personalized/live competitor analysis — that stays the
 * separate, Maximum-gated `CompetitorAnalysisModal` / `CompetitorResults`
 * flow (components/CompetitorAnalysisModal.tsx), untouched by this panel.
 * This component intentionally never imports `useBilling` / `useEntitlements`
 * / any tier check — it is always free, always rendered when verified data
 * exists.
 */

const money = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${n}`;

export default function SimilarCompanies({ recipients }: { recipients: VerifiedRecipient[] }) {
  // FE-01 / design revamp: the CON-02 USWDS 60/30/10 restyle is now the
  // DEFAULT (matches OpportunityMap.tsx / OpportunityCard.tsx / EligibilityBuckets.tsx).
  const design = true;

  // Defense-in-depth (per the D1 brief): re-assert the verified-only
  // guarantee at the render boundary too, independent of the pure aggregator
  // that already enforced it — a row can never reach the DOM without a real,
  // non-empty sourceUrl, regardless of what's passed in.
  const rows = (recipients ?? []).filter(
    (r) => r && typeof r.sourceUrl === "string" && r.sourceUrl.trim().length > 0,
  );

  if (rows.length === 0) return null;

  const tableHeadRowClass = design
    ? "border-b border-structure-on-canvas text-left text-foreground"
    : "border-b border-rule text-left text-slate-550";

  const tableBodyRowClass = design ? "border-b border-structure-on-canvas" : "border-b border-rule/60";

  const tableMutedCellClass = design ? "py-1.5 pr-3 text-foreground" : "py-1.5 pr-3 text-slate-550";

  // Same underline affordance as OpportunityCard's per-match recipient links
  // (recipientLinkClass) — every row here already cleared the same
  // provenance gate, so it gets the identical "click through to the source"
  // treatment.
  const recipientLinkClass = design
    ? "underline underline-offset-2 hover:text-structure-on-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-structure-on-canvas focus-visible:ring-offset-1"
    : "underline underline-offset-2 hover:text-federal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-federal focus-visible:ring-offset-1";

  const yearCellClass = design ? "py-1.5 text-right text-foreground" : "py-1.5 text-right text-slate-550";

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] font-mono text-[11px] tabular-nums">
        <thead>
          <tr className={tableHeadRowClass}>
            <th className="py-1.5 font-normal">Company</th>
            <th className="py-1.5 font-normal">Program</th>
            <th className="py-1.5 font-normal">Agency</th>
            <th className="py-1.5 text-right font-normal">Amount</th>
            <th className="py-1.5 text-right font-normal">Year</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.company}-${r.program}-${r.agency}-${r.year}-${r.amount}-${i}`} className={tableBodyRowClass}>
              <td className="py-1.5 pr-3">
                {/* Every row cleared the A3-lite provenance gate (verified
                    sourceUrl) both in aggregateSimilarCompanies() and again
                    above — link straight to the official public record. */}
                <a href={r.sourceUrl} target="_blank" rel="noreferrer" className={recipientLinkClass}>
                  {r.company}
                </a>
              </td>
              <td className={tableMutedCellClass}>{r.program}</td>
              <td className={tableMutedCellClass}>{r.agency}</td>
              <td className="py-1.5 pr-3 text-right">{money(r.amount)}</td>
              <td className={yearCellClass}>{r.year}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
