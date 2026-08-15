# R6 — Auto-apply Pro flow (assisted-apply demo: sign-in → requirements → admin review)

**Team:** Apply
**Release slice:** R6 (assisted application, thin demo slice)
**Depends on:** R9 (`v2/r9-supabase-auth` — this branch is stacked on it), FE-06 (`AutoApplyModal.tsx`, `SettingsPanel.tsx`, `lib/mockAuth.ts`), CON-01 entitlements (`lib/contracts/entitlements.ts`)
**Blocks:** none

## Context
FE-06 shipped a locked "Auto Apply" button on each `OpportunityCard` that opens a static Pro-upsell
modal (`components/AutoApplyModal.tsx`) listing four prerequisites (active SAM.gov registration, UEI,
authorized AOR, E-Biz POC delegation) and reading what's already on file from a device-local Settings
form (`components/SettingsPanel.tsx`, persisted via `lib/mockAuth.ts`). R6's product intent (§ R6,
"assisted apply not auto apply": a human always submits; nothing is auto-submitted to a federal
portal) is demonstrated here as a **walkable flow** behind a new default-off flag `r6_auto_apply`:
clicking "Auto Apply" runs **sign-in (R9) → a requirements Settings step → an "admin review pending"
result**, so founders SEE what pre-approval actually requires. It is a **stub**: Pro-framed via a
client-only entitlement that gates nothing server-side, and it **never submits an application**.

This branch is stacked on R9 (`v2/r9-supabase-auth`), so the sign-in step chains off the real
Supabase auth when `r9_supabase_auth` is on, and off the R9.0 mock otherwise — either way the user
sees a sign-in gate.

## Files in scope
- `scaffold/lib/flags/registry.ts` — add the `r6_auto_apply` flag
- `scaffold/lib/flags/env.ts` — add its static `process.env` read
- `scaffold/lib/flags/__tests__/registry.test.ts` — add `r6_auto_apply` to the `expected` list (the deepEqual test fails otherwise; note `r9_supabase_auth` is already in that list on this branch)
- `scaffold/lib/entitlements/useEntitlements.ts` (NEW) — client-only entitlement stub
- `scaffold/lib/entitlements/__tests__/useEntitlements.test.ts` (NEW) — a small unit test
- `scaffold/components/AutoApplyFlow.tsx` (NEW) — the stepper modal
- `scaffold/components/OpportunityCard.tsx` — route the existing "Auto Apply" button by the flag
- `tasks/R6-auto-apply-pro.md` (this file)

Do NOT modify `AutoApplyModal.tsx` or `SettingsPanel.tsx` (reuse them unchanged), `lib/mockAuth.ts`,
`AuthProvider.tsx`, any R9 file, or any other flag.

## Definition of done
- [ ] New flag `r6_auto_apply` registered: literal in `FlagName`, a `FLAG_REGISTRY` entry
      (requirement `"R6"`, envVar `"NEXT_PUBLIC_FLAG_R6_AUTO_APPLY"`, one-line description), a static
      line in `env.ts`, and `r6_auto_apply` added to the `registry.test.ts` `expected` array. Default
      OFF (universal `FLAG_DEFAULT`).
- [ ] `OpportunityCard.tsx`: the existing locked "Auto Apply" button/row is UNCHANGED in appearance.
      When `isFlagEnabled("r6_auto_apply")` is OFF → clicking it opens the existing `AutoApplyModal`
      exactly as today (flag-off path byte-for-byte unchanged). When ON → clicking it opens the new
      `AutoApplyFlow`.
- [ ] `AutoApplyFlow.tsx` is a modal stepper (reuse `useDialogA11y` for focus-trap/Esc/backdrop; the
      `r7_design` dual-className approach like `AutoApplyModal`/`SettingsPanel`; full ARIA dialog
      wiring). Steps:
      1. **Sign in (R9)** — shown when `useAuth().user` is null: Pro-framed copy + a "Continue with
         Google" control that calls `useAuth().signIn()`. When a user is present it auto-advances
         (works for both the mock — instant — and real Supabase auth, where `signIn()` redirects to
         Google and returns via `/auth/callback`; on return, a signed-in user resumes past this step).
         Already-signed-in users skip straight to step 2.
      2. **Requirements (Settings)** — reuse `SettingsPanel` (render it and re-read
         `getAutoApplyRequirements()` on its close, or reuse its form) to capture the four facts. Show
         the four-item satisfied/not checklist (same four as `AutoApplyModal`: SAM registration, UEI,
         AOR on file OR name, E-Biz POC on file). The "Submit for approval" action is DISABLED until
         ALL FOUR are satisfied.
      3. **Admin review pending** — after submit, show the exact line **"Admin review required prior
         to granting auto-apply approval."** plus an honest note that nothing was submitted anywhere,
         and a Close button.
- [ ] Pro gating is a **client-only stub that gates nothing**: `useEntitlements.ts` centralizes the
      tier/feature read (per §3.7, read from `lib/contracts/entitlements`'s `DEFAULT_ENTITLEMENTS`,
      default `free` → `assisted_application: false`) and the flow uses it only for Pro *framing*
      (badge/lock/eyebrow). The walkthrough still proceeds regardless — it is a preview. There is NO
      server-side check and nothing real is entitled or submitted.
- [ ] The flow NEVER submits an application, takes payment, invents stats, or implies a
      guarantee/federal affiliation (R7.7 / §11). Copy is honest: it is a preview / awaiting approval.
- [ ] `useEntitlements` has a unit test (defaults to free / `assisted_application === false`).
- [ ] Local verification all green: `npx tsc --noEmit`, `npm test` (incl. the updated flag tests, the
      new entitlement test, and the unchanged `noServerRetention.test.ts`), `npm run build`,
      `npm run check:hex` (components/app must contain NO raw hex — mirror `AutoApplyModal.tsx`),
      `npm run check:contrast`.

## Out of scope
- The full R6 package builder (form enumeration, prefilled fields, narrative drafting, Workspace
  export, deep-links, deadline tracking) — this task is only the sign-in→requirements→review DEMO flow.
- Any real submission, portal integration, S2S/Workspace call, or payment.
- Server-side entitlement enforcement (PLT-07) or any server-side gating on identity (§5.3).
- Editing `AutoApplyModal.tsx` / `SettingsPanel.tsx` / `mockAuth.ts` / any R9 file.

## Test plan
- `npx tsc --noEmit`; `npm test`; `npm run build`; `npm run check:hex`; `npm run check:contrast`.
- Manual (flag OFF): "Auto Apply" opens the existing static upsell modal — unchanged.
- Manual (flag ON): signed-out user → clicking "Auto Apply" shows the sign-in step; after sign-in
  (mock: instant), the requirements step shows the four-item checklist with "Submit for approval"
  disabled; filling all four in Settings enables it; submitting shows "Admin review required prior to
  granting auto-apply approval." Esc/backdrop/X close the flow; focus is trapped. Verify in both
  `r7_design` OFF and ON.

## Escalate if
- Reusing `SettingsPanel` as a nested step causes an unresolvable focus-trap conflict (if so, reuse
  its form inline instead and note it).
- Any requirement can only be met by gating something server-side (it must not be).
