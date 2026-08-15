import { getOpportunityById } from "./store";
import type { OpportunitySource, OpportunityStatus } from "../contracts/opportunity";

/**
 * freshness.ts — live freshness-check service (CAN-05).
 *
 * R8.3 / §4.4 / §4.6: every actionable opportunity must show CURRENT status
 * (forecasted/open/closed) + close date + days-remaining, checked against the
 * source at display time — regardless of how fresh the corpus cache is.
 * A closed solicitation must never be presented as open. Rolling/continuous/
 * standing programs report that status, not a fake deadline. A source outage
 * degrades ONE source (per-source circuit breaker) and says what's missing —
 * it never lets the rest of the run fail, and it never asserts a cached
 * status is current when it couldn't actually be re-verified.
 *
 * SCOPE (per the CAN-05 brief): grants.gov only, via `fetchOpportunity`. This
 * module is NOT wired into route.ts or ELG-02 — it is a standalone service
 * `checkFreshness(ids)` for a later slice to call for the surfaced/actionable
 * set only (never the whole corpus — that's what the short-TTL cache and
 * circuit breaker are sized for).
 *
 * WHY STATUS IS RE-DERIVED FROM DATES, NOT TRUSTED FROM A FIELD
 * ---------------------------------------------------------------
 * grants.gov exposes two endpoints with different shapes:
 *   - `search2` (used by the batch ingest, CAN-02) returns a per-hit
 *     `oppStatus` field: forecasted | posted | closed | archived.
 *   - `fetchOpportunity` (the live single-id lookup used here) does NOT
 *     return that field at all. Verified live (Aug 2026) against a
 *     known-closed seeded opportunity (id 360339, corpus status "closed",
 *     close_date 2026-08-14): the response still carries a `synopsis` object
 *     (grants.gov's "posted" shape) with no closed/archived flag anywhere in
 *     the payload — only `synopsis.responseDateStr` ("2026-08-14-00-00-00"),
 *     which is in the past relative to the request.
 *   So a posted (`synopsis`-bearing) record is re-classified "closed" here
 *   iff its response date has already passed, rather than trusting a status
 *   flag grants.gov doesn't actually send back on this endpoint. This is
 *   MORE reliable than a trusted flag, not less: it can't go stale between
 *   grants.gov's own status-flip batch job and this check.
 *   A `forecast`-only record (no `synopsis` yet) is "forecasted" — its
 *   `estApplicationResponseDate*` is an ESTIMATE, not a real deadline, so it
 *   is never surfaced as `close_date` (no fake deadlines, per the DoD).
 *   A response with neither `synopsis` nor `forecast` (grants.gov returns
 *   `errorcode: 0` + `data.errorMessages: ["There is no record found..."]`
 *   for a delisted/unknown id — verified live) means the id is no longer an
 *   active record on the source; that is reported as "closed" (never
 *   "open"), distinct from `freshness_unavailable` (which is reserved for
 *   the source being unreachable/slow, not for a successful call telling us
 *   the record is gone).
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface FreshnessResult {
  /** Canon opportunity id, e.g. "grants-360339". */
  id: string;
  /** Resolved source, "unknown" if the id doesn't map to one we recognize. */
  source: OpportunitySource | "unknown";
  /**
   * Live status as of `checked_at`. `null` iff `freshness_unavailable` is
   * true — a degraded check NEVER guesses a status.
   */
  status: OpportunityStatus | null;
  /** ISO-8601 close/response date, when the status has a real one. */
  close_date?: string;
  /**
   * ceil((close_date - checked_at) / 1 day). Positive while still open,
   * <= 0 once past close_date. Absent when there is no real close_date
   * (forecasted / rolling / continuous / standing / not-found / unavailable)
   * — never synthesized.
   */
  days_remaining?: number;
  /** When this determination was made (live check time, or cache-write time on a hit). */
  checked_at: string;
  /** Whether this result was served from the short-TTL cache. */
  cache: "hit" | "miss";
  /**
   * True when the source could not be re-verified this call (circuit open,
   * timeout, transport/HTTP failure, or no live adapter for this source).
   * §4.6: degrade + flag — never assert a cached status is current.
   */
  freshness_unavailable?: boolean;
  /** Human-readable explanation — present on not-found / unavailable results. */
  reason?: string;
  /**
   * Best-effort context pulled from the Canon store when freshness is
   * unavailable. This is explicitly the STALE cached view — it is never
   * promoted into `status`/`close_date` above, so a caller can't accidentally
   * treat it as current.
   */
  last_known?: {
    status: OpportunityStatus | null;
    close_date?: string;
    retrieved_at?: string;
  };
}

export interface CheckFreshnessOptions {
  /** Override "now" for deterministic testing/verification. Default `new Date()`. */
  now?: Date;
  /** Cache TTL in ms. Default {@link DEFAULT_CACHE_TTL_MS}. */
  ttlMs?: number;
  /** Per-request timeout before a call counts as a circuit-breaker failure. Default 8000ms. */
  timeoutMs?: number;
  /** Injectable fetch — for tests / simulating a source outage. Default global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Max concurrent live requests. Default 5 (grants.gov's detail endpoint is slow one-at-a-time). */
  concurrency?: number;
  /** Bypass the cache and force a live re-check for every id. Default false. */
  skipCache?: boolean;
}

// ---------------------------------------------------------------------------
// Cache — short TTL by design
// ---------------------------------------------------------------------------
//
// Deadlines change on publication schedules (an agency edits a NOFO), not by
// the second — but R8.3 requires the ACTIONABLE set to be re-verified "at
// display time," so the TTL has to be short enough that two displays of the
// same opportunity a few minutes apart both count as "checked live," while
// still absorbing bursts (a user re-rendering the same result list, ELG-02
// re-checking the same handful of ids within one request/session) without
// re-hitting grants.gov every time. 10 minutes is the balance point: short
// relative to how often a solicitation's status actually flips (hours/days),
// long enough to make repeated checks within one browsing session free.
// Override via `ttlMs` if a caller needs something tighter/looser.

export const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface CacheEntry {
  result: FreshnessResult;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Clear the freshness cache. Exposed for tests/ops; not needed in normal use. */
export function clearFreshnessCache(): void {
  cache.clear();
}

// ---------------------------------------------------------------------------
// Per-source circuit breaker
// ---------------------------------------------------------------------------
//
// Keyed by source ("grants.gov" today; forward-compatible with CAN-03's
// other source adapters). Trips after CIRCUIT_FAILURE_THRESHOLD consecutive
// failures (HTTP error, timeout, malformed response) on that source, then
// short-circuits every subsequent call for that source — no network call at
// all — for CIRCUIT_COOLDOWN_MS, after which exactly one probe call is let
// through (half-open) to test recovery. This is what turns "grants.gov is
// down" into "these items are flagged freshness_unavailable" instead of
// either (a) hanging the whole batch behind retries, or (b) silently
// asserting the cached status is still current.

export const CIRCUIT_FAILURE_THRESHOLD = 3;
export const CIRCUIT_COOLDOWN_MS = 30_000; // 30s before probing a tripped source again

type CircuitState = "closed" | "open" | "half_open";

interface CircuitRecord {
  state: CircuitState;
  consecutiveFailures: number;
  openedAt: number | null;
  /** True while a half-open probe is in flight — prevents a thundering herd of probes. */
  probing: boolean;
}

const circuits = new Map<string, CircuitRecord>();

function getCircuit(source: string): CircuitRecord {
  let c = circuits.get(source);
  if (!c) {
    c = { state: "closed", consecutiveFailures: 0, openedAt: null, probing: false };
    circuits.set(source, c);
  }
  return c;
}

/** Returns true iff this call may hit the network for `source` right now. */
function circuitAcquire(source: string, nowMs: number): boolean {
  const c = getCircuit(source);
  if (c.state === "closed") return true;
  if (c.state === "open") {
    if (c.openedAt !== null && nowMs - c.openedAt >= CIRCUIT_COOLDOWN_MS && !c.probing) {
      c.state = "half_open";
      c.probing = true;
      return true;
    }
    return false;
  }
  // half_open: only one probe in flight at a time.
  if (!c.probing) {
    c.probing = true;
    return true;
  }
  return false;
}

function circuitRecordSuccess(source: string): void {
  const c = getCircuit(source);
  c.state = "closed";
  c.consecutiveFailures = 0;
  c.openedAt = null;
  c.probing = false;
}

function circuitRecordFailure(source: string, nowMs: number): void {
  const c = getCircuit(source);
  c.consecutiveFailures += 1;
  c.probing = false;
  if (c.state === "half_open" || c.consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD) {
    c.state = "open";
    c.openedAt = nowMs;
  }
}

/** Read-only circuit-breaker state, for ops visibility / tests. */
export function getCircuitBreakerState(source: string): CircuitState {
  return getCircuit(source).state;
}

/** Reset all circuit breakers. Exposed for tests; not needed in normal use. */
export function resetCircuitBreakers(): void {
  circuits.clear();
}

// ---------------------------------------------------------------------------
// grants.gov fetchOpportunity — shapes (subset actually read here)
// ---------------------------------------------------------------------------

const GRANTS_GOV_FETCH_URL = "https://api.grants.gov/v1/api/fetchOpportunity";
const GRANTS_GOV_SOURCE: OpportunitySource = "grants.gov";

interface GrantsGovSynopsis {
  responseDate?: string;
  responseDateStr?: string;
}

interface GrantsGovForecast {
  estApplicationResponseDateStr?: string;
}

interface GrantsGovFetchOpportunityData {
  id?: number;
  synopsis?: GrantsGovSynopsis | null;
  forecast?: GrantsGovForecast | null;
  errorMessages?: string[];
}

interface GrantsGovFetchOpportunityResponse {
  errorcode?: number;
  msg?: string;
  data?: GrantsGovFetchOpportunityData;
}

/** detail *Str fields: "YYYY-MM-DD-HH-mm-ss" (same convention CAN-02's normalize.ts uses). */
function parseDetailDateStr(s: string | null | undefined): string | undefined {
  if (!s || typeof s !== "string") return undefined;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})$/);
  if (!m) return undefined;
  const [, yyyy, mm, dd, hh, mi, ss] = m;
  const d = new Date(
    Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss)),
  );
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Calls fetchOpportunity for one grants.gov id. Throws on any failure (network, timeout, HTTP, parse). */
async function fetchGrantsGovDetail(
  sourceId: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<GrantsGovFetchOpportunityData> {
  const res = await fetchWithTimeout(
    GRANTS_GOV_FETCH_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId: Number(sourceId) }),
    },
    timeoutMs,
    fetchImpl,
  );
  if (!res.ok) {
    throw new Error(`grants.gov fetchOpportunity HTTP ${res.status}`);
  }
  const json = (await res.json()) as GrantsGovFetchOpportunityResponse;
  // errorcode 0 = "Webservice Succeeds" even for a not-found id (it comes
  // back as data.errorMessages instead) — only a non-zero errorcode is a
  // genuine API-level failure worth counting against the circuit breaker.
  if (typeof json?.errorcode === "number" && json.errorcode !== 0) {
    throw new Error(`grants.gov fetchOpportunity errorcode ${json.errorcode}: ${json.msg ?? "unknown"}`);
  }
  return json?.data ?? {};
}

// ---------------------------------------------------------------------------
// Status derivation (the R8.3 core)
// ---------------------------------------------------------------------------

interface DerivedLiveStatus {
  status: OpportunityStatus;
  closeDateIso?: string;
  notFound?: boolean;
}

/**
 * `lastKnownStatus` (from the Canon store) is consulted ONLY to preserve a
 * rolling/continuous/standing classification for an open-ended posting
 * (synopsis present, no response date) — grants.gov's own data model has no
 * such concept (its statuses are forecasted/posted/closed/archived), so this
 * is how a more specific existing classification survives a live re-check
 * instead of being flattened to generic "open." It is NEVER used to override
 * a date-based open/closed determination.
 */
function deriveLiveStatus(
  detail: GrantsGovFetchOpportunityData,
  now: Date,
  lastKnownStatus: OpportunityStatus | null | undefined,
): DerivedLiveStatus {
  const hasSynopsis = !!detail.synopsis;
  const hasForecast = !!detail.forecast;

  if (!hasSynopsis && !hasForecast) {
    // grants.gov has no active record for this id at all — never "open".
    return { status: "closed", notFound: true };
  }

  if (hasForecast && !hasSynopsis) {
    // Not yet posted. estApplicationResponseDate* is an ESTIMATE — never
    // surfaced as close_date (no fake deadlines).
    return { status: "forecasted" };
  }

  // hasSynopsis (posted). Re-derive open/closed from the real date — see
  // the module header for why this endpoint's status flag can't be trusted.
  const closeIso = parseDetailDateStr(detail.synopsis?.responseDateStr);
  if (!closeIso) {
    // Posted with no response date: open-ended. Preserve a more specific
    // rolling/continuous/standing classification if the store already had
    // one; otherwise it's just "open" with no deadline.
    if (
      lastKnownStatus === "rolling" ||
      lastKnownStatus === "continuous" ||
      lastKnownStatus === "standing"
    ) {
      return { status: lastKnownStatus };
    }
    return { status: "open" };
  }
  const isClosed = new Date(closeIso).getTime() < now.getTime();
  return { status: isClosed ? "closed" : "open", closeDateIso: closeIso };
}

function daysRemaining(closeDateIso: string | undefined, now: Date): number | undefined {
  if (!closeDateIso) return undefined;
  const ms = new Date(closeDateIso).getTime() - now.getTime();
  return Math.ceil(ms / 86_400_000);
}

// ---------------------------------------------------------------------------
// checkFreshness — public entry point
// ---------------------------------------------------------------------------

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

const GRANTS_GOV_ID_RE = /^grants-(\d+)$/;

async function checkOne(
  id: string,
  ctx: { now: Date; nowMs: number; ttlMs: number; timeoutMs: number; fetchImpl: typeof fetch; skipCache: boolean },
): Promise<FreshnessResult> {
  const { now, nowMs, ttlMs, timeoutMs, fetchImpl, skipCache } = ctx;

  if (!skipCache) {
    const cached = cache.get(id);
    if (cached && cached.expiresAt > nowMs) {
      return { ...cached.result, cache: "hit" };
    }
  }

  // Resolve source_id from the id convention CAN-02 writes (`grants-<id>`).
  // Fall back to a store lookup for ids that don't match it (reuses
  // store.ts, and covers a future id scheme / a not-yet-normalized id).
  let source: OpportunitySource | "unknown" = "unknown";
  let sourceId: string | undefined;
  let lastKnown: FreshnessResult["last_known"] | undefined;
  let lastKnownStatus: OpportunityStatus | null | undefined;

  const m = id.match(GRANTS_GOV_ID_RE);
  if (m) {
    source = GRANTS_GOV_SOURCE;
    sourceId = m[1];
  }

  // Store lookup: fills in last_known context for degraded results, and is
  // the fallback path for resolving source/source_id when the id doesn't
  // match the grants.gov convention. A store failure is OUR infrastructure,
  // not the external "source" the circuit breaker guards — degrade silently
  // (row stays null) rather than failing the whole freshness check.
  try {
    const row = await getOpportunityById(id);
    if (row) {
      lastKnownStatus = row.status ?? null;
      lastKnown = {
        status: row.status ?? null,
        close_date: row.key_dates?.close_date,
        retrieved_at: row.retrieved_at,
      };
      if (!m) {
        if (row.source === "grants.gov" && row.source_id) {
          source = "grants.gov";
          sourceId = row.source_id;
        } else {
          source = row.source;
        }
      }
    }
  } catch {
    // Store unavailable — proceed with whatever the id pattern already gave us.
  }

  if (source !== "grants.gov" || !sourceId) {
    const result: FreshnessResult = {
      id,
      source,
      status: null,
      checked_at: now.toISOString(),
      cache: "miss",
      freshness_unavailable: true,
      reason:
        source === "unknown"
          ? "id not recognized (not in the Canon store, no known source adapter)"
          : `no live freshness adapter for source "${source}" yet (CAN-03)`,
      ...(lastKnown ? { last_known: lastKnown } : {}),
    };
    return result;
  }

  if (!circuitAcquire(source, nowMs)) {
    const result: FreshnessResult = {
      id,
      source,
      status: null,
      checked_at: now.toISOString(),
      cache: "miss",
      freshness_unavailable: true,
      reason: `${source} circuit breaker open (degraded source) — freshness not re-verified, not asserting the cached status is current`,
      ...(lastKnown ? { last_known: lastKnown } : {}),
    };
    return result;
  }

  let detail: GrantsGovFetchOpportunityData;
  try {
    detail = await fetchGrantsGovDetail(sourceId, timeoutMs, fetchImpl);
    circuitRecordSuccess(source);
  } catch (err) {
    circuitRecordFailure(source, nowMs);
    const message = err instanceof Error ? err.message : String(err);
    const result: FreshnessResult = {
      id,
      source,
      status: null,
      checked_at: now.toISOString(),
      cache: "miss",
      freshness_unavailable: true,
      reason: `${source} fetchOpportunity failed: ${message}`,
      ...(lastKnown ? { last_known: lastKnown } : {}),
    };
    return result;
  }

  const derived = deriveLiveStatus(detail, now, lastKnownStatus);
  const result: FreshnessResult = {
    id,
    source,
    status: derived.status,
    ...(derived.closeDateIso ? { close_date: derived.closeDateIso } : {}),
    ...(daysRemaining(derived.closeDateIso, now) !== undefined
      ? { days_remaining: daysRemaining(derived.closeDateIso, now) }
      : {}),
    checked_at: now.toISOString(),
    cache: "miss",
    ...(derived.notFound
      ? { reason: "grants.gov has no current record for this opportunity id" }
      : {}),
  };

  cache.set(id, { result, expiresAt: nowMs + ttlMs });
  return result;
}

/**
 * Re-verify current status + close date + days-remaining for a small set of
 * Canon opportunity ids, live against their source (grants.gov, via
 * `fetchOpportunity`), for the actionable set at display time (R8.3 / §4.4).
 *
 * - Only re-fetches the ids passed in — never the whole corpus.
 * - A closed opportunity is ALWAYS returned with `status: "closed"`, never
 *   `"open"` (re-derived from the real close date; see module header).
 * - Rolling/continuous/standing programs return that status, not a
 *   synthesized deadline.
 * - Results are served from a {@link DEFAULT_CACHE_TTL_MS} (10 min) cache
 *   unless `options.skipCache` is set.
 * - If grants.gov is down/slow enough to trip the per-source circuit
 *   breaker (see {@link CIRCUIT_FAILURE_THRESHOLD} /
 *   {@link CIRCUIT_COOLDOWN_MS}), affected items come back with
 *   `freshness_unavailable: true` and a `last_known` (explicitly stale)
 *   snapshot from the Canon store — never a false "open".
 *
 * Preserves the order (and duplicates) of the input `ids` array.
 */
export async function checkFreshness(
  ids: string[],
  options: CheckFreshnessOptions = {},
): Promise<FreshnessResult[]> {
  if (ids.length === 0) return [];

  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  const ttlMs = options.ttlMs ?? DEFAULT_CACHE_TTL_MS;
  const timeoutMs = options.timeoutMs ?? 8000;
  const fetchImpl = options.fetchImpl ?? fetch;
  const concurrency = Math.max(1, options.concurrency ?? 5);
  const skipCache = options.skipCache ?? false;

  const uniqueIds = Array.from(new Set(ids));
  const byId = new Map<string, FreshnessResult>();

  const computed = await mapWithConcurrency(uniqueIds, concurrency, (id) =>
    checkOne(id, { now, nowMs, ttlMs, timeoutMs, fetchImpl, skipCache }),
  );
  uniqueIds.forEach((id, i) => byId.set(id, computed[i]));

  return ids.map((id) => byId.get(id)!);
}
