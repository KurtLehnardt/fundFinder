"use client";
import { useState } from "react";
import Link from "next/link";
import IntakeForm from "@/components/IntakeForm";
import OpportunityMap from "@/components/OpportunityMap";
import type { OpportunityMap as MapT } from "@/lib/types";
import { isFlagEnabled } from "@/lib/flags";
import { useAuth } from "@/components/AuthProvider";
import { UserMenu } from "@/components/UserMenu";

export default function Home() {
  const [map, setMap] = useState<MapT | null>(null);

  // r9_0_mockauth (CON-03): flag off -> v1 path unchanged, no auth UI at all.
  // AuthProvider always wraps the app (app/layout.tsx), so this hook is always
  // safe to call; only the *rendering* of any auth surface is flag-gated.
  const mockAuthOn = isFlagEnabled("r9_0_mockauth");
  const { user, loading } = useAuth();

  // FE-01: gates the CON-02 USWDS restyle. Off = v1 look (unchanged), on =
  // 60/30/10 design-token look. One-flag revert — see lib/flags/registry.ts.
  const design = isFlagEnabled("r7_design");

  const mainClass = design
    ? "mx-auto min-h-screen max-w-4xl bg-canvas px-6 py-14 text-foreground sm:py-20"
    : "mx-auto max-w-4xl px-6 py-14 sm:py-20";

  const eyebrowClass = design
    ? "font-mono text-[11px] uppercase tracking-eyebrow text-structure-on-canvas"
    : "eyebrow";

  const h1Class = design
    ? "mt-4 max-w-2xl font-display text-[40px] font-bold leading-[1.08] text-structure-on-canvas sm:text-[52px]"
    : "mt-4 max-w-2xl font-display text-[40px] font-bold leading-[1.08] sm:text-[52px]";

  const subClass = design
    ? "mt-5 max-w-xl font-body text-[16px] leading-relaxed text-foreground"
    : "mt-5 max-w-xl font-body text-[16px] leading-relaxed text-slate-550";

  return (
    <main className={mainClass}>
      {mockAuthOn && !loading && (
        <div className="mb-6 flex justify-end">
          {user ? (
            <UserMenu />
          ) : (
            <Link
              href="/login"
              className="rounded-sm border border-rule bg-white px-3 py-1.5 font-mono text-[11px] uppercase tracking-eyebrow text-slate-550 transition hover:border-federal hover:text-federal"
            >
              Sign in
            </Link>
          )}
        </div>
      )}

      <header className="mb-12">
        <p className={eyebrowClass}>Federal funding intelligence</p>
        <h1 className={h1Class}>
          The money is already there.<br />Finding it is the hard part.
        </h1>
        <p className={subClass}>
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
