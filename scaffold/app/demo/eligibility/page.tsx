import EligibilityBuckets from "@/components/EligibilityBuckets";
import { SAMPLE_ELIGIBILITY_ITEMS } from "@/lib/eligibility/fixtures";
import { isFlagEnabled } from "@/lib/flags";

export const metadata = {
  title: "R8 eligibility screening — preview",
};

/**
 * FE-04 — Storybook-style preview of the ELG-01 three-bucket eligibility
 * DISPLAY (R8.2 / R7.3), rendered against hand-authored fixture data
 * (lib/eligibility/fixtures.ts).
 *
 * Gated behind the existing default-OFF `r8_eligibility` flag (lib/flags/registry.ts) —
 * this route does not add or rename a flag.
 *
 * WIRING lib/eligibility/screen.ts into the live pipeline (lib/match.ts /
 * OpportunityMap) so real determinations reach this component is a later
 * integration task; this route only proves out the display against fixtures.
 */
export default function EligibilityDemoPage() {
  const enabled = isFlagEnabled("r8_eligibility");

  if (!enabled) {
    return (
      <main className="mx-auto min-h-screen max-w-4xl bg-canvas px-6 py-14 text-foreground sm:py-20">
        <header>
          <p className="font-mono text-[11px] uppercase tracking-eyebrow text-structure-on-canvas">
            R8 eligibility screening
          </p>
          <h1 className="mt-4 max-w-2xl text-balance font-display text-[36px] font-bold leading-[1.08] text-structure-on-canvas sm:text-[44px]">
            Preview disabled
          </h1>
          <p className="mt-5 max-w-2xl text-pretty font-body text-[16px] leading-relaxed text-foreground">
            R8 eligibility screening preview is behind the default-off{" "}
            <code className="font-mono text-[14px]">r8_eligibility</code> flag — set{" "}
            <code className="font-mono text-[14px]">NEXT_PUBLIC_FLAG_R8_ELIGIBILITY=1</code> to preview.
          </p>
        </header>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-4xl bg-canvas px-6 py-14 text-foreground sm:py-20">
      <header className="stagger mb-12">
        <p className="font-mono text-[11px] uppercase tracking-eyebrow text-structure-on-canvas">
          R8 eligibility screening
        </p>
        <h1 className="mt-4 max-w-2xl text-balance font-display text-[40px] font-bold leading-[1.08] text-structure-on-canvas sm:text-[52px]">
          Eligibility buckets
        </h1>
        <p className="mt-5 max-w-2xl text-pretty font-body text-[16px] leading-relaxed text-foreground">
          A preview of the three-bucket eligibility display (ELG-01 / R8.2) against fixture
          determinations — eligible, conditionally eligible, needs more info, and excluded. Nothing
          here is a real screening result.
        </p>
      </header>

      <EligibilityBuckets items={SAMPLE_ELIGIBILITY_ITEMS} />
    </main>
  );
}
