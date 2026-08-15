/**
 * Embeddings via OpenAI text-embedding-3-small.
 * Programs are embedded once at build time (scripts/3-embed.mjs); founder
 * queries are embedded here at runtime. Both must use the SAME model or the
 * vectors are not comparable.
 */
const MODEL = "text-embedding-3-small";

export async function embed(text: string): Promise<number[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set. Add it to .env.local and to your Vercel project settings.");

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: MODEL, dimensions: 512, input: text }),
  });

  if (!res.ok) throw new Error(`Embedding request failed (${res.status}): ${await res.text()}`);
  const json = await res.json();
  return json.data[0].embedding as number[];
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
