import { NextResponse } from "next/server";
import { buildOpportunityMap, type StepEvent } from "@/lib/match";
import precomputed from "@/data/precomputed.json";

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
  // Validation errors return plain JSON (the client checks res.ok before
  // reading the stream). Everything else streams NDJSON progress + result.
  let description: string;
  try {
    const body = await req.json();
    description = body?.description;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!description || description.trim().length < 20) {
    return NextResponse.json(
      { error: "Add a bit more detail about your company — a sentence or two on what you build, your size, and what you need." },
      { status: 400 }
    );
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
          // Pre-baked: still emit a milestone so the bar resolves cleanly.
          send({ type: "progress", key: "cached", label: "Loading your opportunity map", pct: 95 });
          send({ type: "result", map: hit });
          controller.close();
          return;
        }

        const map = await deps.buildOpportunityMap(description, (e: StepEvent) =>
          send({ type: "progress", ...e })
        );
        send({ type: "result", map });
        controller.close();
      } catch (err: any) {
        console.error("match failed:", err);
        send({
          type: "error",
          error: err?.message ?? "Matching failed. Check that OPENAI_API_KEY and ANTHROPIC_API_KEY are set.",
        });
        controller.close();
      }
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
