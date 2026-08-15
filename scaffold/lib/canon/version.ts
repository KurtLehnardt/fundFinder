import { getSql } from "./store";

/**
 * version.ts — Canon corpus versioning, data-age surfacing, and the
 * failed-sync alarm signal (CAN-06).
 *
 * §4.4 requires two things this file provides:
 *   1. A surfaced data age ("opportunities as of …") — `currentSnapshot()`.
 *   2. A failed sync must alarm, never silently serve a stale corpus —
 *      `checkSyncHealth()` (+ the `assertSyncHealthy()` hook below).
 *
 * R10.2 requires every run to record the Canon snapshot version it read;
 * `currentSnapshot()` is that read — callers persist `.version` alongside
 * prompt version(s)/model(s)/eval-set commit wherever runs are recorded
 * (R10.3, Team Platform). This file does not write run records itself.
 *
 * Both the version lookup and the health check live in this one file (the
 * task brief allows `checkSyncHealth()` "in version.ts or a new health.ts")
 * because they share the same snapshot-row type and a health check is just
 * a policy applied to a snapshot — splitting them would just add an import
 * for no isolation benefit.
 *
 * SCOPE: no UI rendering of data age (FE) and no external alert transport
 * (email/Slack/pager) — this module exposes the signal and a documented
 * hook (`assertSyncHealthy`) for something downstream to wire a transport
 * onto. See the "DOCUMENTED HOOK" comment below.
 */

// ---------------------------------------------------------------------------
// Cadence (§4.4 "documented refresh cadence per source")
// ---------------------------------------------------------------------------

/**
 * The Canon's sync cadence. Must match CAN-02's cron
 * (.github/workflows/canon-sync.yml: `cron: "0 9 * * *"` — daily at 09:00
 * UTC, grants.gov is currently the only scheduled source). If a future
 * source syncs on a different cadence, this becomes a per-source map; today
 * there is one scheduled job so one number is honest.
 */
export const CANON_SYNC_CADENCE_HOURS = 24;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The `corpus_snapshots.source_coverage` jsonb blob (see
 * supabase/migrations/00001_canon_corpus_store.sql and CAN-02's
 * ingest-grants.mjs, which is the current writer). Shape is source-defined
 * and additive, so this is intentionally loose beyond the one field CAN-06
 * contractually depends on: `alarms` (CAN-02 pushes a string per degraded
 * source/keyword/detail-fetch/validation failure; `[]` on a clean run).
 */
export interface SnapshotSourceCoverage {
  alarms?: string[];
  gaps?: string[];
  notes?: string;
  [key: string]: unknown;
}

/** A raw `corpus_snapshots` row, as written by CAN-01's `upsertSnapshot`. */
export interface CorpusSnapshotRow {
  version: string;
  created_at: string; // ISO 8601
  source_coverage: SnapshotSourceCoverage;
  notes: string | null;
}

/** How old a snapshot's data is, computed relative to "now" at call time. */
export interface DataAge {
  /** Milliseconds between `retrieved_at` and now — for programmatic comparison. */
  ms: number;
  /** Convenience: `ms` in hours (fractional). */
  hours: number;
  /** Human-readable for logs/UI copy, e.g. "3.2 hours", "2 days". */
  human: string;
}

/**
 * The data-age surface (§4.4 "opportunities as of …") and what a run
 * records for R10.2. `retrieved_at` is when this snapshot was written;
 * `data_age` is how old that makes it right now.
 */
export interface CurrentSnapshotResult {
  version: string;
  data_age: DataAge;
  retrieved_at: string; // ISO 8601 — alias of the snapshot's created_at
  source_coverage: SnapshotSourceCoverage;
}

export type SyncHealthStatus = "OK" | "ALARM";

export interface SyncHealthResult {
  status: SyncHealthStatus;
  /** Empty when OK; one entry per reason when ALARM (a run can be alarmed
   * for both staleness AND recorded source failures at once). */
  reasons: string[];
  /** The snapshot the check was run against (null only if the Canon store
   * has no snapshot at all — itself an ALARM condition). */
  snapshot: CurrentSnapshotResult | null;
  checked_at: string; // ISO 8601, when this check ran
}

// ---------------------------------------------------------------------------
// currentSnapshot()
// ---------------------------------------------------------------------------

function formatHumanAge(hours: number): string {
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  if (hours < 48) {
    const rounded = Math.round(hours * 10) / 10;
    return `${rounded} hour${rounded === 1 ? "" : "s"}`;
  }
  const days = Math.round((hours / 24) * 10) / 10;
  return `${days} day${days === 1 ? "" : "s"}`;
}

function toDataAge(retrievedAtIso: string, now: Date = new Date()): DataAge {
  const retrievedAt = new Date(retrievedAtIso);
  const ms = Math.max(0, now.getTime() - retrievedAt.getTime());
  const hours = ms / (1000 * 60 * 60);
  return { ms, hours, human: formatHumanAge(hours) };
}

/**
 * The live Canon snapshot — the newest `corpus_snapshots` row by
 * `created_at`. Returns `null` only if the Canon store has no snapshot yet
 * (an empty/unseeded store), which `checkSyncHealth()` treats as ALARM
 * rather than something callers must separately guard.
 *
 * This is the read a run should call to fill R10.2's "Canon snapshot
 * version" field, and the read that feeds the "opportunities as of …"
 * data-age surface (§4.4). Per the task's escalation note: if the latest
 * snapshot is itself stale/failed, this function still returns it — it does
 * NOT silently fall back to an older "fresher-looking" row and pretend that
 * is current. `checkSyncHealth()` is what turns that truth into an alarm.
 */
export async function currentSnapshot(): Promise<CurrentSnapshotResult | null> {
  const sql = getSql();
  const rows = await sql<CorpusSnapshotRow[]>`
    select version, created_at, source_coverage, notes
    from corpus_snapshots
    order by created_at desc
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;

  const retrievedAt = new Date(row.created_at).toISOString();
  return {
    version: row.version,
    data_age: toDataAge(retrievedAt),
    retrieved_at: retrievedAt,
    source_coverage: (row.source_coverage ?? {}) as SnapshotSourceCoverage,
  };
}

// ---------------------------------------------------------------------------
// checkSyncHealth()
// ---------------------------------------------------------------------------

export interface CheckSyncHealthOptions {
  /** Override the cadence tolerance (hours). Defaults to `CANON_SYNC_CADENCE_HOURS`. */
  cadenceHours?: number;
  /**
   * Evaluate a specific snapshot instead of querying the live Canon store.
   * This is what makes the check unit-testable against synthetic
   * stale/failed/clean snapshots (see the task's test plan) without
   * mutating the database. Pass `null` to simulate "no snapshot exists".
   * Omit (or pass `undefined`) to check the live store via
   * `currentSnapshot()` — the normal production path.
   */
  snapshot?: CurrentSnapshotResult | null;
}

/**
 * The failed-sync alarm (§4.4: "A failed sync must alarm. Silently serving
 * a stale corpus is the failure mode that produces confidently wrong
 * deadlines."). ALARM if either:
 *   - the latest snapshot is older than the documented cadence
 *     (`CANON_SYNC_CADENCE_HOURS`, i.e. CAN-02's daily cron), OR
 *   - its `source_coverage.alarms` array is non-empty (CAN-02 records one
 *     alarm string per degraded source/keyword/detail-fetch/validation
 *     failure — see ingest-grants.mjs).
 * Both conditions can fire together; `reasons` lists every one that did.
 */
export async function checkSyncHealth(
  opts: CheckSyncHealthOptions = {},
): Promise<SyncHealthResult> {
  const cadenceHours = opts.cadenceHours ?? CANON_SYNC_CADENCE_HOURS;
  const snapshot =
    opts.snapshot !== undefined ? opts.snapshot : await currentSnapshot();
  const checkedAt = new Date().toISOString();

  if (!snapshot) {
    return {
      status: "ALARM",
      reasons: ["no corpus snapshot found — the Canon store is empty/unseeded"],
      snapshot: null,
      checked_at: checkedAt,
    };
  }

  const reasons: string[] = [];

  if (snapshot.data_age.hours > cadenceHours) {
    reasons.push(
      `latest snapshot "${snapshot.version}" is ${snapshot.data_age.human} old — beyond the ` +
        `${cadenceHours}h documented cadence (CAN-02's daily cron, .github/workflows/canon-sync.yml)`,
    );
  }

  const sourceAlarms = snapshot.source_coverage.alarms;
  if (Array.isArray(sourceAlarms) && sourceAlarms.length > 0) {
    reasons.push(
      `latest snapshot "${snapshot.version}" recorded ${sourceAlarms.length} sync alarm(s): ` +
        sourceAlarms.join("; "),
    );
  }

  return {
    status: reasons.length > 0 ? "ALARM" : "OK",
    reasons,
    snapshot,
    checked_at: checkedAt,
  };
}

// ---------------------------------------------------------------------------
// DOCUMENTED HOOK — out of scope: UI + external alert transport (§4.4).
// ---------------------------------------------------------------------------
//
// CAN-06 stops at exposing the signal. Wiring `checkSyncHealth()` to an
// actual transport (Slack/PagerDuty/email) belongs to whichever team owns
// that channel. Two intended integration points:
//
//   1. A scheduled check (e.g. a `scripts/canon/check-health.mjs` invoked by
//      its own cron/CI step, or appended to canon-sync.yml after the ingest
//      step) that calls `checkSyncHealth()` and, on ALARM, posts to a
//      webhook / exits non-zero so CI surfaces a failed job.
//   2. `assertSyncHealthy()` below — a throwing wrapper for any server-side
//      caller (a health-check API route, or the run-recording path that
//      reads `currentSnapshot()` for R10.2) that wants to fail loudly
//      instead of silently proceeding on a stale/failed snapshot.
//
// Neither is wired up here; both are ready to be called.

/** Thrown by `assertSyncHealthy()` when the sync health check is ALARM. */
export class CanonSyncAlarmError extends Error {
  readonly health: SyncHealthResult;
  constructor(health: SyncHealthResult) {
    super(`Canon sync ALARM: ${health.reasons.join("; ") || "unknown reason"}`);
    this.name = "CanonSyncAlarmError";
    this.health = health;
  }
}

/**
 * Documented hook: run `checkSyncHealth()` and throw `CanonSyncAlarmError`
 * if it's ALARM, otherwise return the healthy snapshot. Intended for
 * callers that want "fail loudly" semantics (a health endpoint, a
 * pre-run guard) without duplicating the ALARM policy above.
 */
export async function assertSyncHealthy(
  opts: CheckSyncHealthOptions = {},
): Promise<CurrentSnapshotResult> {
  const health = await checkSyncHealth(opts);
  if (health.status === "ALARM" || !health.snapshot) {
    throw new CanonSyncAlarmError(health);
  }
  return health.snapshot;
}
