/**
 * Step 5 — Competitor & Grant Intelligence capture (R5, demo-first).
 *
 * A ONE-OFF capture, NOT a request-time route. For a single canonical persona
 * (FasterControl — the QMS/MES life-sciences software company behind the /demo
 * page), it:
 *
 *   1. RETRIEVES real awardee records from the keyless federal sources proven in
 *      docs/competitor-grant-analysis-feasibility.md §2 — USAspending, NIH
 *      RePORTER, NSF (fault-tolerant: a source that fails is skipped, not fatal).
 *   2. RERANKS them by cosine similarity to the persona description using
 *      lib/embed.ts (text-embedding-3-small @512), keeping the top-K.
 *   3. SYNTHESIZES grounded positioning feedback in ONE claude-sonnet-4-6 call
 *      (mirroring lib/claude.ts: per-call timeout < any route ceiling,
 *      maxRetries 0, fence-stripped JSON, cost metered via CostMeter). Every
 *      claim cites a retrieved record by the id assigned here.
 *   4. VALIDATES its own output through lib/contracts/competitorAnalysis.ts — a
 *      hallucinated award/citation THROWS here and the fixture is never written.
 *   5. WRITES data/demo-competitor-fastercontrol.json (real records + cited
 *      synthesis + capturedAt + persona).
 *
 * This spends a few cents of real OpenAI + Anthropic credit — authorized for the
 * capture. Run with the keys loaded:  `node --import tsx scripts/5-competitors.mjs`
 * (see package.json `data:competitors`). Re-run only to refresh the fixture.
 */
import { writeFile } from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { embed, cosine } from "../lib/embed.ts";
import { createCostMeter } from "../lib/metering/meter.ts";
import { CompetitorAnalysisSchema } from "../lib/contracts/competitorAnalysis.ts";

// ---------------------------------------------------------------------------
// Persona — reuse FasterControl so the fixture matches data/demo-fastercontrol
// .json and the /demo route (feasibility report §5, §9).
// ---------------------------------------------------------------------------
const PERSONA = "FasterControl";
const PERSONA_DESCRIPTION =
  "FasterControl is a Utah company building cloud-based quality management (QMS) and " +
  "manufacturing execution (MES) software for regulated life-sciences and manufacturing " +
  "customers. The platform handles electronic batch records, digital quality management, " +
  "deviation and CAPA workflows, and shop-floor manufacturing execution for companies that " +
  "must meet FDA and ISO quality requirements.";

const MODEL = "claude-sonnet-4-6";
const ANTHROPIC_TIMEOUT_MS = Number(process.env.ANTHROPIC_TIMEOUT_MS) || 100_000;
const KEEP_TOP_K = 8;
const MAX_ABSTRACT_CHARS = 4000;

/** Broad, gov-vocabulary keywords per source (over-narrow filters return []). */
const KEYWORDS = [
  "manufacturing execution system",
  "quality management system software",
  "smart manufacturing software",
  "digital quality management",
  "biomanufacturing quality control",
];

const meter = createCostMeter();

function trimAbstract(s) {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > MAX_ABSTRACT_CHARS ? t.slice(0, MAX_ABSTRACT_CHARS) + "…" : t;
}

function toAmount(v) {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ---------------------------------------------------------------------------
// [1] RETRIEVE — keyless federal sources (feasibility report §2)
// ---------------------------------------------------------------------------

async function fetchUsaspending() {
  const out = [];
  // USAspending rejects (HTTP 422) a request that MIXES grant codes (02-05) with
  // contract codes (A-D), so query each award-type group separately and merge.
  const TYPE_GROUPS = [
    ["02", "03", "04", "05"], // grants (incl. SBIR/STTR)
    ["A", "B", "C", "D"], // contracts / IDVs
  ];
  for (const kw of KEYWORDS) {
    for (const codes of TYPE_GROUPS) {
      try {
        const res = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filters: { keywords: [kw], award_type_codes: codes },
            fields: ["Award ID", "Recipient Name", "Award Amount", "Awarding Agency", "Description"],
            limit: 8,
            page: 1,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        for (const r of json?.results ?? []) {
          const desc = r["Description"];
          if (!desc || String(desc).trim().length < 40) continue;
          const gid = r["generated_internal_id"];
          out.push({
            source: "USAspending",
            recipient: r["Recipient Name"] || "(unnamed recipient)",
            amount: toAmount(r["Award Amount"]),
            agency: r["Awarding Agency"] || "Federal agency",
            program: r["Award ID"] ? `Award ${r["Award ID"]}` : undefined,
            abstract: trimAbstract(desc),
            sourceUrl: gid
              ? `https://www.usaspending.gov/award/${encodeURIComponent(gid)}`
              : "https://www.usaspending.gov/search",
          });
        }
      } catch (e) {
        console.warn(`  usaspending "${kw}" [${codes[0]}…] — ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  return out;
}

async function fetchNih() {
  const out = [];
  for (const kw of KEYWORDS) {
    try {
      const res = await fetch("https://api.reporter.nih.gov/v2/projects/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          criteria: {
            advanced_text_search: {
              operator: "and",
              search_field: "projecttitle,abstracttext",
              search_text: kw,
            },
          },
          include_fields: [
            "ProjectTitle", "Organization", "AwardAmount", "AgencyIcAdmin",
            "FiscalYear", "AbstractText", "ApplId", "ProjectNum",
          ],
          limit: 8,
          offset: 0,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      for (const r of json?.results ?? []) {
        const abstract = r.abstract_text;
        if (!abstract || String(abstract).trim().length < 40) continue;
        const applId = r.appl_id;
        out.push({
          source: "NIH RePORTER",
          recipient: r.organization?.org_name || "(unnamed organization)",
          amount: toAmount(r.award_amount),
          agency: r.agency_ic_admin?.name || "National Institutes of Health",
          program: r.project_num || (r.fiscal_year ? `FY${r.fiscal_year}` : undefined),
          abstract: trimAbstract(abstract),
          sourceUrl: applId
            ? `https://reporter.nih.gov/project-details/${encodeURIComponent(applId)}`
            : "https://reporter.nih.gov/",
          year: Number.isFinite(Number(r.fiscal_year)) ? Number(r.fiscal_year) : undefined,
        });
      }
    } catch (e) {
      console.warn(`  nih "${kw}" — ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 1100)); // NIH asks <= 1 req/sec sustained
  }
  return out;
}

async function fetchNsf() {
  const out = [];
  for (const kw of KEYWORDS) {
    try {
      const url = new URL("https://api.nsf.gov/services/v1/awards.json");
      url.searchParams.set("keyword", kw);
      url.searchParams.set(
        "printFields",
        "id,title,awardeeName,fundsObligatedAmt,startDate,abstractText,agency",
      );
      const res = await fetch(url); // NSF: no `rows` param (400s); default page = 25
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      for (const r of json?.response?.award ?? []) {
        const abstract = r.abstractText;
        if (!abstract || String(abstract).trim().length < 40) continue;
        const year = r.startDate ? Number(String(r.startDate).slice(-4)) : undefined;
        out.push({
          source: "NSF",
          recipient: r.awardeeName || "(unnamed awardee)",
          amount: toAmount(r.fundsObligatedAmt),
          agency: r.agency || "National Science Foundation",
          program: r.title ? undefined : undefined,
          abstract: trimAbstract(abstract),
          sourceUrl: r.id
            ? `https://www.nsf.gov/awardsearch/showAward?AWD_ID=${encodeURIComponent(r.id)}`
            : "https://www.nsf.gov/awardsearch/",
          year: Number.isFinite(year) ? year : undefined,
        });
      }
    } catch (e) {
      console.warn(`  nsf "${kw}" — ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return out;
}

// ---------------------------------------------------------------------------
// [3] SYNTHESIZE — one grounded claude-sonnet-4-6 call (lib/claude.ts pattern)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You analyze REAL federal award records to give a company grounded competitor & positioning feedback. You must never fabricate.

STRICT GROUNDING RULES:
- You may reference ONLY the award records supplied below, and ONLY by their exact "id".
- Never invent a company, amount, agency, award, or quote. Every quote must be copied VERBATIM from the referenced record's abstract.
- For each competitor you keep (choose the 4-6 most relevant to the company), write a short note on HOW THEY POSITIONED THEMSELVES to win federal funding, drawn only from that record's abstract, and include a short verbatim quotedSnippet from that same abstract.
- Then give 3-5 tailored recommendations for the company. EVERY recommendation must cite one or more record "id"s it is drawn from. If the evidence is thin, say so honestly rather than overstating.

OUTPUT: strict JSON only (no prose, no markdown fences), shape:
{
  "summary": "one grounded sentence about the funded landscape",
  "competitors": [ { "recordId": "<id>", "positioning": "<how they positioned to win>", "quotedSnippet": "<verbatim quote from that abstract>" } ],
  "recommendations": [ { "advice": "<tailored, specific advice>", "citations": ["<id>", ...] } ]
}`;

function parseJson(raw) {
  const clean = raw.replace(/```json/g, "").replace(/```/g, "").trim();
  return JSON.parse(clean);
}

async function synthesize(records) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set.");
  const client = new Anthropic({ apiKey: key, timeout: ANTHROPIC_TIMEOUT_MS, maxRetries: 0 });

  const evidence = records.map((r) => ({
    id: r.id,
    recipient: r.recipient,
    agency: r.agency,
    amount: r.amount,
    program: r.program,
    abstract: r.abstract,
  }));

  const t0 = performance.now();
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content:
          `COMPANY:\n${PERSONA} — ${PERSONA_DESCRIPTION}\n\n` +
          `RETRIEVED AWARD RECORDS (the ONLY evidence you may cite, by id):\n` +
          `${JSON.stringify(evidence, null, 2)}`,
      },
    ],
  });
  // R4b — record usage the instant the call resolves, before parseJson can throw.
  const usage = msg.usage ?? {};
  meter.record({
    stage: "competitor_analysis",
    provider: "anthropic",
    model: MODEL,
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    latencyMs: performance.now() - t0,
  });

  const text = msg.content.filter((c) => c.type === "text").map((c) => c.text).join("");
  return parseJson(text);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Persona: ${PERSONA}`);
  console.log("[1] Retrieving from USAspending + NIH RePORTER + NSF (keyless)…");
  const settled = await Promise.allSettled([fetchUsaspending(), fetchNih(), fetchNsf()]);
  const labels = ["USAspending", "NIH RePORTER", "NSF"];
  const raw = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") {
      console.log(`    ${labels[i].padEnd(14)} ${s.value.length} records`);
      raw.push(...s.value);
    } else {
      console.warn(`    ${labels[i].padEnd(14)} FAILED — ${s.reason?.message ?? "unknown"} (degraded)`);
    }
  });
  if (raw.length === 0) throw new Error("No records retrieved from any source — cannot build fixture.");

  // Dedup by recipient + first 80 abstract chars.
  const seen = new Set();
  const deduped = [];
  for (const r of raw) {
    const key = `${r.recipient.toLowerCase()}::${r.abstract.slice(0, 80).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
  }
  console.log(`    ${String(deduped.length).padStart(3)} unique records after dedup`);

  // [2] RERANK by cosine similarity to the persona (text-embedding-3-small @512).
  console.log("[2] Reranking by similarity to the persona (text-embedding-3-small @512)…");
  const personaVec = await embed(PERSONA_DESCRIPTION, meter);
  for (const r of deduped) {
    try {
      const v = await embed(`${r.recipient}. ${r.abstract}`, meter);
      r.similarity = cosine(personaVec, v);
    } catch (e) {
      r.similarity = 0;
      console.warn(`    embed failed for "${r.recipient}" — ${e.message}`);
    }
  }
  deduped.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));
  const kept = deduped.slice(0, KEEP_TOP_K).map((r, i) => ({
    id: `${r.source === "USAspending" ? "usa" : r.source === "NIH RePORTER" ? "nih" : "nsf"}_${i + 1}`,
    ...r,
    similarity: Number((r.similarity ?? 0).toFixed(4)),
  }));
  console.log(`    kept top ${kept.length}:`);
  for (const r of kept) console.log(`      ${r.id.padEnd(7)} ${(r.similarity).toFixed(3)}  ${r.recipient.slice(0, 48)}`);

  // [3] SYNTHESIZE — one grounded sonnet call.
  console.log("[3] Synthesizing grounded positioning feedback (claude-sonnet-4-6)…");
  const synthesis = await synthesize(kept);

  // Defense-in-depth: drop any competitor/citation the model invented before we
  // even validate (the schema would throw on them anyway — this keeps a stray
  // hallucination from failing the whole capture, and is honest: only grounded
  // claims survive).
  const validIds = new Set(kept.map((r) => r.id));
  const competitors = (synthesis.competitors ?? []).filter((c) => validIds.has(c.recordId));
  const recommendations = (synthesis.recommendations ?? [])
    .map((rec) => ({ ...rec, citations: (rec.citations ?? []).filter((id) => validIds.has(id)) }))
    .filter((rec) => rec.citations.length > 0);
  const droppedC = (synthesis.competitors?.length ?? 0) - competitors.length;
  const droppedR = (synthesis.recommendations?.length ?? 0) - recommendations.length;
  if (droppedC || droppedR) console.warn(`    dropped ${droppedC} ungrounded competitor(s), ${droppedR} ungrounded rec(s)`);

  const summaryCost = meter.summary();
  const fixture = {
    persona: PERSONA,
    personaDescription: PERSONA_DESCRIPTION,
    capturedAt: new Date().toISOString(),
    records: kept,
    analysis: {
      ...(synthesis.summary ? { summary: synthesis.summary } : {}),
      competitors,
      recommendations,
    },
    cost: {
      totalCostUsd: Number(summaryCost.totalCostUsd.toFixed(4)),
      pricingAsOf: summaryCost.pricingAsOf,
    },
  };

  // [4] VALIDATE through the grounding contract — throws on any ungrounded id.
  console.log("[4] Validating fixture through the grounding contract…");
  CompetitorAnalysisSchema.parse(fixture);

  // [5] WRITE.
  await writeFile("data/demo-competitor-fastercontrol.json", JSON.stringify(fixture, null, 2));
  console.log(
    `[5] Wrote data/demo-competitor-fastercontrol.json — ${kept.length} records, ` +
      `${competitors.length} competitors, ${recommendations.length} recommendations, ` +
      `~$${fixture.cost.totalCostUsd} spent.`,
  );
}

main().catch((err) => {
  console.error("Capture FAILED:", err.message);
  process.exit(1);
});
