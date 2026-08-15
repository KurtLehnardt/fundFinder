import { NextResponse } from "next/server";
import { buildOpportunityMap, type StepEvent } from "@/lib/match";
import { rateLimit, clientKey } from "@/lib/security/rateLimit";
import { OpportunityMapSchema } from "@/lib/contracts/opportunityMap";
import precomputed from "@/data/precomputed.json";

/**
 * Validate the top-level product payload against its schema at the API boundary
 * (arch review MEDIUM — it was never parsed before streaming). NOTE: we
 * `safeParse` for VALIDATION ONLY and stream the ORIGINAL `map`, never
 * `parsed.data`: the live map carries additive fields (`matches[].eligibility`,
 * `costDebug`) that the schema doesn't declare and zod would strip. `.success`
 * still catches a genuinely malformed shape (missing/typed-wrong required field).
 */
function isValidMap(map: unknown): boolean {
  return OpportunityMapSchema.safeParse(map).success;
}

/**
 * Server-side input bounds for the unauthenticated, real-money match endpoint
 * (security review MEDIUM — denial-of-wallet). A max description length caps
 * per-request embedding + scoring token spend; a best-effort per-IP rate limit
 * blunts naive bursts. All env-overridable; defaults chosen to never impede a
 * real founder or the judged demo.
 */
const MAX_DESCRIPTION_LENGTH = Number(process.env.MAX_DESCRIPTION_LENGTH) || 8_000;
const MATCH_RATE_LIMIT = Number(process.env.MATCH_RATE_LIMIT) || 20;
const MATCH_RATE_WINDOW_MS = Number(process.env.MATCH_RATE_WINDOW_MS) || 60_000;

/**
 * The request→Response core of POST /api/match, extracted from route.ts so it
 * has a hermetic test seam (H6). Next only permits route-handler exports from
 * a `route.ts`, so this lives in a sibling module: route.ts just forwards to
 * `handleMatchRequest`. Tests call it directly with a plain Request and a
 * mocked { buildOpportunityMap, cached } — no network, no model spend.
 */

/** Demo-day insurance: pre-baked results for the five judged test cases. */
export function cached(description: string) {
  const key = description.trim().slice(0, 120);
  const hit = (precomputed as any[]).find((p) => p.key === key);
  return hit?.map;
}

export type MatchDeps = {
  buildOpportunityMap: typeof buildOpportunityMap;
  cached: (description: string) => unknown;
};

const REAL_DEPS: MatchDeps = { buildOpportunityMap, cached };

export async function handleMatchRequest(
  req: Request,
  deps: MatchDeps = REAL_DEPS,
): Promise<Response> {
  // Best-effort per-IP throttle before any parsing/model work.
  const limit = rateLimit(clientKey(req), { limit: MATCH_RATE_LIMIT, windowMs: MATCH_RATE_WINDOW_MS });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "You're searching a lot in a short window — please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
    );
  }

  // Validation errors return plain JSON (the client checks res.ok before
  // reading the stream). Everything else streams NDJSON progress + result.
  let description: string;
  // Founder self-reported registration facts, sanitized to primitives here (the
  // server mints the user_stated provenance in the bridge — never trust a
  // client-supplied provenance label). Optional; absent -> unchanged screening.
  let companyFacts: { samRegistered?: boolean; uei?: string } | undefined;
  try {
    const body = await req.json();
    description = body?.description;
    const cf = body?.companyFacts;
    if (cf && typeof cf === "object") {
      companyFacts = {};
      if (cf.samRegistered === true) companyFacts.samRegistered = true;
      if (typeof cf.uei === "string" && cf.uei.trim().length > 0) {
        companyFacts.uei = cf.uei.trim().slice(0, 64);
      }
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!description || description.trim().length < 20) {
    return NextResponse.json(
      { error: "Add a bit more detail about your company — a sentence or two on what you build, your size, and what you need." },
      { status: 400 }
    );
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return NextResponse.json(
      { error: `That description is too long (max ${MAX_DESCRIPTION_LENGTH.toLocaleString()} characters). Trim it to the essentials and try again.` },
      { status: 400 }
    );
  }

  // One AbortController per request. Fed by BOTH the incoming request's own
  // signal (fires when the client disconnects) and the stream's cancel() (fires
  // when the consumer tears down). Threaded into buildOpportunityMap so an
  // abandoned search stops generating tokens instead of billing the full run.
  const ac = new AbortController();
  const reqSignal = (req as Request & { signal?: AbortSignal }).signal;
  if (reqSignal) {
    if (reqSignal.aborted) ac.abort();
    else reqSignal.addEventListener("abort", () => ac.abort(), { once: true });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        try { controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n")); } catch { /* stream closed */ }
      };
      try {
        const hit = deps.cached(description);
        if (hit) {
          // Pre-baked demo insurance: validate for drift visibility but never
          // block a pre-vetted demo case on it — warn and serve.
          if (!isValidMap(hit)) {
            console.warn("cached map failed OpportunityMap schema validation (serving anyway)");
          }
          send({ type: "progress", key: "cached", label: "Loading your opportunity map", pct: 95 });
          send({ type: "result", map: hit });
          controller.close();
          return;
        }

        const map = await deps.buildOpportunityMap(
          description,
          (e: StepEvent) => send({ type: "progress", ...e }),
          undefined,
          ac.signal,
          companyFacts,
        );
        // Catch a live-shape drift at the boundary rather than shipping a
        // malformed payload the client can only guess at.
        if (!isValidMap(map)) {
          console.error("buildOpportunityMap produced a map that failed schema validation");
          send({ type: "error", error: "The search didn't complete. Please try again." });
          controller.close();
          return;
        }
        send({ type: "result", map });
        controller.close();
      } catch (err: any) {
        // Abort (client gone) is expected — don't log it as a failure.
        if (ac.signal.aborted || err?.name === "AbortError") {
          try { controller.close(); } catch { /* already closed */ }
          return;
        }
        // Log the full error server-side; send a GENERIC message to the client
        // (never raw err.message / env-var names — security review LOW).
        console.error("match failed:", err);
        send({ type: "error", error: "The search didn't complete. Please try again." });
        controller.close();
      }
    },
    // Consumer canceled (navigated away / closed the tab) — abort in-flight
    // model calls so the abandoned search stops spending.
    cancel() {
      ac.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      // Discourage proxy buffering so milestones arrive as they happen.
      "X-Accel-Buffering": "no",
    },
  });
}
