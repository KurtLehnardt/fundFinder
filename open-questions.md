# Open Questions

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

---

Both findings are re-asserted by the standalone harness
`evals/application-honesty-eval.mjs` (`known-finding` section) so a future
change to `lib/apply/draft.ts` or `lib/apply/budget.ts` that fixes (or
worsens) either one is caught immediately rather than silently drifting from
this document.
