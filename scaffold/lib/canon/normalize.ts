import type { CanonOpportunity } from "./CanonOpportunity";

/**
 * normalize.ts — grants.gov source shape → the CON-01 `Opportunity` contract
 * (CAN-02).
 *
 * This is the scheduled-ingestion counterpart to the v1 one-time
 * `scripts/2-normalize.mjs`: same HTML-stripping / entity-decoding logic (that
 * part of v1 works and isn't reinvented here), but instead of guessing
 * `status`/`key_dates` from a single deadline string after the fact (as
 * `scripts/canon/seed-from-v1.mjs` has to, because the v1 static corpus only
 * kept `deadline`), this reads the STRUCTURED fields grants.gov actually
 * returns on a live pull — `oppHits[].openDate/closeDate/oppStatus` from
 * `search2`, plus `synopsis`/`forecast` detail from `fetchOpportunity` — so
 * Canon rows get real status/key_dates/award_range, not inferred ones.
 *
 * OUTPUT CONTRACT: `normalizeGrantsGovRecord` returns everything a
 * `CanonOpportunity` needs EXCEPT `embedding` (added by the ingest script
 * after batch-embedding descriptions) and is NOT itself validated — per the
 * CAN-02 brief, `CanonOpportunitySchema.parse(...)` is called at the write
 * boundary in `scripts/canon/ingest-grants.mjs`, once the embedding is
 * attached, so a malformed record fails loudly right before it would hit the
 * store rather than silently inside this module.
 */

// ---------------------------------------------------------------------------
// HTML stripping / entity decoding (grants.gov detail text is Office-pasted
// HTML). Ported from scripts/2-normalize.mjs — same behavior, typed.
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”",
  ndash: "–", mdash: "—", sect: "§", trade: "™",
  bull: "•", hellip: "…", copy: "©", reg: "®",
  atilde: "ã", eacute: "é", iacute: "í", ocirc: "ô",
};

const decodeEntitiesOnce = (s: string): string =>
  s
    .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);

// Only match real HTML tags (`<`/`</` immediately followed by a letter) so a
// bare comparison operator like "< 500 employees" is left alone.
const TAG_RE = /<\/?[a-zA-Z][^>]*>/g;

export const stripHtml = (html: string | null | undefined): string => {
  if (!html) return "";
  let text = html.replace(TAG_RE, " ");
  for (let i = 0; i < 3; i++) {
    const next = decodeEntitiesOnce(text);
    if (next === text) break;
    text = next;
  }
  return text
    .replace(TAG_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
};

// ---------------------------------------------------------------------------
// Date parsing — grants.gov uses two different string shapes across the
// search-hit and detail payloads.
// ---------------------------------------------------------------------------

/** search2 hit dates: "MM/DD/YYYY" (or "" for unset). */
export function parseSlashDate(s: string | null | undefined): string | undefined {
  if (!s || typeof s !== "string") return undefined;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return undefined;
  const [, mm, dd, yyyy] = m;
  const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** fetchOpportunity detail *Str fields: "YYYY-MM-DD-HH-mm-ss". */
export function parseDetailDateStr(s: string | null | undefined): string | undefined {
  if (!s || typeof s !== "string") return undefined;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})$/);
  if (!m) return undefined;
  const [, yyyy, mm, dd, hh, mi, ss] = m;
  const d = new Date(Date.UTC(
    Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss),
  ));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

// ---------------------------------------------------------------------------
// Status (R8.3)
// ---------------------------------------------------------------------------

/**
 * grants.gov oppStatus values (search2 `oppStatusOptions`): forecasted | posted
 * | closed | archived. Evergreen programs (rolling/continuous/standing) have no
 * deadline model (R8.3 — first-class statuses, per OpportunityStatusSchema); if
 * a source surfaces one of those values here it is passed through as-is rather
 * than collapsed to `unknown`. Anything unrecognized stays `unknown`.
 */
export function deriveStatus(oppStatus: string | null | undefined): CanonOpportunity["status"] {
  switch ((oppStatus ?? "").toLowerCase()) {
    case "forecasted": return "forecasted";
    case "posted": return "open";
    case "closed": return "closed";
    case "archived": return "closed"; // no longer accepting applications
    // Evergreen (deadline-less) statuses — first-class, not forced to "unknown".
    case "rolling": return "rolling";
    case "continuous": return "continuous";
    case "standing": return "standing";
    default: return "unknown";
  }
}

// ---------------------------------------------------------------------------
// Source shapes (only the fields this module reads; grants.gov returns more)
// ---------------------------------------------------------------------------

export interface GrantsGovSearchHit {
  id: string | number;
  number?: string;
  title?: string;
  agency?: string;
  agencyCode?: string;
  openDate?: string;
  closeDate?: string;
  oppStatus?: string;
  docType?: string;
  cfdaList?: string[];
}

export interface GrantsGovApplicantType {
  id?: string;
  description?: string;
}

/** The `synopsis` (posted) or `forecast` (forecasted) object from fetchOpportunity. */
export interface GrantsGovDetail {
  synopsisDesc?: string;
  forecastDesc?: string;
  applicantEligibilityDesc?: string;
  applicantTypes?: GrantsGovApplicantType[];
  awardFloor?: string | number | null;
  awardCeiling?: string | number | null;
  responseDateStr?: string;
  postingDateStr?: string;
}

export interface NormalizeGrantsGovInput {
  hit: GrantsGovSearchHit;
  /** Detail payload from fetchOpportunity, or null/undefined if that call failed/was skipped. */
  detail?: GrantsGovDetail | null;
  /** Every search keyword that surfaced this opportunity (search2 is per-keyword). */
  keywords: string[];
  /** ISO-8601 timestamp this record was retrieved at (R8.3 / §4.4 freshness). */
  retrievedAt: string;
  /** Corpus snapshot this record belongs to (§4.3 / R10.2). */
  snapshotVersion: string;
}

/** A CanonOpportunity minus `embedding` (added by the ingest script) and unvalidated. */
export type NormalizedGrantsGovOpportunity = Omit<CanonOpportunity, "embedding"> & {
  embedding?: number[];
  /** Retained original source record (§4.3) — a STORE concept, not a contract field. */
  raw: Record<string, unknown>;
};

const toNumber = (v: string | number | null | undefined): number | undefined => {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/**
 * Normalize one grants.gov opportunity (search hit + optional detail) into a
 * Canon store row shape. Populates the STRUCTURED fields (source_id, title,
 * status, key_dates, award_range, retrieved_at) per the normalization rule in
 * CanonOpportunity.ts — this is a live pull, so unlike the v1 seed we have
 * real dates/status from the source, not inferred ones.
 */
export function normalizeGrantsGovRecord(
  input: NormalizeGrantsGovInput,
): NormalizedGrantsGovOpportunity {
  const { hit, detail, keywords, retrievedAt, snapshotVersion } = input;
  const idNum = String(hit.id);
  const title = stripHtml(hit.title) || "Untitled opportunity";

  const descRaw = detail?.synopsisDesc ?? detail?.forecastDesc;
  const descText = stripHtml(descRaw);
  const eligText =
    stripHtml(detail?.applicantEligibilityDesc) ||
    stripHtml((detail?.applicantTypes ?? []).map((t) => t.description).filter(Boolean).join("; "));

  const openIso = parseSlashDate(hit.openDate) ?? parseDetailDateStr(detail?.postingDateStr);
  const closeIso = parseSlashDate(hit.closeDate) ?? parseDetailDateStr(detail?.responseDateStr);
  const responseIso = parseDetailDateStr(detail?.responseDateStr) ?? closeIso;

  const description = [title, descText, keywords[0]]
    .filter(Boolean)
    .join(". ")
    .slice(0, 4000);

  return {
    // v1 base / mirrors (unchanged live-pipeline shape)
    id: `grants-${idNum}`,
    source: "grants.gov",
    kind: "grant",
    program: title,
    agency: hit.agency ?? hit.agencyCode ?? "Unknown agency",
    description,
    eligibility: eligText || undefined,
    fundingLow: toNumber(detail?.awardFloor),
    fundingHigh: toNumber(detail?.awardCeiling),
    deadline: hit.closeDate || undefined,
    forecasted: (hit.oppStatus ?? "").toLowerCase() === "forecasted",
    industryTags: keywords.length ? keywords : undefined,
    geography: undefined,
    url: hit.id ? `https://www.grants.gov/search-results-detail/${hit.id}` : undefined,

    // Canon structured (REQUIRED on a store row — populated from live data)
    source_id: idNum,
    title,
    status: deriveStatus(hit.oppStatus),
    key_dates: {
      open_date: openIso,
      close_date: closeIso,
      response_date: responseIso,
    },
    award_range: {
      floor: toNumber(detail?.awardFloor),
      ceiling: toNumber(detail?.awardCeiling),
      currency: "USD",
    },
    retrieved_at: retrievedAt,
    eligibility_rules: [], // extraction is CAN-04; present-but-empty, never undefined
    corpus_version: snapshotVersion,

    // STORE concept, not a contract field — retained per §4.3.
    raw: { hit, detail: detail ?? null, keywords },
  };
}
