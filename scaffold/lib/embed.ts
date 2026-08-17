import type { CostMeter } from "./metering/meter";

/**
 * Embeddings. Default: OpenAI text-embedding-3-small @ 512 dims, which matches
 * the committed corpus (programs are embedded once at build time via
 * scripts/3-embed.mjs; founder queries are embedded here at runtime — both must
 * use the SAME model or the vectors aren't comparable).
 *
 * The same env seam as lib/llm/client.ts lets you point at a LOCAL,
 * OpenAI-compatible embedder (e.g. Ollama's `nomic-embed-text`) for a fully
 * offline run — but then RE-EMBED the corpus with that model (`npm run
 * data:embed`), since vectors are only comparable within one model.
 *
 * Env: EMBEDDINGS_BASE_URL / EMBEDDINGS_MODEL / EMBEDDINGS_DIMENSIONS /
 *      EMBEDDINGS_API_KEY (falls back to OPENAI_API_KEY).
 */
const BASE_URL = (process.env.EMBEDDINGS_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const MODEL = process.env.EMBEDDINGS_MODEL || "text-embedding-3-small";
const IS_OPENAI = /api\.openai\.com/.test(BASE_URL);
// OpenAI's text-embedding-3-* accept a `dimensions` param (512 matches the
// corpus); local models have a fixed size, so we omit it there.
const DIMENSIONS = process.env.EMBEDDINGS_DIMENSIONS
  ? Number(process.env.EMBEDDINGS_DIMENSIONS)
  : IS_OPENAI
    ? 512
    : undefined;

function embeddingKey(): string {
  const key = process.env.EMBEDDINGS_API_KEY || process.env.OPENAI_API_KEY;
  if (!key && IS_OPENAI) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to .env.local (or set EMBEDDINGS_BASE_URL to a local embedder).",
    );
  }
  return key || "local"; // local endpoints (Ollama) ignore the bearer token
}

function embedBody(input: string | string[]): string {
  return JSON.stringify(
    DIMENSIONS != null ? { model: MODEL, dimensions: DIMENSIONS, input } : { model: MODEL, input },
  );
}

export async function embed(text: string, meter?: CostMeter, signal?: AbortSignal): Promise<number[]> {
  const key = embeddingKey();
  const t0 = performance.now();
  const res = await fetch(`${BASE_URL}/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: embedBody(text),
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
  const key = embeddingKey();

  const CHUNK = 128;
  const chunks: string[][] = [];
  for (let i = 0; i < texts.length; i += CHUNK) chunks.push(texts.slice(i, i + CHUNK));

  const perChunk = await Promise.all(
    chunks.map(async (chunk) => {
      const t0 = performance.now();
      const res = await fetch(`${BASE_URL}/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: embedBody(chunk),
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
