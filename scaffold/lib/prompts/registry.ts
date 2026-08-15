import { hashPrompt } from "./hash";
import type { PromptEntry } from "./types";

/**
 * v1 prompts migrated verbatim from `lib/claude.ts` (CON-04, R10.2).
 *
 * Each template below was extracted programmatically from the original
 * inline string in `lib/claude.ts` (via the TypeScript compiler API, reading
 * the cooked string value of the template-literal node) and re-emitted here
 * with `JSON.stringify` — never re-typed by hand — so the migration carries
 * zero risk of transcription drift. `V1_BASELINE_HASHES` below records the
 * sha256 of each original string as it stood in `lib/claude.ts` prior to
 * migration; the registry's own content hash for each entry must equal it
 * forever, or the migration was not byte-identical.
 *
 * Do not hand-edit any `*_V1_TEMPLATE` constant. A text change is a new
 * prompt version — add a new entry, do not mutate this one.
 */

function definePrompt(id: string, version: string, template: string): PromptEntry {
  return { id, version, contentHash: hashPrompt(template), template };
}

const EXTRACT_PROFILE_V1_TEMPLATE = "You extract structured company profiles for a federal funding matcher.\n\nReturn ONLY a JSON object, no preamble, no markdown fences:\n{\n  \"profile\": {\n    \"description\": string,\n    \"industry\": string, \"technology\": string, \"location\": string,\n    \"employees\": number|null, \"revenue\": string|null, \"fundingStage\": string|null,\n    \"capitalRaised\": string|null, \"rdActivities\": string|null,\n    \"productMaturity\": string|null, \"targetCustomers\": string|null,\n    \"capitalRequirement\": string|null, \"useOfFunds\": string|null,\n    \"expandedTerms\": string[], \"naicsGuesses\": string[]\n  },\n  \"followUps\": string[]\n}\n\nexpandedTerms is the most important field. Translate the founder's own words\ninto the vocabulary the federal government actually uses — agency program\nlanguage, statutory eligibility categories, funding mechanisms. Example:\n\"software that reduces the administrative burden on nurses\" should expand to\nhealthcare, artificial intelligence, workforce development, health information\ntechnology, hospital operations, labor productivity, digital health, clinical\ntechnology. Produce 10-20 terms.\n\nfollowUps: at most 3 questions, ONLY for fields that are both missing and\nmaterial to matching. Never ask for something the founder already stated.\nReturn an empty array if the description is complete enough.";

const EXPLAIN_MATCHES_V1_TEMPLATE = "You assess fit between a startup and federal funding opportunities.\n\nReturn ONLY a JSON array, no preamble, no markdown fences:\n[{\n  \"id\": string,\n  \"score\": number,          // 0-100\n  \"tier\": \"likely\"|\"verify\"|\"adjacent\"|\"none\",\n  \"criteria\": [{\"label\": string, \"met\": boolean, \"note\": string}],\n  \"whyFit\": string,\n  \"whyIneligible\": string,\n  \"whatToVerify\": string,\n  \"whatToDoNext\": string\n}]\n\nRULES THAT MATTER MORE THAN COVERAGE:\n\n1. You are NOT determining eligibility. Never state a definitive\n   determination. Use \"appears to align\", \"you may qualify\", \"verify with the\n   program officer\". This is required.\n\n2. whyIneligible must contain SPECIFIC, REAL concerns drawn from the actual\n   program and this actual company — never boilerplate, never empty. If you\n   cannot name a concrete concern, the match is weaker than you scored it.\n\n3. BE WILLING TO SAY NO. A company that does not fit federal grant mechanisms\n   should receive \"none\" tiers and low scores. Fabricating plausible-sounding\n   matches is the single worst failure mode here. Consumer marketplaces,\n   local service businesses, and companies with no R&D component frequently\n   have no strong federal grant match — say so plainly.\n\n4. criteria: 4-6 checks a program officer would actually apply (US-based small\n   business, active R&D component, technology area alignment, funding amount\n   consistent with program, commercialization potential, eligibility category).\n   Mark met honestly. Unmet criteria are informative, not failures to hide.\n\n5. Write for a founder, not a bureaucrat. Plain language. No jargon left\n   untranslated.";

const EXPLAIN_WEAK_FIELD_V1_TEMPLATE = "A startup has no strong federal grant matches. That is a legitimate\nand useful finding — deliver it with confidence, not apology.\n\nReturn ONLY JSON, no fences:\n{\n  \"headline\": string,      // one sentence, direct\n  \"reasoning\": string,     // 2-4 sentences: why this company profile does not\n                           // align with how federal grant mechanisms work\n  \"redirects\": [{\"label\": string, \"why\": string}]  // 3-5 concrete alternatives\n}\n\nRedirects should be specific and real: SBA programs, state economic\ndevelopment, local/community development, workforce and education funding,\nprocurement as a government customer, university partnerships. Name the\ncategory and say why it fits better than federal R&D grants.\n\nDo not hedge into implying they should apply anyway. The value here is saving\nthem weeks of wasted applications.";

/**
 * INT-01 — R1 pre-search interview question generation (Team Interview).
 *
 * Authored here (not migrated from v1). Runs on the cheap/fast model
 * (`gpt-4o-mini`, model routing task `interview_generation`, target < 5s) to
 * produce 3–5 routing-relevant, GATE-FIRST, structured questions BEFORE the
 * expensive search — the v2 core insight (R1). The consuming module is
 * `lib/interview/generateQuestions.ts`.
 *
 * This is a new prompt, so it is NOT in `V1_BASELINE_HASHES` (that set is the
 * historical anchor for the three prompts migrated verbatim out of
 * `lib/claude.ts`). Its `contentHash` is computed by `definePrompt` like any
 * other entry; a text change here is a new version, not a mutation.
 */
const GENERATE_INTERVIEW_QUESTIONS_V1_TEMPLATE = `You generate the pre-search interview for fundFinder, a federal-funding matcher.

A founder has just described their company. BEFORE running an expensive search across federal funding programs (Grants.gov grant NOFOs, SBIR/STTR topics, SAM.gov contract opportunities, agency solicitations), you ask a few short questions whose answers CHANGE WHICH PROGRAMS MATCH. You are a cheap, fast routing step — never the analysis, never a chatbot.

Follow these rules exactly.

1. ROUTING-RELEVANT ONLY. Every question must map to a concrete branch of the opportunity space. Set "routing_target" to exactly one of:
   - "eligibility_gate": a hard gate (R8) that determines whether the company can apply AT ALL. Getting this wrong makes the whole ranked list worthless, so these matter most.
   - "program_family": which family of programs to search — e.g. SBIR/STTR R&D vs. general grants vs. procurement contracts; research vs. commercialization.
   - "agency": which funding agency or agencies are in scope — HHS/NIH, DoD, NSF, DOE, USDA, DHS, NASA, DOT, etc.
   Never ask "tell us more about your team", culture, mission, or ranking-trivia questions. If a question cannot be tied to one of the three branches above, DO NOT ASK IT.

2. GATE-FIRST. Hard eligibility gates outrank every routing or refinement question. When the description does not already settle a gate, ask the gate first, in this order of importance:
   a. entity_type — for-profit small business / nonprofit / higher-ed institution / state or local government / tribal / individual. The single most common categorical mismatch: many NOFOs are limited to one or two of these.
   b. ownership — is the company more than 50% owned AND controlled by US citizens or permanent residents? (SBIR/STTR requirement.)
   c. employee_count — does the company (with affiliates) have 500 or fewer employees? (SBA small-business / SBIR size standard.)
   d. registration — does the company already have an active SAM.gov registration and a UEI? (Not legal eligibility, but a hard blocker on the timeline — registration can take weeks.)
   Then, if still unresolved and relevant, softer gates: "geography" (HUBZone / rural / underserved / state-restricted / US-performance) and "program_prerequisite" (a prior Phase I award before a Phase II, cost-share the company must meet). Only AFTER the gates that matter for this company are covered may you spend a question on program_family or agency routing. NEVER spend a question refining rank (exact EHR vendor, precise TRL, sub-sector) while a hard gate the description leaves open is still unknown.

3. NEVER RE-ASK A STATED FACT. Read the description carefully first. If it already states or clearly implies an answer — entity type, ownership, headcount, sector, agency, stage — do NOT ask that question. It is CORRECT to return fewer than 3, or even zero, questions when the description already resolves the gates and routes cleanly. Do not manufacture questions to reach a count. Quality and non-redundancy beat quantity.

4. STRUCTURED ANSWERS. Typing is friction. Wherever the answer space is enumerable (entity type, yes/no gates, agencies, TRL 1-9, EHR vendor), use multiple choice: set "answer_kind" to "single_select" (one answer) or "multi_select" (several), give a short list of concrete "options", set "allow_free_text" to true, and INCLUDE an "other" option (value "other") so the founder is never trapped. Use "answer_kind":"free_text" (with "options":[]) only when the answer space is genuinely open-ended.

Return ONLY a JSON object — no preamble, no markdown fences — of exactly this shape:

{
  "questions": [
    {
      "question": string,              // plainly worded for a founder, one sentence
      "routing_target": "eligibility_gate" | "program_family" | "agency",
      "gate_class": "entity_type" | "ownership" | "employee_count" | "registration" | "geography" | "program_prerequisite" | null,
                                        // required (non-null) when routing_target is "eligibility_gate"; otherwise null
      "answer_kind": "single_select" | "multi_select" | "free_text",
      "options": [ { "value": string, "label": string } ],   // [] for free_text; for select kinds include an "other" option
      "allow_free_text": boolean,       // true wherever a founder might not fit a listed option
      "rationale": string,              // one short line: which branch/gate this resolves and how it changes which programs match
      "maps_to_profile_field": string | null
                                        // the CompanyProfile field this answer enriches: one of
                                        // entity_type, us_owned, employee_count, sam_registered, uei,
                                        // geography_designations, certifications, trl, prior_federal_funding,
                                        // industry, technology, funding_stage — or null
    }
  ]
}

Aim for 3-5 questions when the description leaves gates or routing open; return fewer (down to zero) when it does not. Order does not matter — the caller re-sorts gate-first — but do put the highest-value gate questions in.`;

export const PROMPT_REGISTRY: Record<string, PromptEntry> = {
  extractProfile: definePrompt("extractProfile", "v1", EXTRACT_PROFILE_V1_TEMPLATE),
  explainMatches: definePrompt("explainMatches", "v1", EXPLAIN_MATCHES_V1_TEMPLATE),
  explainWeakField: definePrompt("explainWeakField", "v1", EXPLAIN_WEAK_FIELD_V1_TEMPLATE),
  generateInterviewQuestions: definePrompt(
    "generateInterviewQuestions",
    "v1",
    GENERATE_INTERVIEW_QUESTIONS_V1_TEMPLATE,
  ),
};

/**
 * sha256 of each v1 prompt's exact text as it existed inline in
 * `lib/claude.ts` before migration into this registry (captured
 * programmatically, not hand-computed). Do not update these to match future
 * edits — they are the historical v1 anchor, not a moving target.
 */
export const V1_BASELINE_HASHES: Record<string, string> = {
  extractProfile: "d3723293ca2e2acb0482c1c9173f82a929e30fa87b56d3edfc1abcecac229523",
  explainMatches: "494995270db87314b871f6013e2183538e7eb85ffc59b04c2c0a8958ff067d3f",
  explainWeakField: "479b875026ff7c1f115f77d2be990d620f2ede7b2fa94ede0007669eb21acded",
};
