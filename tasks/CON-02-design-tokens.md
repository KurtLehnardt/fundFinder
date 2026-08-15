# CON-02 — Design-token contract + no-raw-hex lint

**Team:** Contracts
**Release slice:** 1 (ships with the other contracts, before any team builds new UI)
**Depends on:** none (independent of CON-01)
**Blocks:** all FE-* (slice 2+), R7 surfaces

## Context
v1 uses ad-hoc Tailwind tokens (`ink/paper/federal/rule/fit-*` in `scaffold/tailwind.config.ts`
+ `globals.css`) — not USWDS. R7.2 mandates a **USWDS 60/30/10** system, R7.6 bans raw hex in
components with a lint rule, R7.4 wants breakpoints in the token contract. Five teams are about to
add surfaces simultaneously; they need one token source of truth.

## Files in scope
- CREATE `scaffold/lib/design/tokens.ts` — named tokens (colors, spacing scale, type scale,
  breakpoints).
- EDIT `scaffold/tailwind.config.ts` + `scaffold/app/globals.css` — expose tokens as CSS
  variables / Tailwind theme (both light + dark).
- CREATE a `no-raw-hex` check (eslint rule or a `scripts/design/check-hex.mjs` CI script) scoped to
  `components/` + `app/`.
- Do **NOT** restyle existing v1 components (that's FE-01, slice 2) — v1 appearance stays unchanged.

## Definition of done
- [ ] Colors per R7.2: **60%** neutral canvas (`#f9f9f9` / `#ecf1f7`, body `#212121`), **30%** navy
      `#005ea2` (structure), **10%** green `#538200` reserved for the primary CTA + progress fill only.
- [ ] Reserved semantic tokens (info `#00bde3`, success `#04c585`, warning `#ffbe2e`, error
      `#e52207`) defined as semantic-only — never decorative.
- [ ] Breakpoints in the token contract (R7.4; min supported width 360px default).
- [ ] **Every intended fg/bg pairing verified at WCAG AA with a contrast checker** (R7.6), not by
      eye — output the check results. Do not lighten `#538200` (white text ≈4.6:1, no margin).
- [ ] `no-raw-hex` check fails on a raw hex in `components/`; passes on token references.
- [ ] `tsc` + `build` green; v1 components render identically (tokens defined, not yet applied).

## Out of scope
Applying tokens to components (FE-01), the R7.5 interaction-polish skill (CON-06), motion/animation,
any component restyle.

## Test plan
Contrast check passes for all defined pairings; the lint/check rule catches an injected raw hex;
build green; visual diff shows no v1 change.

## Escalate if
- A spec-mandated pairing fails WCAG AA → report; do not silently substitute a different hex.
