# APL-01 — R6 assisted-apply feasibility memo (research only)

**Team:** Apply
**Release slice:** 8 (but the memo runs early, in parallel, unblocked)
**Depends on:** none
**Blocks:** APL-02 (package builder), any R6 code

## Context
R6 is **assisted apply, not auto-apply**. The spec requires spiking the federal-portal integration
as a **research task with its own writeup, gated on legal review, BEFORE any code**, and to
**re-verify all constraints against current official docs** (they change). §8.3: anything touching
legal exposure, ToS, auth to a federal system, or the assist/submit boundary → **escalate, do not
proceed**. Explicit non-goal: headless-browser submission to any federal portal.

## Files in scope
- CREATE `docs/R6-s2s-feasibility-memo.md`. **NO code, no credentials, no portal integration.**

## Definition of done
- [ ] What's currently possible via **Grants.gov System-to-System (S2S) / Workspace API** — re-verified
      against current official docs, with links + retrieval dates.
- [ ] What it requires of the user: active SAM.gov registration + UEI, an authorized AOR, E-Biz POC
      delegation.
- [ ] Portal differences (NIH ASSIST, DoD DSIP, NSF Research.gov) — auth, MFA/PIV-CAC constraints.
- [ ] Cost, and the **liability** analysis (the AOR legally attests; a product that submits without a
      human attestation step creates liability).
- [ ] A clear recommendation for the thin "assisted apply" slice (package builder + human-submits +
      review/attest) vs. what stays out of scope. Every claim cited to a current official source with a date.

## Out of scope
ANY code, real portal integration, storing credentials, actually registering anything.

## Escalate if (standing §8.3)
- Any legal-exposure, ToS, federal-system-auth, or assist-vs-submit ambiguity → surface it; never
  resolve it by assumption. Any federal requirement you cannot verify against a current official
  source → mark unknown, do not assert.
