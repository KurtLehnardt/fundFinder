# CAN-05 — Live freshness-check service

**Team:** Canon
**Release slice:** 1
**Depends on:** CAN-01 (store), CAN-02 (ingestion + normalize)
**Blocks:** ELG-02 (R8.3 freshness in the actionable set)

## Context
R8.3 / §4.4 / §4.6: every actionable opportunity must show current status (forecasted / open /
closed) + close date + days remaining; **a closed solicitation is never presented as open**;
status is freshness-checked against the source **at display time** for the actionable set,
regardless of corpus cache age; rolling/continuous programs are their own status. Source failures
degrade one source (circuit breaker), never the whole run, and say what's missing (§4.6).

## Files in scope
- CREATE `scaffold/lib/canon/freshness.ts` — given a small set of surfaced opportunity ids, re-verify
  status + close date live against the source (grants.gov `fetchOpportunity`), with a short-TTL cache
  and a per-source circuit breaker.
- Reuse `lib/canon/store.ts` / `normalize.ts`. Do NOT wire into the request path or ELG yet.

## Definition of done
- [ ] `checkFreshness(ids)` re-fetches the source for only those ids, returns current status + close
      date + days-remaining; a rolling/continuous/standing program returns that status, not a fake deadline.
- [ ] **A closed opportunity is returned flagged closed** — never as open.
- [ ] Short-TTL cache (deadlines change on publication schedules, not by the second — document the TTL).
- [ ] Per-source **circuit breaker**: if the source is down/slow, degrade and return a
      `freshness_unavailable` flag for those items rather than asserting the cached status is current.
- [ ] `npx tsc --noEmit` green.

## Out of scope
Wiring into `route.ts` / ELG-02 (later slice), the UI treatment (FE), non-grants.gov sources (until
their adapters land, CAN-03).

## Test plan
For a sample of seeded ids, `checkFreshness` returns current status; a known-closed opp flags closed;
simulate source-down → items return `freshness_unavailable`, no false "open".

## Escalate if
- The source is unreachable → degrade + flag, never assert freshness. Do not present stale as fresh.
