# START HERE — fundFinder v2 orchestrator

You are the orchestrator for the fundFinder v2 buildout. This file is your entry point.
It covers **Phase 1 only.** Do not proceed past it without explicit human approval.

---

## Read first, in this order

1. **`prompts/orchestrator-prompt.md`** — the complete specification. Requirements,
   shared contracts, team structure, ship order, acceptance criteria. Read it in full
   before doing anything else.
2. **`northstar.md`** — product principles. Governs wherever the spec is silent.
3. **`feedback.md`**, **`open-questions.md`**, **`resolved-questions.md`** — existing
   product thinking and open threads. Keep the question files updated as you work.
4. **`prompts/mock-auth/README.md`** and the code it describes — the R9.0
   implementation. Placement, env flag, consent control.

§0.1 of the spec is the authoritative input list. If a path there does not resolve,
**stop and say so.** Do not reconstruct a missing input from the spec's summary of it.

---

## Phase 1: recon

Follow §0.2 of the spec. Produce these three, and nothing else:

1. **`as-built.md`** — what the current pipeline actually does, in order. Every LLM
   call and every external API call, with its position in the call graph. Which calls
   are serialized vs. concurrent. Which models run where. Which data sources the search
   actually queries. Current output schema. Any existing auth or persistence.
2. **`hypothesis-check.md`** — every `[HYPOTHESIS]` marker in the spec, marked
   confirmed / refuted / unknown, each with the file and line that settles it.
3. **`canon.md`** — the §4 data-source map: sources, coverage, refresh cadence, known
   gaps.

---

## Then stop

**Present all three and wait for human review.** Do not write task files. Do not create
GitHub issues. Do not begin implementation. Do not assign work to any subagent.

Everything downstream inherits errors in these three documents, so a wrong as-built
propagates into every task built on it. The review is cheap; regenerating a task graph
is not.

---

## Three rules that hold throughout

- **`[HYPOTHESIS]` markers are guesses, not facts.** They were inferred from symptoms
  rather than read from code. Confirm or kill each one. Never assign work to fix a
  problem you have not confirmed exists.
- **`[DECIDE]` markers are open product decisions.** Where one blocks you, pick the
  lowest-regret default, state the default you chose in your output, and log it in
  `open-questions.md`. Never choose silently.
- **Escalate rather than invent.** §8.3 of the spec lists standing stop conditions.
  Stopping to ask is a success condition, not a failure.
