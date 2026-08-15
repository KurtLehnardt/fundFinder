/**
 * One-off capture — regenerates data/demo-fastercontrol.json from the LIVE
 * matcher (/api/match) for the FasterControl demo persona, so the static
 * /demo route renders a real opportunity map instead of the "pending"
 * placeholder written when Anthropic credits were exhausted.
 *
 * Persona description mirrors the one in scripts/5-competitors.mjs (kept
 * verbatim for consistency with data/demo-competitor-fastercontrol.json and
 * the /demo route copy), extended with size/revenue/raise/ask details in the
 * same style as lib/testCases.ts.
 *
 * Same NDJSON-stream read pattern as scripts/4-precompute.mjs (H9): /api/match
 * streams {type:"progress"|"result"|"error"} lines, not a single JSON body.
 *
 * Run with the dev server up on the target PORT and the API keys loaded:
 *   PORT=3009 node scripts/6-demo-fastercontrol.mjs
 */
import { writeFile } from "node:fs/promises";

const PORT = process.env.PORT || "3009";

const DESCRIPTION =
  "FasterControl is a 28-person Utah company building cloud-based quality management (QMS) and " +
  "manufacturing execution (MES) software for regulated life-sciences and manufacturing " +
  "customers. The platform handles electronic batch records, digital quality management, " +
  "deviation and CAPA workflows, and shop-floor manufacturing execution for companies that " +
  "must meet FDA and ISO quality requirements. We have $2.8M in ARR, raised $6M, and are " +
  "seeking $1M–$3M of non-dilutive capital for R&D and regulatory validation work.";

async function readResultFromNdjson(res) {
  const body = await res.text();
  let map = null;
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let msg;
    try { msg = JSON.parse(trimmed); } catch { continue; }
    if (msg.type === "result") map = msg.map;
    else if (msg.type === "error") throw new Error(msg.error ?? "match failed");
  }
  return map;
}

console.log(`POST http://localhost:${PORT}/api/match (FasterControl persona)...`);
const res = await fetch(`http://localhost:${PORT}/api/match`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ description: DESCRIPTION }),
});

if (!res.ok) {
  let detail = "";
  try { detail = (await res.json())?.error ?? ""; } catch { /* non-JSON body */ }
  throw new Error(`FAILED ${res.status} ${detail}`.trim());
}

const map = await readResultFromNdjson(res);
if (!map) throw new Error("FAILED (stream ended without a result)");

const strong = map.summary?.highPotential ?? 0;
const weak = map.weakFieldFinding ? " + weak-field finding" : "";
const withElig = (map.matches ?? []).filter((m) => m.eligibility).length;
console.log(`${strong} strong matches${weak} · ${withElig}/${(map.matches ?? []).length} with eligibility`);
console.log(`agencies: ${(map.agencyIntelligence ?? []).map((a) => a.agency).join(", ")}`);

await writeFile("data/demo-fastercontrol.json", JSON.stringify(map, null, 2) + "\n");
console.log("→ wrote data/demo-fastercontrol.json");
