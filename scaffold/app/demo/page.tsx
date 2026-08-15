import OpportunityMap from "@/components/OpportunityMap";
import demoData from "@/data/demo-fastercontrol.json";
import type { OpportunityMap as MapT } from "@/lib/types";

export const metadata = {
  title: "FasterControl — Government Opportunity Map",
};

/**
 * Static demo route. Renders a pre-baked opportunity map for a sample company
 * (FasterControl) so it loads instantly with no live API call — useful for a
 * walkthrough regardless of venue wifi or API state. Regenerate the data with
 * the live matcher and overwrite data/demo-fastercontrol.json.
 */
export default function DemoPage() {
  const map = demoData as unknown as MapT;

  return (
    <main className="mx-auto min-h-screen max-w-4xl bg-canvas px-6 py-14 text-foreground sm:py-20">
      <header className="stagger mb-12">
        <p className="font-mono text-[11px] uppercase tracking-eyebrow text-structure-on-canvas">
          Sample opportunity map
        </p>
        <h1 className="mt-4 max-w-2xl text-balance font-display text-[40px] font-bold leading-[1.08] text-structure-on-canvas sm:text-[52px]">
          FasterControl
        </h1>
        <p className="mt-5 max-w-2xl text-pretty font-body text-[16px] leading-relaxed text-foreground">
          A Utah company building cloud-based quality management (QMS) and manufacturing
          execution software for regulated life-sciences and manufacturing customers. Here is the
          federal funding landscape we mapped for them — translated out of government vocabulary.
        </p>
      </header>

      <OpportunityMap map={map} />
    </main>
  );
}
