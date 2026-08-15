/**
 * Dev calibration harness — posts the five standard test cases to the running
 * dev server and prints strong-match counts, weak-field flags, and top matches.
 * Use during CALIBRATION tuning (lib/match.ts). NOT part of the data pipeline.
 *
 * Port note: Grafana holds :3000 on this machine, so `next dev` binds :3001.
 * Override with PORT env if needed:  PORT=3005 node scripts/dev-calibrate.mjs
 */
import { writeFile } from "node:fs/promises";

const PORT = process.env.PORT || "3001";
const CASES = [
  ["1 ai-healthcare", "We're a 15-person Utah company developing AI-powered software that helps hospitals reduce administrative work for nurses. We've raised $2.5M, have $1M in ARR, and are looking for $500K–$2M of non-dilutive capital to fund product development and hospital pilots."],
  ["2 manufacturing", "We're a 35-person Utah hardware startup doing advanced manufacturing for lightweight aerospace components. $3M in revenue, raised $8M, looking for $2M–$5M for manufacturing scale-up and R&D."],
  ["3 water", "We're a 10-person Utah startup with a sensor and AI platform that reduces municipal water loss. $500K revenue, raised $1.5M, seeking $500K–$3M for product development and municipal pilots."],
  ["4 cyber", "We're a 22-person Utah cybersecurity startup building AI-powered threat detection for small and mid-sized organizations. $2M ARR, raised $5M, seeking $1M–$3M for R&D and federal/commercial expansion."],
  ["5 marketplace", "We're an 8-person Utah technology startup running a marketplace connecting parents with local youth activities and enrichment programs. $750K revenue, raised $1M, looking for $250K–$1M for expansion and technology development."],
];

const out = [];
for (const [id, text] of CASES) {
  const t0 = Date.now();
  try {
    const res = await fetch(`http://localhost:${PORT}/api/match`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: text }),
    });
    if (!res.ok) { console.log(`${id.padEnd(16)} HTTP ${res.status} ${(await res.text()).slice(0, 120)}`); continue; }
    const m = await res.json();
    const strong = m.summary?.highPotential ?? "?";
    const weak = m.weakFieldFinding ? "YES" : "no";
    const tiers = {};
    (m.matches || []).forEach((x) => { tiers[x.tier] = (tiers[x.tier] || 0) + 1; });
    const top = (m.matches || []).slice(0, 5).map((x) => `${x.score}|${x.tier}|${(x.opportunity.agency || "").slice(0, 22)}|${(x.opportunity.program || "").slice(0, 42)}`);
    console.log(`${id.padEnd(16)} strong=${strong} weakField=${weak} tiers=${JSON.stringify(tiers)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    top.forEach((l) => console.log(`    ${l}`));
    out.push({ id, strong, weak, tiers, top, weakText: m.weakFieldFinding });
  } catch (e) { console.log(`${id.padEnd(16)} ERROR ${e.message}`); }
}
await writeFile("/tmp/calib_result.json", JSON.stringify(out, null, 2));
console.log("\nDONE — full results in /tmp/calib_result.json");
