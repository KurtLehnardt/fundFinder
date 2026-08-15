# PLT-03 — R10.1 analytics events (typed track() + hook/provider)

**Team:** Platform
**Release slice:** 2
**Depends on:** CON-01 (`scaffold/lib/contracts/analyticsEvent.ts` — already built, already rejects
description content at compile+runtime), CON-03 (`scaffold/lib/flags` — `r10_analytics` flag
already registered, env var `NEXT_PUBLIC_FLAG_R10_ANALYTICS`, defaults OFF)
**Blocks:** none

## Context
R10.1 (`prompts/fundfinder-orchestrator-prompt.md` line ~689): named funnel events, defined once
in the contract and emitted consistently — landing view, description started/submitted, interview
shown/completed/skipped, search started, first result rendered, run completed/abandoned (abandoned
carries `elapsed_ms` — "the single most important event"), cancel/verify clicked, verification
completed, enhance opened/completed, upgrade viewed/started/completed, run revisited. "Analytics
events carry no description content, ever... the analytics pipeline is a separate system and must
not become a back door around [§5.3's] policy."

The contract already exists and already enforces the no-description guarantee two ways: compile-time
(`AnalyticsPayload` type — see `analyticsEvent.ts`'s extensive doc comment) and runtime
(`AnalyticsEventSchema`/`AnalyticsPayloadSchema` via zod). What's missing is the **application-level
module that actually calls it** — a typed `track()`, a no-op sink (no analytics backend exists yet),
and a React hook/provider so feature code has one place to emit from. `AuthProvider.tsx` (PLT-01) is
the pattern to mirror: framework-agnostic core module + a thin `'use client'` React context/hook on
top.

## Files in scope (new files only)
- `scaffold/lib/analytics/track.ts` (or `index.ts`) — framework-agnostic `track()` core, no React
  import, mirroring how `mockAuth.ts` has no React import and `AuthProvider.tsx` sits on top of it.
- `scaffold/lib/analytics/__tests__/track.test.ts` — under the `npm test` glob
  (`lib/**/__tests__/**/*.test.ts`).
- `scaffold/components/AnalyticsProvider.tsx` — `'use client'` context + `useAnalytics()` hook,
  mirroring `scaffold/components/AuthProvider.tsx`'s shape (`createContext` /
  `useContext` / a `use{X}` hook that throws outside the provider).
- Optional, only if it doesn't touch a DO-NOT-TOUCH file: wiring `<AnalyticsProvider>` into
  `scaffold/app/layout.tsx` alongside the existing `<AuthProvider>`. If this feels risky or
  ambiguous, skip it — the module + hook + tests are the required deliverable, wiring a call site
  is explicitly optional per the dispatcher brief.
- **Do NOT edit**: `scaffold/lib/match.ts`, `scaffold/app/api/match/route.ts`,
  `scaffold/components/IntakeForm.tsx`, `scaffold/components/SearchProgress.tsx` (a separate
  loading-bar task owns these — if a real call site is needed to prove the module works end to end,
  use a throwaway/local example in a test instead, do not wire into these files).

## Definition of done
- [ ] `track(event: AnalyticsEvent): void` (or equivalent) in `scaffold/lib/analytics/track.ts`
      that validates the event against `AnalyticsEventSchema` before doing anything with it.
- [ ] Gated behind the `r10_analytics` flag via `isFlagEnabled("r10_analytics")` from
      `@/lib/flags` (or relative import, matching whatever import style `npm test` can resolve —
      verify with a quick test run, `@/` alias is a Next.js/tsconfig thing that may not resolve
      under plain `tsx --test`; existing lib tests use relative imports, e.g.
      `scaffold/lib/eligibility/__tests__/screen.test.ts` does `import ... from "../../contracts/eligibilityDetermination"` — follow that convention in the module itself if `@/` doesn't resolve under `tsx`).
      Flag off → `track()` is fully inert (confirm with a test that toggles the flag's env var).
- [ ] **No-op sink for now**: when the flag is on, `track()` may `console.debug`/`console.info` the
      validated event (dev-visible stub) but must not throw, must not persist anywhere, and must
      leave an obvious `// TODO: real destination (PostHog/Segment/etc.) when one exists` marker.
      When the flag is off, or when validation fails, it's a silent no-op — a bad call site must
      never crash the app.
- [ ] Convenience builders/constants for the R10.1 funnel event names already in
      `AnalyticsEventNameSchema` (`landing_view` … `run_revisited`, all 19 — see
      `scaffold/lib/contracts/analyticsEvent.ts`) so call sites don't hand-type the string enum.
      `run_abandoned`'s builder should make `elapsed_ms` required, not optional, per R10.1's "the
      single most important event."
- [ ] `AnalyticsProvider` (`'use client'`) + `useAnalytics()` hook in
      `scaffold/components/AnalyticsProvider.tsx`, exposing `track` (and the funnel builders, or a
      `track(name, payload)` convenience overload — your call), pattern-matched to
      `AuthProvider.tsx`/`useAuth()`.
- [ ] **Exhaustive rejection tests** — both levels, not just one:
      - Compile-time: at least one `@ts-expect-error`-guarded call through `track()` (or the typed
        builders) proving a `description`/free-text payload is a type error at the call site
        itself, not just on the raw `AnalyticsEvent` type (i.e., exercise your module's own API
        surface, don't just re-test `analyticsEvent.ts`).
      - Runtime: `track()` called with a description-shaped free-text value (including under a
        benign key, e.g. `{ blurb: "we build AI for hospitals..." }`) is rejected/no-op'd and never
        reaches the sink — assert the sink was NOT called (e.g. spy/stub the console method or an
        injectable sink function).
      - One test per funnel event name (or a single parameterized test over
        `AnalyticsEventNameSchema.options`) constructing + tracking each without type or runtime
        errors, so the full R10.1 list is provably wired, not just a couple of examples.
- [ ] Test file(s) live under `scaffold/lib/**/__tests__/**/*.test.ts`, `npm test` green (run from
      `scaffold/`).
- [ ] `npx tsc --noEmit` clean (run from `scaffold/`).
- [ ] `npm run build` clean (run from `scaffold/`) — this task adds a React component
      (`AnalyticsProvider.tsx`), so the build check is required even though this is otherwise
      lib-only work.

## Out of scope
- Wiring `track()` calls into `IntakeForm.tsx`, `SearchProgress.tsx`, or `app/api/match/route.ts`
  (loading-bar task owns them) — leave that wiring to a later task per the dispatcher brief.
- A real analytics backend/destination (PostHog, Segment, GA, etc.) — the sink is a no-op/console
  stub only.
- The north-star-metric `[DECIDE]` in R10.1 — not this task's call.
- R10.2 (prompt/corpus versioning) and R10.3 (traces) — separate requirements, separate tasks.

## Test plan
- `npm test` (from `scaffold/`) — new suite green, all 19 funnel event names exercised, both
  compile-time and runtime description-rejection proven.
- `npx tsc --noEmit` (from `scaffold/`) — clean, including the `@ts-expect-error` directives
  actually erroring (same pattern as `analyticsEvent.test.ts`'s `_compileTimeChecks`).
- `npm run build` (from `scaffold/`) — clean.

## Escalate if
- Emitting a real event turns out to require touching `IntakeForm.tsx`, `SearchProgress.tsx`, or
  `app/api/match/route.ts` to prove the module works — stop, report to main; ship the module + hook
  + tests without that wiring instead, per the dispatcher brief.
- The `AnalyticsEventSchema`/`AnalyticsPayload` contract seems to need a shape change to support a
  funnel event cleanly — stop, report to main rather than editing the CON-01 contract file (a
  cross-team shared surface).
