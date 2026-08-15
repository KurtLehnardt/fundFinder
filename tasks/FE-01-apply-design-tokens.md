# FE-01 — Apply the USWDS design tokens to the app

**Team:** Frontend
**Release slice:** 2
**Depends on:** CON-02 (design tokens), CON-03 (flags)
**Blocks:** FE-02, FE-03, FE-04, FE-05

## Context
CON-02 defined the USWDS 60/30/10 token contract (`scaffold/lib/design/tokens.ts`, the Tailwind
mapping, CSS vars in `globals.css`, `check:hex`/`check:contrast`) but deliberately did NOT restyle
v1 components. FE-01 applies them: the v1 components (`app/page.tsx`, `components/IntakeForm.tsx`,
`OpportunityMap.tsx`, `OpportunityCard.tsx`) currently use ad-hoc tokens/hex. Restyle to the CON-02
tokens, behind the `r7_design` flag (CON-03) so it's a one-flag revert (§8.2).

## Files in scope
- `scaffold/components/IntakeForm.tsx`, `OpportunityMap.tsx`, `OpportunityCard.tsx`
- `scaffold/app/page.tsx`, `app/globals.css` (usage only), `app/layout.tsx` (if needed for tokens)
- Read-only: `scaffold/lib/design/tokens.ts`, `scaffold/lib/flags/`

## Definition of done
- [ ] Components reference token names — **`npm run check:hex` passes on `components/` + `app/`** (0 raw hex).
- [ ] USWDS 60/30/10 applied: navy `#005ea2` structure, green `#538200` on the primary CTA + progress fill ONLY, neutral canvas; semantic tokens only in semantic roles.
- [ ] Every foreground/background pair passes WCAG AA (`npm run check:contrast`).
- [ ] Gated behind the `r7_design` flag (CON-03) — flag off renders the v1 look; flag on renders USWDS.
- [ ] The 5 precomputed cases still render correctly; `tsc` + `build` green.

## Out of scope
New surfaces (R1 interview UI = FE-03, R8 buckets = FE-04), the token contract itself (CON-02), the
R7.5 polish pass (later), motion/animation.

## Test plan
`check:hex` + `check:contrast` pass; visually confirm the 5 cached cases with the flag on/off; build green.

## Escalate if
- A spec-mandated USWDS pairing fails WCAG AA → report; do not substitute an off-spec hex.
