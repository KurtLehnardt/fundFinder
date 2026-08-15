# CON-03 — Feature-flag infrastructure

**Team:** Contracts
**Release slice:** 1
**Depends on:** none
**Blocks:** every flagged feature (R1–R9), §8.2 rollback

## Context
§8.2: every requirement ships behind a flag defaulting **off in production** until its acceptance
criteria pass; the **pre-R1 path must stay reachable** for the whole buildout (one-flag revert);
flags are Contracts-owned infra, not per-team improvisation. v1 has no flag system.

## Files in scope
- CREATE `scaffold/lib/flags/` — typed flag registry (one name per requirement: `r1_interview`,
  `r2_verify`, `r3_enhance`, `r4_progress`, `r7_design`, `r8_eligibility`, `r9_0_mockauth`,
  `r10_analytics`, …), a server-readable + client-readable accessor, env/config override.
- CREATE `scaffold/lib/flags/__tests__/`.

## Definition of done
- [ ] Typed registry; **every flag defaults OFF in production**; overridable per-env (env var/config).
- [ ] Server + client accessor (same source of truth); the pre-R1 entry path is reachable when
      `r1_interview` is off.
- [ ] Flags are NOT used for entitlement/Pro gating (that's `Entitlements`, server-enforced — CON-01/PLT).
- [ ] Test: a flag defaults off; an override flips it. `tsc` + `build` green; v1 behavior unchanged.

## Out of scope
Actual feature gating inside components (each feature wires its own flag), `Entitlements`,
analytics emission, rollback-trigger wiring (that references R10.1 events, PLT-03).

## Escalate if
- A flag would need to gate server-side entitlements → that's `Entitlements`, not a flag; surface.
