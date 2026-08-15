import { z } from "zod";

/**
 * R5 — Competitor & Grant Intelligence result contract.
 *
 * The grounded output of the demo capture (scripts/5-competitors.mjs): the REAL
 * federal award records retrieved for a persona, plus a single claude-sonnet-4-6
 * synthesis of "how each awardee positioned itself to win" + tailored, cited
 * recommendations.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE GROUNDING INVARIANT THIS MODULE ENFORCES — do not weaken.
 *
 * This mirrors the defense-in-depth in `lib/eligibility/screen.ts` /
 * `EligibilityDeterminationSchema`: the synthesis may reference ONLY companies
 * that were actually retrieved. Every `competitors[].recordId` and every
 * `recommendations[].citations[]` entry MUST name a record present in
 * `records[]`. `parse()` (via the `superRefine` below) THROWS on any id that is
 * not in the retrieved set — so a fabricated competitor or an ungrounded claim
 * becomes IMPOSSIBLE TO RENDER, not merely discouraged. The renderer
 * (`components/CompetitorResults.tsx`) parses the fixture through this schema at
 * its boundary, and the capture script validates its own output before writing
 * the fixture, so a hallucinated award can never reach the UI.
 *
 * A recommendation with an EMPTY `citations` array is also rejected: every piece
 * of advice must be traceable to at least one real record (§11 "never let a
 * model inference wear the costume of a verified fact").
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** The keyless federal sources the capture fans out to (§2 of the feasibility report). */
export const AwardSourceSchema = z.enum([
  "USAspending",
  "NIH RePORTER",
  "NSF",
  "Grants.gov",
]);
export type AwardSource = z.infer<typeof AwardSourceSchema>;

/**
 * One REAL retrieved federal award record — the only allowed evidence
 * downstream. Every field is copied verbatim from a public government API
 * response; `sourceUrl` deep-links to the public award page a user can click to
 * verify it. `id` is assigned by the capture script and is what the synthesis
 * cites.
 */
export const GroundedAwardRecordSchema = z.object({
  /** Capture-assigned stable id the synthesis cites (e.g. "usa_1", "nih_3"). */
  id: z.string().min(1),
  /** Which keyless federal source this record came from. */
  source: AwardSourceSchema,
  /** Recipient / organization name, verbatim from the source. */
  recipient: z.string().min(1),
  /** Award amount in USD. Nullable — a few source records omit it; never invent one. */
  amount: z.number().nonnegative().nullable(),
  /** Awarding agency / funding IC, verbatim from the source. */
  agency: z.string().min(1),
  /** Program / mechanism (e.g. "STTR Phase I", CFDA), when the source provides it. */
  program: z.string().optional(),
  /** The full description / abstract — the awardee's own self-description. */
  abstract: z.string().min(1),
  /** Real, fetchable public source URL (USAspending / NIH RePORTER / NSF award page). */
  sourceUrl: z.string().url(),
  /** Fiscal / award year, when the source provides it. */
  year: z.number().int().optional(),
  /** Cosine similarity to the persona (rerank score, text-embedding-3-small @512). */
  similarity: z.number().optional(),
});
export type GroundedAwardRecord = z.infer<typeof GroundedAwardRecordSchema>;

/**
 * A synthesized note on ONE kept competitor: how they positioned themselves to
 * win federal funding, grounded in a quote from THAT record's abstract.
 */
export const CompetitorNoteSchema = z.object({
  /** MUST reference a record in `records[]` (enforced by the top-level refine). */
  recordId: z.string().min(1),
  /** How this awardee positioned itself to win — drawn only from its abstract. */
  positioning: z.string().min(1),
  /** A verbatim snippet quoted from the referenced record's abstract. */
  quotedSnippet: z.string().min(1),
});
export type CompetitorNote = z.infer<typeof CompetitorNoteSchema>;

/**
 * One tailored recommendation for the persona. `citations` names the record(s)
 * the advice is drawn from; it must be non-empty and every id must be real.
 */
export const RecommendationSchema = z.object({
  advice: z.string().min(1),
  /** Record ids this advice cites. Non-empty; every id must be in `records[]`. */
  citations: z.array(z.string().min(1)).min(1),
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

/** The grounded synthesis: kept competitors + cited recommendations. */
export const CompetitorSynthesisSchema = z.object({
  /** Optional one-line framing of the landscape (still grounded in the records). */
  summary: z.string().optional(),
  competitors: z.array(CompetitorNoteSchema).min(1),
  recommendations: z.array(RecommendationSchema).min(1),
});
export type CompetitorSynthesis = z.infer<typeof CompetitorSynthesisSchema>;

/** Optional capture-cost provenance (metered like the match pipeline, R4b). */
export const CaptureCostSchema = z.object({
  totalCostUsd: z.number().nonnegative(),
  pricingAsOf: z.string().optional(),
});
export type CaptureCost = z.infer<typeof CaptureCostSchema>;

/**
 * The full fixture written by the capture and read by the renderer. The
 * `superRefine` is the load-bearing anti-fabrication gate (see the header).
 */
export const CompetitorAnalysisSchema = z
  .object({
    /** Persona label (e.g. "FasterControl"). */
    persona: z.string().min(1),
    /** The persona description the retrieval + synthesis were grounded in. */
    personaDescription: z.string().min(1),
    /** ISO-8601 timestamp the real data was retrieved / the analysis generated. */
    capturedAt: z.string().datetime(),
    /** The REAL retrieved records — the only allowed evidence. */
    records: z.array(GroundedAwardRecordSchema).min(1),
    /** The grounded, cited synthesis over those records. */
    analysis: CompetitorSynthesisSchema,
    /** Optional metered capture cost (informational). */
    cost: CaptureCostSchema.optional(),
  })
  .superRefine((data, ctx) => {
    const ids = new Set(data.records.map((r) => r.id));

    // Guard: duplicate record ids would make a citation ambiguous.
    if (ids.size !== data.records.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Record ids must be unique.",
        path: ["records"],
      });
    }

    // Every competitor note must reference a REAL retrieved record.
    data.analysis.competitors.forEach((c, i) => {
      if (!ids.has(c.recordId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Competitor references record id "${c.recordId}" that is not in the retrieved set — ungrounded claims cannot be rendered.`,
          path: ["analysis", "competitors", i, "recordId"],
        });
      }
    });

    // Every recommendation citation must reference a REAL retrieved record.
    data.analysis.recommendations.forEach((rec, i) => {
      rec.citations.forEach((cid, j) => {
        if (!ids.has(cid)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Recommendation cites record id "${cid}" that is not in the retrieved set — ungrounded claims cannot be rendered.`,
            path: ["analysis", "recommendations", i, "citations", j],
          });
        }
      });
    });
  });
export type CompetitorAnalysis = z.infer<typeof CompetitorAnalysisSchema>;

/**
 * Parse an untrusted fixture through the grounding contract. THROWS a `ZodError`
 * if any competitor or cited claim references a record id not present in the
 * retrieved set — the throw-before-render guarantee (mirrors `screen.ts`).
 */
export function parseCompetitorAnalysis(raw: unknown): CompetitorAnalysis {
  return CompetitorAnalysisSchema.parse(raw);
}
