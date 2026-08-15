# FE-06 — "Auto Apply" stub (entitlement padlock + Pro upsell) + Settings menu

**Team:** Frontend
**Release slice:** 2 (Frontend sub-slice — coordinate with FE-02/03/04)
**Depends on:** OpportunityCard (exists), PLT-01 mock-auth local persistence pattern (exists)
**Relates to:** R6 (product surface), R8/R8.1 registration gates (SAM/UEI), R9.0 (client-only, gates nothing server-side)

## Context / intent (from the user)
Show an **"Auto Apply"** affordance on each grant so the capability is visible in the demo, but keep it **stubbed**: it's locked behind a **padlock icon**, and activating it opens a **modal** explaining it needs a **Pro subscription**. (The real, honest reason it's stubbed: we're waiting on API keys from the grant sites to finish the feature — the "Pro" framing is the interim gate.) Users should also learn the **requirements** auto-apply needs, and be able to record them on their profile via a **hamburger (three-line) menu → Settings submenu**.

## Scope
1. **Auto Apply button on each opportunity** (`components/OpportunityCard.tsx`)
   - A visible "Auto Apply" button with a **padlock icon**, in a clearly-locked state.
   - Click → opens the **Pro upsell modal** (below). It never actually submits anything.
   - Style within the design system (no raw hex; respect the `r7_design` token/v1 split already in the card; the padlock/locked control is a secondary/structure affordance, NOT the green CTA).

2. **Pro upsell modal** (new `components/AutoApplyModal.tsx`)
   - Accessible modal (focus trap, `Esc` to close, `role="dialog"` + `aria-modal`, backdrop click closes, `prefers-reduced-motion` respected).
   - Copy: auto-apply is a **Pro** feature (interim). Plain-language, no dark patterns, no fake payment capture.
   - Lists the **auto-apply requirements** the founder must have in place, with a short explanation of each:
     - **Active SAM.gov registration**
     - **UEI** (Unique Entity Identifier)
     - **Authorized AOR** (Authorized Organization Representative)
     - **E-Biz POC delegation** (Electronic Business Point of Contact has delegated the AOR)
   - A link/button "Add these in Settings" that opens the Settings submenu (item 3). Shows which requirements are already satisfied from the stored profile (checkmarks).

3. **Hamburger (three-line) menu → Settings submenu** (new `components/AppMenu.tsx` + a settings panel/route)
   - App-level hamburger menu (top nav). Coordinate placement with the PLT-01 auth surface / UserMenu so they don't collide (one nav cluster).
   - A **Settings** submenu containing an **"Auto-apply requirements"** form with fields:
     - Active SAM.gov registration (yes/no + optional date)
     - UEI (text)
     - Authorized AOR (name / confirm on file)
     - E-Biz POC delegation (confirm on file)
   - **Persist locally only** (localStorage), consistent with PLT-01's local-only, no-server-retention model. Include a clear "stored on this device only" note. Reuse/extend the mock-auth local store; **gates nothing server-side**.
   - These facts are the SAME registration facts the eligibility engine cares about (SAM/UEI). Where cheap, surface them into the `CompanyProfile` registration fields (provenance `user_stated`) so they can later inform ELG screening — but keep it a local stub for now; do not wire a server call.

## Definition of done
- [ ] "Auto Apply" button visible on each opportunity card, visibly locked (padlock).
- [ ] Clicking it opens an accessible Pro-upsell modal that (a) states it's a Pro feature and (b) lists the four requirements with explanations, showing which are already on file.
- [ ] Hamburger menu → Settings → Auto-apply requirements form; values persist in localStorage and survive reload; "Delete my data" (PLT-01) also clears them.
- [ ] Nothing is actually submitted anywhere; **no server-side gate**, no payment capture, no external call.
- [ ] `check:hex` + `check:contrast` clean; `tsc` + `build` green; keyboard + screen-reader accessible; works flag-off (v1) and flag-on (r7_design).

## Out of scope
Real payment/subscription, real grant-site submission/API integration (blocked on grant-site API keys), server-side entitlement enforcement, real SAM.gov/UEI verification.

## Escalate if (§8.3)
- Any requirement would need a server-side entitlement check or real payment capture → stop, report (must stay a client-only stub).
- The hamburger/settings nav can't be reconciled with the PLT-01 auth surface without touching server behavior → stop, report.
