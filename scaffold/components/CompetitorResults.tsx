"use client";

import {
  parseCompetitorAnalysis,
  type AwardSource,
  type GroundedAwardRecord,
} from "@/lib/contracts/competitorAnalysis";

/**
 * R5 — Competitor & Grant Intelligence results renderer.
 *
 * Renders the grounded analysis fixture captured by scripts/5-competitors.mjs:
 * awardee cards (org · $amount · agency · a snippet of the REAL abstract · a
 * real, clickable source link a user can verify) plus tailored positioning
 * feedback with VISIBLE citations back to those cards.
 *
 * ANTI-FABRICATION BOUNDARY: the fixture is parsed through
 * `CompetitorAnalysisSchema` here at the component boundary (mirroring how
 * `screen.ts` validates before returning). A competitor or a cited claim that
 * references a record id not in the retrieved set THROWS at parse time — so an
 * ungrounded claim is impossible to render, not merely discouraged.
 *
 * HONESTY (R7.7): the header always marks this as an EXAMPLE built from real
 * public data captured once — never presented as a live personalized run — and
 * every card keeps its real source link so the data is independently verifiable.
 *
 * Fully tokenized + dark-aware (CON-02 tokens; no raw hex). `bg-action` (green)
 * is reserved for the primary CTA elsewhere and is deliberately not used here.
 */

const SOURCE_LABEL: Record<AwardSource, string> = {
  USAspending: "USAspending",
  "NIH RePORTER": "NIH RePORTER",
  NSF: "NSF",
  "Grants.gov": "Grants.gov",
};

function money(n: number | null): string {
  if (n == null) return "Amount not disclosed";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function snippet(text: string, max = 260): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return t.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

export default function CompetitorResults({ raw }: { raw: unknown }) {
  // Boundary parse — an ungrounded/fabricated fixture throws here and cannot render.
  const data = parseCompetitorAnalysis(raw);
  const byId = new Map<string, GroundedAwardRecord>(data.records.map((r) => [r.id, r]));

  const capturedDate = new Date(data.capturedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const chipClass =
    "inline-flex items-center rounded-sm border border-structure-on-canvas px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-eyebrow text-structure-on-canvas";
  const sourceLinkClass =
    "inline-flex items-center gap-1 font-mono text-[11px] text-structure-on-canvas underline underline-offset-4 transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-structure-on-canvas focus-visible:ring-offset-2";

  return (
    <div className="text-foreground">
      {/* Honest label (R7.7) — always visible, never presented as a live run. */}
      <div className="rounded-sm border border-structure-on-canvas bg-canvas-alt px-3 py-2">
        <p className="font-mono text-[11px] uppercase tracking-eyebrow text-structure-on-canvas">
          Example analysis
        </p>
        <p className="mt-1 text-pretty font-body text-[12px] leading-relaxed text-foreground">
          Built from <strong>real public federal award data</strong> retrieved {capturedDate} and
          generated once — this is a saved example, not a live, personalized run. Every company below
          links to its official public award record so you can verify it.
        </p>
      </div>

      <p className="mt-4 font-body text-[13px] leading-relaxed text-foreground">
        <span className="font-mono text-[11px] uppercase tracking-eyebrow text-structure-on-canvas">
          Persona
        </span>{" "}
        {data.persona} — {data.personaDescription}
      </p>

      {data.analysis.summary && (
        <p className="mt-4 text-pretty font-body text-[14px] leading-relaxed text-foreground">
          {data.analysis.summary}
        </p>
      )}

      {/* ── Awardee cards ─────────────────────────────────────────────── */}
      <section className="mt-6">
        <h3 className="font-display text-[16px] font-bold leading-snug text-foreground">
          Companies that won federal funding in your space
        </h3>
        <p className="mt-1 font-body text-[12px] leading-relaxed text-foreground">
          How each positioned itself to win — grounded in a quote from its own public award record.
        </p>

        <ul className="mt-4 space-y-4">
          {data.analysis.competitors.map((c) => {
            const rec = byId.get(c.recordId);
            if (!rec) return null; // unreachable: the schema guarantees it exists.
            return (
              <li
                key={c.recordId}
                className="rounded-lg border border-structure-on-canvas bg-canvas-alt p-4 shadow-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-display text-[15px] font-bold leading-snug text-foreground">
                      {rec.recipient}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-foreground">
                      {rec.agency}
                      {rec.year ? ` · ${rec.year}` : ""}
                      {rec.program ? ` · ${rec.program}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={chipClass}>{SOURCE_LABEL[rec.source]}</span>
                    <span className="font-mono text-[13px] font-bold tabular-nums text-foreground">
                      {money(rec.amount)}
                    </span>
                  </div>
                </div>

                <p className="mt-3 text-pretty font-body text-[13px] leading-relaxed text-foreground">
                  {c.positioning}
                </p>

                <blockquote className="mt-3 border-l-2 border-structure-on-canvas pl-3 font-body text-[12px] italic leading-relaxed text-foreground">
                  “{snippet(c.quotedSnippet, 320)}”
                </blockquote>

                <details className="mt-3 group">
                  <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-eyebrow text-structure-on-canvas underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-structure-on-canvas focus-visible:ring-offset-2">
                    From the award abstract
                  </summary>
                  <p className="mt-2 text-pretty font-body text-[12px] leading-relaxed text-foreground">
                    {snippet(rec.abstract, 600)}
                  </p>
                </details>

                <div className="mt-3">
                  <a href={rec.sourceUrl} target="_blank" rel="noopener noreferrer" className={sourceLinkClass}>
                    View on {SOURCE_LABEL[rec.source]}
                    <span aria-hidden="true">↗</span>
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── Tailored positioning feedback with visible citations ──────── */}
      <section className="mt-8">
        <h3 className="font-display text-[16px] font-bold leading-snug text-foreground">
          What to emphasize
        </h3>
        <p className="mt-1 font-body text-[12px] leading-relaxed text-foreground">
          Tailored to {data.persona}. Each recommendation cites the award record(s) it draws from.
        </p>

        <ol className="mt-4 space-y-4">
          {data.analysis.recommendations.map((rec, i) => (
            <li
              key={i}
              className="rounded-lg border border-structure-on-canvas bg-canvas p-4"
            >
              <p className="text-pretty font-body text-[13px] leading-relaxed text-foreground">
                {rec.advice}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-eyebrow text-structure-on-canvas">
                  Based on
                </span>
                {rec.citations.map((cid) => {
                  const rc = byId.get(cid);
                  if (!rc) return null; // unreachable: schema-guaranteed.
                  return (
                    <a
                      key={cid}
                      href={rc.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-sm border border-structure-on-canvas bg-canvas-alt px-1.5 py-0.5 font-mono text-[10px] text-structure-on-canvas underline underline-offset-2 transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-structure-on-canvas focus-visible:ring-offset-2"
                      title={`${rc.recipient} — ${SOURCE_LABEL[rc.source]}`}
                    >
                      {rc.recipient}
                      <span aria-hidden="true">↗</span>
                    </a>
                  );
                })}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <p className="mt-6 border-t border-structure-on-canvas pt-4 text-pretty font-body text-[11px] leading-relaxed text-foreground">
        This example never invents a company, an amount, or an award — every figure and quote above is
        copied from the linked public federal record. A live, personalized version is a Maximum-plan
        feature we are building toward; nothing here is charged or submitted.
      </p>
    </div>
  );
}
