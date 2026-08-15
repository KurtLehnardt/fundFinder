"use client";
import { useState } from "react";
import IntakeForm from "@/components/IntakeForm";
import OpportunityMap from "@/components/OpportunityMap";
import type { OpportunityMap as MapT } from "@/lib/types";
import AppMenu from "@/components/AppMenu";

// FE-01 / design revamp: the CON-02 USWDS 60/30/10 restyle is now the DEFAULT
// look on this A/B branch (previously gated behind r7_design). The token
// classes are applied unconditionally here.
export default function Home() {
  const [map, setMap] = useState<MapT | null>(null);

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
          The money is already there.<br />Finding it is the hard part.
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
