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
    <main className="mx-auto max-w-4xl px-6 py-14 sm:py-20">
      <header className="mb-12">
        <p className="eyebrow">Sample opportunity map</p>
        <h1 className="mt-4 max-w-2xl font-display text-[40px] font-bold leading-[1.08] sm:text-[52px]">
          FasterControl
        </h1>
        <p className="mt-5 max-w-2xl font-body text-[16px] leading-relaxed text-slate-550">
          A Utah company building cloud-based quality management (QMS) and manufacturing
          execution software for regulated life-sciences and manufacturing customers. Here is the
          federal funding landscape we mapped for them — translated out of government vocabulary.
        </p>
      </header>

      <OpportunityMap map={map} />
    </main>
  );
}
