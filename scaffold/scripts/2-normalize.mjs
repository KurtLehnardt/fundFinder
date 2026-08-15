/**
 * Step 2 — collapse every source into one Opportunity schema.
 * Field names differ across APIs and change without notice; if a source
 * shape shifts, this is the only file you need to fix.
 */
import { readFile, writeFile } from "node:fs/promises";

const read = async (p, fallback = []) => {
  try { return JSON.parse(await readFile(p, "utf8")); } catch { return fallback; }
};

const grants = await read("data/raw/grants.json");
const sols = await read("data/raw/sbir-solicitations.json");
const awards = await read("data/raw/sbir-awards.json");

const opportunities = [];

for (const g of grants) {
  opportunities.push({
    id: `grants-${g.id ?? g.number}`,
    source: "grants.gov",
    kind: "grant",
    program: g.title ?? "Untitled opportunity",
    agency: g.agencyName ?? g.agencyCode ?? "Unknown agency",
    description: [g.title, g.synopsis, g._keyword].filter(Boolean).join(". ").slice(0, 4000),
    eligibility: g.eligibilityDesc ?? g.applicantTypes ?? "",
    fundingLow: Number(g.awardFloor) || undefined,
    fundingHigh: Number(g.awardCeiling) || undefined,
    deadline: g.closeDate ?? undefined,
    forecasted: (g.oppStatus ?? "").toLowerCase() === "forecasted",
    industryTags: [g._keyword].filter(Boolean),
    url: g.number ? `https://www.grants.gov/search-results-detail/${g.id}` : undefined,
  });
}

for (const s of sols) {
  opportunities.push({
    id: `sbir-${s.solicitation_id ?? s.solicitation_number}`,
    source: "sbir",
    kind: "rd",
    program: s.solicitation_title ?? "SBIR/STTR solicitation",
    agency: s.agency ?? "Unknown agency",
    description: [s.solicitation_title, s.description, (s.solicitation_topics ?? [])
      .map((t) => `${t.topic_title}: ${t.topic_description ?? ""}`).join(" ")]
      .filter(Boolean).join(". ").slice(0, 4000),
    eligibility: "US small business, generally under 500 employees",
    deadline: s.close_date ?? undefined,
    url: s.solicitation_agency_url ?? undefined,
  });
}

// Deduplicate and drop anything with no usable description to embed.
const seen = new Set();
const clean = opportunities.filter((o) => {
  if (!o.description || o.description.length < 60) return false;
  if (seen.has(o.id)) return false;
  seen.add(o.id);
  return true;
});

await writeFile("data/opportunities.json", JSON.stringify(clean, null, 2));

/**
 * Award history, keyed by opportunity id. Matched loosely by agency —
 * good enough for a prototype, and the numbers are what persuade a founder.
 */
const byOpp = {};
for (const o of clean) {
  const rel = awards.filter((a) => (a.agency ?? "").toLowerCase().includes(o.agency.toLowerCase().slice(0, 6)));
  if (rel.length === 0) continue;
  byOpp[o.id] = rel.slice(0, 12).map((a) => ({
    company: a.firm ?? "Unknown",
    program: a.program ?? "SBIR",
    agency: a.agency ?? "",
    amount: Number(a.award_amount) || 0,
    year: Number(a.award_year) || 0,
    state: a.state ?? "",
    sameVertical: true,
  })).filter((r) => r.amount > 0);
}
await writeFile("data/awards.json", JSON.stringify(byOpp, null, 2));

console.log(`→ ${clean.length} normalized opportunities`);
console.log(`→ award history for ${Object.keys(byOpp).length} of them`);
console.log("Next: npm run data:embed");
