import type { CostMeter } from "./metering/meter";

/**
 * Embeddings via OpenAI text-embedding-3-small.
 * Programs are embedded once at build time (scripts/3-embed.mjs); founder
 * queries are embedded here at runtime. Both must use the SAME model or the
 * vectors are not comparable.
 */
const MODEL = "text-embedding-3-small";

export async function embed(text: string, meter?: CostMeter, signal?: AbortSignal): Promise<number[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set. Add it to .env.local and to your Vercel project settings.");

  const t0 = performance.now();
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: MODEL, dimensions: 512, input: text }),
    signal,
  });

  if (!res.ok) throw new Error(`Embedding request failed (${res.status}): ${await res.text()}`);
  const json = await res.json();
  // R4b — record usage the instant it's available (json.usage), BEFORE
  // reaching into json.data[0].embedding below, which can throw on a
  // malformed response body; an already-spent call's cost must never go
  // unrecorded because of that later access. Embeddings have no output
  // tokens/cost — see lib/metering/pricing.ts's comment on why.
  meter?.record({
    stage: "query_embedding",
    provider: "openai",
    model: MODEL,
    inputTokens: json?.usage?.prompt_tokens ?? 0,
    outputTokens: 0,
    latencyMs: performance.now() - t0,
  });
  return json.data[0].embedding as number[];
}

/**
 * Batch embeddings — one OpenAI request for many inputs instead of N serial
 * round-trips. Same model/dimensions as `embed()` so the vectors stay
 * comparable. Returns one vector per input, in the SAME order as `texts`
 * (OpenAI returns each item with an explicit `index`; we sort by it defensively
 * rather than trusting response ordering). Inputs are chunked to stay well
 * within request limits, and the chunks run concurrently.
 *
 * This is the rerank hot path (lib/competitors/analyze.ts): the old per-record
 * `await embed()` loop turned a handful of records into a wall of sequential
 * HTTP latency; a single batched call collapses that to ~one round-trip.
 */
export async function embedBatch(
  texts: string[],
  meter?: CostMeter,
  signal?: AbortSignal,
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set. Add it to .env.local and to your Vercel project settings.");

  const CHUNK = 128;
  const chunks: string[][] = [];
  for (let i = 0; i < texts.length; i += CHUNK) chunks.push(texts.slice(i, i + CHUNK));

  const perChunk = await Promise.all(
    chunks.map(async (chunk) => {
      const t0 = performance.now();
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: MODEL, dimensions: 512, input: chunk }),
        signal,
      });
      if (!res.ok) throw new Error(`Batch embedding request failed (${res.status}): ${await res.text()}`);
      const json = await res.json();
      // R4b — meter the instant usage is available, before the data access below can throw.
      meter?.record({
        stage: "query_embedding",
        provider: "openai",
        model: MODEL,
        inputTokens: json?.usage?.prompt_tokens ?? 0,
        outputTokens: 0,
        latencyMs: performance.now() - t0,
      });
      const data = (json.data as Array<{ index: number; embedding: number[] }>)
        .slice()
        .sort((a, b) => a.index - b.index);
      return data.map((d) => d.embedding);
    }),
  );
  return perChunk.flat();
}

/** Cosine similarity. No vector DB — a few thousand programs is a loop. */
export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
