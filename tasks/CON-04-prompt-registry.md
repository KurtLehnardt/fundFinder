# CON-04 — Prompt registry (versioned, content-hashed)

**Team:** Contracts
**Release slice:** 1
**Depends on:** none (references CON-01 model-routing type where useful)
**Blocks:** INT/VER/PRF prompt work, R10.2 reproducibility

## Context
R10.2: every prompt lives in a registry with a **version + content hash**; prompts are **not edited
inline** in application code; every run records the prompt version(s) it used. v1 has prompts inline
in `scaffold/lib/claude.ts` (`extractProfile`, `explainMatches`, `explainWeakField`).

## Files in scope
- CREATE `scaffold/lib/prompts/` — registry (`{ id, version, contentHash, template }`), a loader,
  and a hash utility.
- Register the v1 prompts as the first entries **byte-identical** (content-hashed) — a documented
  example, WITHOUT changing their text or runtime behavior.
- A check/lint that flags new inline prompt strings outside the registry.

## Definition of done
- [ ] Registry with version + content hash per prompt; loader returns template + version.
- [ ] v1 `claude.ts` prompts registered byte-identical (hash recorded); **runtime behavior and the
      5 cached cases unchanged** (v1 text not altered).
- [ ] A run can record which prompt version(s) it used (surface the version on the loader).
- [ ] `tsc` + `build` green.

## Out of scope
New prompts (interview/triage/verification — their teams author them, registered here later),
changing any v1 prompt's text/behavior, model routing enforcement (PRF-02).

## Escalate if
- Migrating a v1 prompt into the registry would change its text or output → keep byte-identical; surface.
