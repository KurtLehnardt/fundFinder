"use client";
import { useEffect, useState } from "react";
import IntakeForm from "@/components/IntakeForm";
import OpportunityMap from "@/components/OpportunityMap";
import type { OpportunityMap as MapT } from "@/lib/types";
import AppMenu from "@/components/AppMenu";
import { useAnalytics } from "@/components/AnalyticsProvider";

// FE-01 / design revamp: the CON-02 USWDS 60/30/10 restyle is now the DEFAULT
// look on this A/B branch (previously gated behind r7_design). The token
// classes are applied unconditionally here.
export default function Home() {
  const [map, setMap] = useState<MapT | null>(null);
  const analytics = useAnalytics();

  // H5 (R10.1) — funnel emit at the real "result shown" call site: when a map
  // renders. A normal result fires `first_result_rendered`; the honest-no
  // finding (weak field) fires `run_completed` with `honest_no`. Both are
  // counts/flags only (no description content), and no-op unless r10_analytics
  // is on. Keyed on the map object (a fresh one per search) so it fires once.
  useEffect(() => {
    if (!map) return;
    const resultsShown = map.matches.length;
    if (resultsShown > 0) {
      analytics.firstResultRendered({
        results_shown: resultsShown,
        high_potential: map.summary.highPotential,
      });
    }
    if (map.weakFieldFinding) {
      analytics.runCompleted({ honest_no: true, high_potential: map.summary.highPotential });
    } else if (resultsShown === 0) {
      analytics.runCompleted({ results_shown: 0 });
    }
    // analytics identity is stable (useMemo in the provider); map drives this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  return (
    <main className="mx-auto min-h-screen max-w-4xl bg-canvas px-6 py-14 text-foreground sm:py-20">
      {/*
        FE-06: single nav cluster — hamburger (Settings, always present) +
        the PLT-01 mock-auth surface (UserMenu / "Sign in", flag-gated,
        unchanged behavior) now both live inside AppMenu instead of being
        split across an inline block here.
      */}
      <div className="mb-6">
        <AppMenu />
      </div>

      {/* Split-and-stagger hero entrance (polish): eyebrow → headline → sub
          rise in sequence on first load. Reduced-motion disables it globally. */}
      <header className="stagger mb-12">
        <p className="font-mono text-[11px] uppercase tracking-eyebrow text-structure-on-canvas">
          Federal funding intelligence
        </p>
        <h1 className="mt-4 max-w-2xl text-balance font-display text-[40px] font-bold leading-[1.08] text-structure-on-canvas sm:text-[52px]">
          Grant funds are waiting<br />Let's find your match
        </h1>
        <p className="mt-5 max-w-xl text-pretty font-body text-[16px] leading-relaxed text-foreground">
          Describe your company the way you'd describe it to another founder. We'll translate it
          into the language the federal government uses — and tell you plainly when there's
          nothing worth chasing.
        </p>
      </header>

      <IntakeForm onResult={setMap} />

      {map && (
        <div className="mt-14">
          <OpportunityMap map={map} />
        </div>
      )}
    </main>
  );
}
