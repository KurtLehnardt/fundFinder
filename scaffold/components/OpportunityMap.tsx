"use client";
import { Component, type ReactNode } from "react";
import OpportunityCard from "./OpportunityCard";
import type { OpportunityMap as MapT, Match } from "@/lib/types";
import { isFlagEnabled } from "@/lib/flags";

const money = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M+` : `$${Math.round(n / 1e3)}K+`;

/** Cards to render. We never wall the founder with the 20+ "none" rows. */
const CARD_CAP = 8;

/** FE-01: shared "eyebrow"-style mono label, token-driven when r7_design is on. */
function eyebrowClass(design: boolean, extra = "") {
  return design
    ? `font-mono text-[11px] uppercase tracking-eyebrow text-structure-on-canvas ${extra}`.trim()
    : `eyebrow ${extra}`.trim();
}

/** Small boundary so a malformed match can't white-screen the whole demo. */
class Boundary extends Component<{ children: ReactNode; design: boolean }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      const cls = this.props.design
        ? "mt-8 border-l-2 border-error bg-canvas-alt px-4 py-3 font-body text-sm text-foreground"
        : "mt-8 border-l-2 border-fit-adjacent bg-white px-4 py-3 font-body text-sm text-ink";
      return (
        <p className={cls}>
          We hit a snag rendering these results. Try rephrasing your description and running it again.
        </p>
      );
    }
    return this.props.children;
  }
}

function withinNinetyDays(deadline?: string): boolean {
  if (!deadline) return false;
  const t = Date.parse(deadline);
  if (Number.isNaN(t)) return false;
  const now = Date.now();
  return t >= now && t <= now + 90 * 864e5;
}

/**
 * Recompute the header funding figure from what we actually render. The raw
 * summary.fundingIdentified is 0 on every case because strong matches lack
 * opportunity.fundingHigh — so we fall back to fundingLow, then to the median
 * historical award, and finally to total awarded to similar companies.
 */
function fundingCell(shown: Match[]): { n: string; label: string } | null {
  const strong = shown.filter((m) => m.tier === "likely" || m.tier === "verify");

  // Prefer the programs' own stated funding ranges — that's real "potential funding".
  const stated = strong.reduce((acc, m) => acc + (m.opportunity.fundingHigh ?? m.opportunity.fundingLow ?? 0), 0);
  if (stated > 0) return { n: money(stated), label: "potential funding identified" };

  // Otherwise fall back to what similar companies actually received — and label
  // it honestly as such, not as this founder's potential funding.
  const median = strong.reduce((acc, m) => acc + (m.history?.medianAward ?? 0), 0);
  if (median > 0) return { n: money(median), label: "median award to similar companies" };

  const awarded = shown.reduce((acc, m) => acc + (m.history?.totalAwarded ?? 0), 0);
  if (awarded > 0) return { n: money(awarded), label: "awarded to similar companies" };

  return null; // Never show "$0+".
}

export default function OpportunityMap({ map }: { map: MapT }) {
  if (!map || typeof map !== "object") return null;

  // FE-01: gates the CON-02 USWDS restyle (60/30/10 tokens). Off = v1 look.
  const design = isFlagEnabled("r7_design");

  const matches: Match[] = Array.isArray(map.matches) ? map.matches : [];
  const followUps: string[] = Array.isArray(map.followUps) ? map.followUps : [];
  const agencyIntelligence = Array.isArray(map.agencyIntelligence) ? map.agencyIntelligence : [];
  const w = map.weakFieldFinding;

  // Cards: real fits only (likely / verify / adjacent), best first, capped.
  const shown = matches
    .filter((m) => m && m.tier !== "none")
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, CARD_CAP);

  // Header stats derived from what we render — keeps them honest and consistent.
  const highPotential = shown.filter((m) => m.tier === "likely" || m.tier === "verify").length;
  const closingSoon = shown.filter((m) => withinNinetyDays(m.opportunity?.deadline)).length;
  const funding = fundingCell(shown);

  const statGridClass = design
    ? "grid grid-cols-2 gap-px border border-structure-on-canvas bg-structure-on-canvas sm:grid-cols-4"
    : "grid grid-cols-2 gap-px border border-rule bg-rule sm:grid-cols-4";

  // "A finding, not a dead end" is the honest-no hero panel — navy structure
  // fill (white content on top), same pairing as the header/nav per R7.2.
  const weakFieldClass = design
    ? "mt-8 border border-structure bg-structure px-7 py-7 text-token-white"
    : "mt-8 border border-ink bg-ink px-7 py-7 text-paper";

  const weakFieldBodyClass = design
    ? "mt-3 max-w-2xl font-body text-[15px] leading-relaxed text-token-white"
    : "mt-3 max-w-2xl font-body text-[15px] leading-relaxed text-paper/85";

  // Full-opacity token.white throughout the panel rather than opacity
  // modifiers: Tailwind can't precompute alpha for CON-02's CSS-var-backed
  // colors at build time (only for v1's literal-hex theme colors), so an
  // opacity slash on these tokens silently doesn't apply. De-emphasis in v2
  // comes from type hierarchy, not color-fade.
  const redirectItemClass = design ? "border-l-2 border-token-white pl-4" : "border-l-2 border-paper/25 pl-4";

  const redirectWhyClass = design
    ? "mt-1 font-body text-[13px] leading-relaxed text-token-white"
    : "mt-1 font-body text-[13px] leading-relaxed text-paper/70";

  const followUpsSectionClass = design
    ? "mt-8 border border-structure-on-canvas bg-canvas-alt px-6 py-5"
    : "mt-8 border border-rule bg-white px-6 py-5";

  const followUpItemClass = design
    ? "font-body text-[14px] text-foreground"
    : "font-body text-[14px] text-slate-550";

  const agenciesSectionClass = design
    ? "mt-10 border-t border-structure-on-canvas pt-7"
    : "mt-10 border-t border-rule pt-7";

  const agencyCountClass = design ? "font-mono text-[11px] text-foreground" : "font-mono text-[11px] text-slate-550";

  const agencyWhyClass = design
    ? "mt-1.5 font-body text-[13px] leading-relaxed text-foreground"
    : "mt-1.5 font-body text-[13px] leading-relaxed text-slate-550";

  const footerClass = design
    ? "mt-10 border-t border-structure-on-canvas pt-5 font-body text-[12px] leading-relaxed text-foreground"
    : "mt-10 border-t border-rule pt-5 font-body text-[12px] leading-relaxed text-slate-550";

  return (
    <Boundary design={design}>
      <div className="reveal">
        {/* On a weak-field finding the honest panel is the hero — an empty
            "0 / $0" band above it would read as a failed query, so we drop it. */}
        {!w && (
          <div className={statGridClass}>
            <Cell design={design} n={String(highPotential)} label="high-potential opportunities" />
            {funding && <Cell design={design} n={funding.n} label={funding.label} />}
            <Cell design={design} n={String(agencyIntelligence.length)} label="relevant agencies" />
            <Cell design={design} n={String(closingSoon)} label="closing within 90 days" />
          </div>
        )}

        {/* The honest no. Deliberate, not an error state. */}
        {w && (
          <section className={weakFieldClass}>
            <p className={eyebrowClass(design)}>A finding, not a dead end</p>
            <h2 className="mt-3 font-display text-[24px] font-medium leading-snug">{w.headline}</h2>
            <p className={weakFieldBodyClass}>{w.reasoning}</p>

            {w.redirects?.length > 0 && (
              <>
                <p className={eyebrowClass(design, "mt-7")}>Where to look instead</p>
                <ul className="mt-3 grid gap-4 sm:grid-cols-2">
                  {w.redirects.map((r, i) => (
                    <li key={i} className={redirectItemClass}>
                      <p className="font-display text-[15px] font-medium">{r.label}</p>
                      <p className={redirectWhyClass}>{r.why}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        {followUps.length > 0 && (
          <section className={followUpsSectionClass}>
            <p className={eyebrowClass(design, "mb-3")}>A few things would sharpen this</p>
            <ul className="space-y-2">
              {followUps.map((q, i) => (
                <li key={i} className={followUpItemClass}>{q}</li>
              ))}
            </ul>
          </section>
        )}

        {shown.length > 0 && (
          <section className="mt-8">
            <p className={eyebrowClass(design, "mb-4")}>
              {w ? "Adjacent and partial matches" : "Your opportunity map"}
            </p>
            <div className="space-y-3">
              {shown.map((m, i) => (
                <OpportunityCard key={m.opportunity?.id ?? i} m={m} index={i} />
              ))}
            </div>
          </section>
        )}

        {agencyIntelligence.length > 0 && (
          <section className={agenciesSectionClass}>
            <p className={eyebrowClass(design, "mb-4")}>Agencies that matter most to you</p>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {agencyIntelligence.map((a) => (
                <div key={a.agency}>
                  <p className="font-display text-[15px] font-medium">{a.agency}</p>
                  <p className={agencyCountClass}>
                    {a.opportunityCount} {a.opportunityCount === 1 ? "opportunity" : "opportunities"}
                  </p>
                  <p className={agencyWhyClass}>{a.why}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <p className={footerClass}>
          These are assessments, not eligibility determinations. Confirm requirements with the
          program officer before you invest time in an application.
        </p>
      </div>
    </Boundary>
  );
}

function Cell({ design, n, label }: { design: boolean; n: string; label: string }) {
  const cellClass = design ? "bg-canvas-alt px-5 py-6 text-foreground" : "bg-paper px-5 py-6";
  return (
    <div className={cellClass}>
      <div className="font-display text-[30px] font-bold leading-none">{n}</div>
      <div className={eyebrowClass(design, "mt-2 leading-snug")}>{label}</div>
    </div>
  );
}
