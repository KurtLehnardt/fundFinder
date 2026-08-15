/**
 * Step 1 — pull raw data from the government APIs into data/raw/.
 * Run on your laptop; these hosts are the slow, flaky part of the whole build.
 * Nothing here runs at request time.
 */
import { writeFile, mkdir } from "node:fs/promises";

await mkdir("data/raw", { recursive: true });

/** Keywords shaped around the five standard test cases. Widen if you add cases. */
const KEYWORDS = [
  "artificial intelligence", "health information technology", "nursing workforce",
  "advanced manufacturing", "aerospace materials", "lightweight structures",
  "water infrastructure", "environmental sensors", "climate technology",
  "cybersecurity", "threat detection", "small business innovation",
  "workforce development", "youth programs", "community development",
];

async function grantsGov() {
  const out = [];
  for (const kw of KEYWORDS) {
    try {
      const res = await fetch("https://api.grants.gov/v1/api/search2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: 50, keyword: kw, oppStatuses: "forecasted|posted" }),
      });
      const json = await res.json();
      const hits = json?.data?.oppHits ?? [];
      out.push(...hits.map((h) => ({ ...h, _keyword: kw })));
      console.log(`grants.gov  ${kw.padEnd(32)} ${hits.length}`);
    } catch (e) {
      console.warn(`grants.gov  ${kw} FAILED — ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  await writeFile("data/raw/grants.json", JSON.stringify(out, null, 2));
  console.log(`\n→ ${out.length} grants.gov records\n`);
}

async function sbir() {
  const out = [];
  // Solicitations that are currently open.
  try {
    const res = await fetch("https://api.www.sbir.gov/public/api/solicitations?open=1&rows=200");
    out.push(...(await res.json()));
    console.log(`sbir solicitations ${out.length}`);
  } catch (e) {
    console.warn(`sbir solicitations FAILED — ${e.message}`);
  }
  await writeFile("data/raw/sbir-solicitations.json", JSON.stringify(out, null, 2));

  // Historical awards, for the "who else got this money" panel.
  const awards = [];
  for (const kw of KEYWORDS.slice(0, 8)) {
    try {
      const res = await fetch(
        `https://api.www.sbir.gov/public/api/awards?keyword=${encodeURIComponent(kw)}&rows=100`
      );
      const rows = await res.json();
      awards.push(...(Array.isArray(rows) ? rows : []));
      console.log(`sbir awards ${kw.padEnd(32)} ${rows.length ?? 0}`);
    } catch (e) {
      console.warn(`sbir awards ${kw} FAILED — ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  await writeFile("data/raw/sbir-awards.json", JSON.stringify(awards, null, 2));
  console.log(`\n→ ${awards.length} SBIR award records\n`);
}

async function usaspending() {
  // Utah recipients, recent years — keeps the pull small and the demo local.
  const body = {
    filters: {
      time_period: [{ start_date: "2021-01-01", end_date: "2026-08-01" }],
      award_type_codes: ["02", "03", "04", "05"],
      place_of_performance_locations: [{ country: "USA", state: "UT" }],
    },
    fields: ["Award ID", "Recipient Name", "Awarding Agency", "Award Amount", "Start Date"],
    page: 1,
    limit: 100,
    sort: "Award Amount",
    order: "desc",
  };
  try {
    const res = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    await writeFile("data/raw/usaspending.json", JSON.stringify(json?.results ?? [], null, 2));
    console.log(`→ ${json?.results?.length ?? 0} USAspending records\n`);
  } catch (e) {
    console.warn(`usaspending FAILED — ${e.message}`);
    await writeFile("data/raw/usaspending.json", "[]");
  }
}

await grantsGov();
await sbir();
await usaspending();
console.log("Raw data in data/raw/. Next: npm run data:normalize");
