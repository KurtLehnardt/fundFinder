# CAN-06 — Corpus versioning + data-age + failed-sync alarm

**Team:** Canon
**Release slice:** 1
**Depends on:** CAN-01 (store + `corpus_snapshots`), CAN-02 (writes snapshots + alarms)
**Blocks:** R10 data-age surface, the UI "opportunities as of …"

## Context
§4.4: documented refresh cadence + a **surfaced data age** in the UI ("opportunities as of …"), and
**a failed sync must alarm** (silently serving a stale corpus is the failure that produces confidently
wrong deadlines). R10.2: every run records the Canon snapshot version it read. CAN-02 already writes
per-run alarms into `corpus_snapshots.source_coverage.alarms`; this task surfaces + aggregates them.

## Files in scope
- CREATE `scaffold/lib/canon/version.ts` — query the current snapshot version + its `created_at`/
  `retrieved_at` (data age), and expose the snapshot a run should record (R10.2).
- CREATE `scaffold/lib/canon/health.ts` (or extend version.ts) — a sync-health check: alarm if the
  latest snapshot is older than the documented cadence OR its `source_coverage.alarms` is non-empty.
- Do NOT build UI or external alerting transport — expose the signal + a documented hook.

## Definition of done
- [ ] `currentSnapshot()` returns `{ version, data_age, retrieved_at, source_coverage }` for the
      data-age surface and for a run to record (R10.2).
- [ ] `checkSyncHealth()` returns OK / ALARM with reasons (stale beyond cadence, or recorded source
      failures) — the failed-sync alarm signal (§4.4).
- [ ] Cadence documented (matches CAN-02's cron).
- [ ] `npx tsc --noEmit` green.

## Out of scope
UI rendering of data age (FE), the external alert transport (email/Slack — just the signal + hook),
prompt/run recording itself (R10.3 / Team Platform consumes `currentSnapshot()`).

## Test plan
`currentSnapshot()` returns the live snapshot + a plausible data age; `checkSyncHealth()` returns
ALARM when fed a stale/failed snapshot and OK for a fresh clean one.

## Escalate if
- The only available snapshot is failed/stale and there's no fresh fallback → surface as ALARM, do
  not silently serve it as current.
