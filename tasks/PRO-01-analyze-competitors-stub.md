# PRO-01 — "Analyze competing companies" (Pro-gated stub)

**Team:** Intel (R5 precursor)
**Release slice:** R5 surface — stub only
**Depends on:** FE-06 (`components/AutoApplyModal.tsx` upsell pattern), FE-01 (`OpportunityCard.tsx`)
**Blocks:** none

## Context
Each `OpportunityCard` (`scaffold/components/OpportunityCard.tsx`) has a "Similar companies funded"
award-history section (the `{m.history && ( … )}` block: a stat row + a recipients table). R5 (Pro
competitor intelligence) is not built. This task adds a **Pro-gated STUB** there: an "Analyze
competing companies" button that opens a Pro-upsell modal — the exact same padlock + honest-upsell
pattern as FE-06's locked "Auto Apply" button / `AutoApplyModal`. It performs **no real analysis**,
takes no payment, and gates nothing server-side. It is purely a visible "this is coming as Pro"
affordance.

## Files in scope
- `scaffold/components/OpportunityCard.tsx` — add the locked button in the history section + wire the modal
- `scaffold/components/CompetitorAnalysisModal.tsx` (NEW) — the Pro-upsell modal
- `tasks/PRO-01-analyze-competitors-stub.md` (this file)

Do not modify any other file. Do NOT touch the flag registry (`lib/flags/*`), `mockAuth.ts`, or
`AutoApplyModal.tsx`. This stub is intentionally **not** behind a feature flag — it mirrors FE-06's
always-visible locked affordance (the "Auto Apply" button is not flag-gated either), which also
keeps this PR free of the flag-registry edits happening in the parallel R9 branch.

## Definition of done
- [ ] In the `{m.history && ( … )}` block of `OpportunityCard.tsx`, add an **"Analyze competing
      companies"** button with a padlock glyph (reuse the existing `LockIcon` in that file) and a
      "Pro feature · not available yet" hint, styled with the SAME dual `design`-flag className
      approach already used for the locked "Auto Apply" row (token classes when `r7_design` is on,
      the v1 `border-rule`/`text-slate-550`/`text-federal` classes when off). It sits inside the
      history section, near the "Similar companies funded" heading or the stat row.
- [ ] Clicking it opens `CompetitorAnalysisModal` (state `const [competitorOpen, setCompetitorOpen]
      = useState(false)`), with `aria-haspopup="dialog"`. It never triggers any network call or
      analysis.
- [ ] `CompetitorAnalysisModal.tsx` mirrors `AutoApplyModal.tsx`'s structure: `"use client"`,
      `useDialogA11y(dialogRef, onClose, closeBtnRef)` for focus-trap + Esc + backdrop-click close,
      a close (X) button, a "Pro feature · not available yet" eyebrow with a lock icon, an
      `r7_design`-flag-driven dual className set, `role="dialog"` + `aria-modal` + `aria-labelledby`
      + `aria-describedby`.
- [ ] Copy is HONEST (R7.7 / §11): explain that Pro competitor analysis WOULD summarize which
      companies won similar awards and how the user's profile compares, that it is not available yet,
      that nothing is analyzed, purchased, or submitted from this screen, and that no guarantee or
      federal affiliation is implied. No invented statistics.
- [ ] Local verification all green: `npx tsc --noEmit`, `npm test`, `npm run build`,
      `npm run check:hex` (use token/Tailwind classes — NO raw hex literals; mirror
      `AutoApplyModal.tsx`, which passes the check), `npm run check:contrast`.

## Out of scope
- No real competitor analysis, no data fetching, no LLM call, no award-record retrieval.
- No feature-flag registry changes, no entitlement-contract changes, no server code.
- Do not change the existing award-history table or stats, or the "Auto Apply" row.

## Test plan
- `npx tsc --noEmit`; `npm test`; `npm run build`; `npm run check:hex`; `npm run check:contrast`.
- Manual: expand a card with award history; the locked "Analyze competing companies" button is
  visible; clicking opens the modal; Esc / backdrop / X all close it; focus is trapped while open.
  Verify in both `r7_design` OFF and ON looks.

## Escalate if
- The history section's structure makes it impossible to add the button without breaking the table
  layout or nesting invalid interactive elements.
