# PLT-02 — R9.0 / §5.3 no-server-retention recon test

**Team:** Platform
**Release slice:** 2
**Depends on:** PLT-01 (`scaffold/lib/mockAuth.ts`, `scaffold/components/AuthProvider.tsx` — merged at
origin/main 806ecc2), CON-01 (`scaffold/lib/contracts/analyticsEvent.ts` — already enforces
compile+runtime rejection of description content)
**Blocks:** none

## Context
R9.0 (`prompts/fundfinder-orchestrator-prompt.md` line ~633): "Recon must confirm nothing
server-side is already capturing descriptions — request logs, error tracking, LLM provider
retention, analytics payloads... Client-only storage is only true if it is true everywhere." §5.3
repeats this as a verify-in-recon claim, not an assumption. PLT-01 already built the mock auth as a
UI state machine that gates nothing server-side; this task adds an **automated regression guard**
that keeps that true as the codebase grows, rather than a one-time manual check.

Recon already performed (do not redo — build on it):
- The only route under `scaffold/app/api/**` is `scaffold/app/api/match/route.ts`. It does not
  import or reference `mockAuth`, `isAuthenticated`, `AuthProvider`, `r9_0_mockauth`, or
  `NEXT_PUBLIC_MOCK_AUTH` anywhere. The only console call in it is
  `console.error("match failed:", err)`, logging the caught error, not the request body.
- `isFlagEnabled("r9_0_mockauth")` IS read, but only in `scaffold/app/page.tsx` (a page component,
  not `app/api`) — consistent with "gates nothing server-side."
- `scaffold/lib/contracts/analyticsEvent.ts` already has compile-time (`@ts-expect-error`-checked)
  and runtime (`AnalyticsPayloadSchema`) rejection of a `description` key and of any raw free-text
  string value, tested in `scaffold/lib/contracts/__tests__/analyticsEvent.test.ts`.

This task turns those findings into an executable, CI-runnable assertion so a future change that
reintroduces server-side description capture fails the test suite instead of shipping silently.

## Files in scope
- New test file(s) under `scaffold/lib/**/__tests__/**/*.test.ts` (the glob `npm test` runs —
  see `scaffold/package.json`'s `"test": "tsx --test lib/**/__tests__/**/*.test.ts"`). Suggested:
  `scaffold/lib/__tests__/noServerRetention.test.ts`, or a small helper module under
  `scaffold/lib/recon/` plus its test — your call, but the test itself must be reachable by that
  glob.
- Read-only inspection of `scaffold/app/**` and `scaffold/lib/**` (including the DO-NOT-TOUCH files
  below) is required and expected. **Do not edit** any file outside the new test/helper file(s).

## Definition of done
- [ ] **(a) No `app/api` code reads mock-auth.** A static scan asserts that no file under
      `scaffold/app/api/**` contains the identifiers `mockAuth`, `isAuthenticated`,
      `r9_0_mockauth`, or `NEXT_PUBLIC_MOCK_AUTH`. Fails loudly (not silently 0-file-skips) if the
      `app/api` directory can't be found, so a repo restructure can't silently defang the guard.
- [ ] **(b) AnalyticsEvent contract rejects description content.** A test imports
      `AnalyticsPayloadSchema`, `AnalyticsEventSchema`, `FORBIDDEN_CONTENT_KEYS` from
      `../contracts/analyticsEvent` and asserts (i) `FORBIDDEN_CONTENT_KEYS` still contains
      `"description"`, `"company_description"`, `"companyDescription"`; (ii)
      `AnalyticsPayloadSchema.safeParse({ description: "..." }).success === false`; (iii) a
      realistic full `AnalyticsEvent` with a description-shaped free-text value under a benign key
      fails `AnalyticsEventSchema.safeParse`. This is a **recon-level guard that the contract is
      wired as expected**, complementary to (not a duplicate of) the contract's own unit tests in
      `analyticsEvent.test.ts` — it's fine if the assertions overlap, the point is this suite
      doesn't depend on that other file existing.
- [ ] **(c) No obvious server-side logging of raw description.** A static scan over
      `scaffold/app/**` and `scaffold/lib/**` (excluding `**/__tests__/**`) flags any line
      matching a `console.(log|error|warn|info)(...)` call whose arguments mention `description`
      (e.g. `description`, `profile.description`, `companyDescription`). Assert the scan currently
      finds **zero** such lines. Include the matched file+line in the assertion failure message so
      a future violation is immediately actionable.
- [ ] Test file(s) live under `scaffold/lib/**/__tests__/**/*.test.ts` and pass under `npm test`
      (run from `scaffold/`).
- [ ] `npx tsc --noEmit` clean (run from `scaffold/`).
- [ ] Header comment states this is a recon-style regression guard per R9.0/§5.3, complementary to
      PLT-01's manual recon, not a substitute for it (static scans have false negatives — e.g. a
      logging call built from a dynamically-concatenated string wouldn't be caught).

## Out of scope
- Fixing any violation found (there should be none per recon above) — if the scan finds a real
  hit, **stop and report it**, do not silently patch `scaffold/lib/match.ts` or
  `scaffold/app/api/match/route.ts` (both DO-NOT-TOUCH — a loading-bar task owns them).
- LLM-provider-side retention (OpenAI/Anthropic API data retention policy) — out of this repo's
  control, not statically checkable, note as a known gap in the header comment.
- Request/access logs at the hosting-platform level (e.g. Vercel) — not visible to a repo-local
  static scan, note as a known gap.
- Editing `scaffold/lib/match.ts`, `scaffold/app/api/match/route.ts`,
  `scaffold/components/IntakeForm.tsx`, `scaffold/components/SearchProgress.tsx` (DO-NOT-TOUCH).

## Test plan
- `npm test` (from `scaffold/`) — new suite green, plus confirm it doesn't break existing suites.
- `npx tsc --noEmit` (from `scaffold/`) — clean.
- Manual sanity: temporarily (in your own scratch, never committed) add a
  `console.log("desc:", description)` to a throwaway local file inside the scanned directories and
  confirm the guard's (c) assertion fails against it, then remove the scratch file — this proves
  the scan isn't vacuously true. Do not commit the scratch file or touch any real source file to do
  this.

## Escalate if
- The scan in (a) or (c) finds an actual hit against real (non-scratch) code — stop, report to
  main with the exact file/line, do not fix it yourself if the fix would touch a DO-NOT-TOUCH file.
- Achieving the assertions would require modifying `match.ts` or `app/api/match/route.ts` — stop,
  report to main.
