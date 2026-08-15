// ============================================================================
// CAN-01 seed — load the v1 static corpus into the Supabase Canon store.
// ----------------------------------------------------------------------------
// Reads scaffold/data/opportunities.json (476 grants.gov records, 512-dim
// embeddings) and scaffold/data/awards.json (award history keyed by opportunity
// id), normalizes each record into a CanonOpportunity (STRUCTURED fields, not
// just the v1 mirrors — see lib/canon/CanonOpportunity.ts), and upserts them
// under an initial corpus snapshot.
//
// Run (from scaffold/), password already in env (never printed):
//   node --import tsx scripts/canon/seed-from-v1.mjs
//   npm run canon:seed
//
// Idempotent: re-running upserts by id (no duplicates) and re-upserts the same
// snapshot version (no error). Uses the transaction pooler via lib/canon/store.
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { CanonOpportunitySchema } from "../../lib/canon/CanonOpportunity.ts";
import {
  upsertOpportunities,
  upsertSnapshot,
  countOpportunities,
  closeStore,
} from "../../lib/canon/store.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "..", "data");

/** Initial snapshot for the v1 static import. Stable → re-runs are idempotent. */
const SNAPSHOT_VERSION = "v1-seed-001";

// --- helpers ---------------------------------------------------------------

/** Parse a v1 deadline (`MM/DD/YYYY`) into an ISO-8601 datetime, or undefined. */
function parseDeadlineToIso(deadline) {
  if (!deadline || typeof deadline !== "string") return undefined;
  const m = deadline.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return undefined;
  const [, mm, dd, yyyy] = m;
  const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

/**
 * Derive a Canon `status` (R8.3) from the v1 signals we have. Best-effort:
 * v1 records carry no explicit status. `forecasted` wins; otherwise a parseable
 * deadline in the future → open, in the past → closed; else unknown. Real
 * source-of-truth freshness checks are CAN-05, out of scope here.
 */
function deriveStatus(v1, closeIso, now) {
  if (v1.forecasted === true) return "forecasted";
  if (closeIso) return new Date(closeIso).getTime() > now ? "open" : "closed";
  return "unknown";
}

/** v1 id "grants-358687" → source-system id "358687". */
function deriveSourceId(id) {
  return typeof id === "string" && id.startsWith("grants-")
    ? id.slice("grants-".length)
    : id;
}

// --- main ------------------------------------------------------------------

async function main() {
  const opportunities = JSON.parse(
    readFileSync(join(DATA_DIR, "opportunities.json"), "utf8"),
  );
  const awards = JSON.parse(
    readFileSync(join(DATA_DIR, "awards.json"), "utf8"),
  );

  const retrievedAt = new Date().toISOString();
  const now = Date.now();

  let dimMismatch = 0;
  let withAwards = 0;

  const rows = opportunities.map((v1) => {
    if (!Array.isArray(v1.embedding) || v1.embedding.length !== 512) {
      dimMismatch++;
    }
    const closeIso = parseDeadlineToIso(v1.deadline);
    const status = deriveStatus(v1, closeIso, now);
    const awardHistory = awards[v1.id] ?? [];
    if (awardHistory.length > 0) withAwards++;

    // raw = original v1 record (minus the big embedding) + parked award history.
    const { embedding, ...v1NoEmbedding } = v1;
    const raw = { ...v1NoEmbedding, award_history: awardHistory };

    // Build the CONTRACT object and validate at the write boundary. Canon writes
    // populate the STRUCTURED fields (source_id/title/status/key_dates/
    // award_range/retrieved_at/eligibility_rules) — the normalization rule.
    const canonInput = {
      // v1 base / mirrors
      id: v1.id,
      source: v1.source,
      kind: v1.kind,
      program: v1.program,
      agency: v1.agency,
      description: v1.description,
      eligibility: v1.eligibility,
      fundingLow: v1.fundingLow,
      fundingHigh: v1.fundingHigh,
      deadline: v1.deadline,
      forecasted: v1.forecasted,
      industryTags: v1.industryTags,
      geography: v1.geography,
      url: v1.url,
      embedding: v1.embedding,

      // Canon structured (REQUIRED on a store row)
      source_id: deriveSourceId(v1.id),
      title: v1.program,
      status,
      key_dates: closeIso ? { close_date: closeIso } : {},
      award_range: {
        floor: v1.fundingLow,
        ceiling: v1.fundingHigh,
        currency: "USD",
      },
      retrieved_at: retrievedAt,
      eligibility_rules: [], // extraction is CAN-04; present-but-empty, never undefined
      corpus_version: SNAPSHOT_VERSION,
    };

    const canon = CanonOpportunitySchema.parse(canonInput);
    return { ...canon, raw };
  });

  const totalAwardRecords = Object.values(awards).reduce(
    (sum, list) => sum + (Array.isArray(list) ? list.length : 0),
    0,
  );

  console.log(
    `Loaded ${rows.length} opportunities (dim-mismatch: ${dimMismatch}), ` +
      `${withAwards} with award history, ${totalAwardRecords} award records total.`,
  );

  // 1) Snapshot first (opportunities.snapshot_version FKs to it).
  await upsertSnapshot({
    version: SNAPSHOT_VERSION,
    sourceCoverage: {
      "grants.gov": {
        opportunities: rows.length,
        kinds: ["grant"],
        with_embeddings: rows.filter((r) => Array.isArray(r.embedding)).length,
        with_award_history: withAwards,
        award_records: totalAwardRecords,
      },
      embedding_dims: 512,
      gaps: [
        "no SAM.gov contracts",
        "no SBIR/STTR topics",
        "no state/local/foundation funding",
        "eligibility_rules not yet extracted (CAN-04)",
      ],
      notes: "v1 static corpus import (scaffold/data/*.json).",
    },
    notes: "Initial CAN-01 seed of the v1 corpus.",
  });

  // 2) Opportunities (idempotent upsert by id).
  const written = await upsertOpportunities(rows, { concurrency: 16 });
  const total = await countOpportunities(SNAPSHOT_VERSION);

  console.log(
    `Upserted ${written} rows. Snapshot "${SNAPSHOT_VERSION}" now has ${total} opportunities.`,
  );

  if (dimMismatch > 0) {
    throw new Error(
      `${dimMismatch} record(s) did not have 512-dim embeddings — aborting to avoid truncation.`,
    );
  }

  await closeStore();
  console.log("Seed complete.");
}

main().catch(async (err) => {
  console.error("Seed failed:", err?.message ?? err);
  await closeStore().catch(() => {});
  process.exit(1);
});
