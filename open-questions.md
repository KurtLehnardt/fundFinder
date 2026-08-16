# Open Questions — need user/orchestrator input

## G7 — two honesty findings in the WS-G apply engine (read-only for G7; owned by lib/apply/* team)

Surfaced 2026-08-16 while building the G7 anti-fabrication/honesty eval
(`scaffold/lib/eval/__tests__/applicationHonesty.test.ts`, PR `feat/g7-app-eval`).
G7's scope is read-only for `lib/apply/*`, so neither is fixed here — both are
asserted as **current, documented behavior** (`// KNOWN FINDING:` tests) so the
eval gate stays green while surfacing them for the owning team.

### Finding 1 — `lib/apply/draft.ts`: an undeclared factual sentence bypasses grounding enforcement entirely

**What:** `enforceGrounding` / `validateDraftGrounding` only inspect the
model's *declared* `claims` array (each `{ text, profile_field }`). A
factual-sounding sentence written directly into `draft_text` with **no
corresponding `claims` entry** is invisible to both checks:

- `validateDraftGrounding` clause (a) only iterates `section.claims` — it
  never scans `draft_text` for factual assertions that were never declared.
- `enforceGrounding` step 1 only neutralizes claims that ARE listed — an
  undeclared sentence is never touched.
- Clause (d) / step 5 only catches the fixed `BANNED_PHRASES` list
  (eligibility/award language) — not arbitrary invented numbers or facts.

The drafting prompt (`DRAFT_APPLICATION_SECTION_V1_TEMPLATE`,
`scaffold/lib/prompts/registry.ts`) *instructs* the model to add every factual
sentence to `claims`, but nothing in the code cross-checks that promise. The
module's own header states "THE HONESTY CONTRACT ... IS ENFORCED IN CODE, NOT
LEFT TO THE MODEL" — for this one shape (an omitted `claims` entry), the
guarantee currently rests entirely on the model following instructions.

**Impact:** a model response that forgets (or is induced) to declare one
`claims` entry ships a specific, invented fact — a metric, a customer count, a
dollar figure — with **no visual `[founder to provide: …]` marker at all**,
straight into the assembled package.

**Repro:** `scaffold/lib/eval/applicationGolden.ts` → `SPARSE_CASE` →
`SPARSE_SECTION_TRACTION.draft_text` includes "Our platform now serves more
than 3,000 rural clinics nationwide." with no matching `claims` entry.
`scaffold/lib/eval/__tests__/applicationHonesty.test.ts` → test "KNOWN
FINDING: an UNDECLARED fabricated sentence (no claims entry, no gap) survives
enforceGrounding unchanged" reproduces it directly against the real
`enforceGrounding`/`validateDraftGrounding`.

**Suggested remediation (not implemented here):** either (a) have
`enforceGrounding` heuristically scan `draft_text` for sentences not covered
by any `claims` text or `gaps` placeholder and neutralize/flag them too, or
(b) require the model to partition the *entire* `draft_text` into
claims+gaps with no leftover free prose, and reject/neutralize any span at
parse time that isn't accounted for by either array.

### Finding 2 — `lib/apply/budget.ts`: template line-item gap placeholders are rendered but never collected into `budget.gaps`

**What:** when `use_of_funds` is absent, `buildTemplateLineItems` embeds a
`[founder to provide: how funds will be used for <category>]` placeholder
directly inside each line item's `justification` string (so it's genuinely
visible on the rendered budget). But `buildBudget` only ever calls
`addGap(li.amount)` — it never scans `li.justification` for the placeholder it
just embedded. Result: up to 8 genuine, visibly-rendered founder-to-provide
markers are silently absent from `budget.gaps`.

This directly contradicts `applicationBudget.ts`'s own doc comment: `gaps` is
described as *"the flat, deduplicated list of every distinct `[founder to
provide: …]` placeholder appearing anywhere in the package."* It also means
`collectAllGaps` (`lib/apply/package.ts`) — and therefore
`AssembledPackage.gaps`, the package's single documented gap-summary surface —
inherits the same omission for any founder who hasn't filled in
`use_of_funds` yet (i.e. exactly the sparse-profile case the summary view
matters most for).

**Impact:** a founder scanning `pkg.gaps` alone (e.g. a checklist UI built
against that single field) would not see these 8 blanks, even though they are
printed inline in the budget line items they'd see if they scrolled to that
section.

**Repro:** `scaffold/lib/eval/__tests__/applicationHonesty.test.ts` → test
"KNOWN FINDING: template line-item justification placeholders (use_of_funds
absent) are rendered but NOT collected into budget.gaps" builds a budget via
the real `buildBudget` on `SPARSE_CASE.profile` (no `use_of_funds`) and shows
every scanned inline placeholder is present in `line_items[].justification`
but absent from `budget.gaps`.

**Suggested remediation (not implemented here):** in `buildBudget`, scan each
line item's `justification` (and any other free-text field that can embed a
placeholder) for inline `[founder to provide: …]` matches the same way
`collectAllGaps` already scans narrative `draft_text`, and add every match to
the `gaps` set — not just `li.amount`.

Both findings are re-asserted by the standalone harness
`evals/application-honesty-eval.mjs` (`known-finding` section) so a future
change to `lib/apply/draft.ts` or `lib/apply/budget.ts` that fixes (or
worsens) either one is caught immediately rather than silently drifting from
this document.

<!-- ====== Grant Auto-Fill Chrome Extension (MV3) — Phase-1/2 blockers (2026-08-16) ====== -->

## Browser recon tooling unavailable → NO live selectors captured (needs in-session pass)
Phase-1 portal recon could not capture any real DOM selectors: the Playwright browser
bridge was unavailable this session — every `browser_navigate` failed with
`Extension connection timeout: Make sure the "Playwright MCP Bridge" extension is installed`
(confirmed by the recon worker AND independently by the dispatcher). Recon fell back to
text-content fetches, so the field map
(`docs/grant-portal-field-map.md`) is honest but selector-free: the SF-424 canonical field
table (boxes 1–21 → package keys) is documented from the public OMB 4040-0004 form structure,
and **every selector is a `TODO: in-session selector capture` placeholder — none fabricated.**

Impact on the build: the extension ships with four seed portal configs whose selectors are all
`TODO`. The runtime resolver treats `TODO` as absent, so v0.1 degrades gracefully (imports a
package, fills 0 fields, flags everything "unmapped") until real selectors are added — this is
enforced invariant INV-9 in `docs/grant-autofill-extension-spec.md`. **No code change is needed
to add selectors later; they are data in the config files.**

**ACTION NEEDED (YOUR action — a human, later):** run an in-session selector-capture pass with
working browser tooling, logged into your OWN portal accounts (grants.gov Workspace,
Research.gov, NIH ASSIST, SBIR.gov), to replace the `TODO` selectors with real `id`/`name`/
`aria`/label strings. The extension README documents the exact procedure. Nothing about the
honesty/security boundary changes — this is purely populating the selector data.

## Portals that are fully / mostly auth-gated (real fill-target fields behind login)
Captured in `docs/grant-portal-field-map.md`; flagged here for the in-session pass priority:
- **NIH ASSIST — FULLY auth-gated.** `https://public.era.nih.gov/assist/` IS the login screen;
  zero application content is public. Highest-priority for in-session capture (nothing else is
  knowable without a logged-in eRA Commons/Login.gov account + mandatory 2FA).
- **Grants.gov Workspace — auth-gated.** The public site is informational only; every SF-424
  data-entry field, the section Next/Save controls, and the Sign-&-Submit control live inside the
  authenticated Workspace (Login.gov-backed).
- **Research.gov — auth-gated.** Proposal-prep fields sit behind "Prepare & Submit Proposals"
  (NSF account). Exact gate-trigger click not traced this pass.
- **SBIR.gov — partially public.** Only the public topic-SEARCH form was reachable (not a fill
  target); company registration / application fields are behind Register/Login.

## Grants.gov Workspace exact host unconfirmed (least-privilege manifest)
The MV3 manifest scopes `host_permissions` to specific portal hosts (no `<all_urls>`). The exact
authenticated Workspace host could not be confirmed without login; `apply07.grants.gov` is
included as the current best guess, flagged `CONFIRM`. Verify the real Workspace host during the
in-session pass and narrow before any Chrome Web Store submission. A `https://*.grants.gov/*`
wildcard is documented as an interim-only fallback, never the shipped default.

## DSIP (DoD SBIR/STTR) deferred from v0.1
`www.dodsbirsttr.mil` is out of scope for extension v0.1 — R6 memo escalation E5 flags its
auth/role model as unverified from a primary source. Adding it later = one manifest host pattern
+ one declarative config, no code change.
