"use client";
import { useState } from "react";
import IntakeForm from "@/components/IntakeForm";
import OpportunityMap from "@/components/OpportunityMap";

export default function Home() {
  const [map, setMap] = useState<any>(null);

  return (
    <main className="mx-auto max-w-4xl px-6 py-14 sm:py-20">
      <header className="mb-12">
        <p className="eyebrow">Federal funding intelligence</p>
        <h1 className="mt-4 max-w-2xl font-display text-[40px] font-bold leading-[1.08] sm:text-[52px]">
          The money is already there.<br />Finding it is the hard part.
        </h1>
        <p className="mt-5 max-w-xl font-body text-[16px] leading-relaxed text-slate-550">
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
