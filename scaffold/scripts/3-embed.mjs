/**
 * Step 3 — embed every program description once, at build time.
 * The app embeds the founder's query at request time with the SAME model.
 * Change the model here and you must change it in lib/embed.ts too.
 */
import { readFile, writeFile } from "node:fs/promises";

const MODEL = "text-embedding-3-small";
const KEY = process.env.OPENAI_API_KEY;
if (!KEY) {
  console.error("OPENAI_API_KEY is not set. It's in your .zshrc — open a new shell or `source ~/.zshrc`.");
  process.exit(1);
}

const opps = JSON.parse(await readFile("data/opportunities.json", "utf8"));
const BATCH = 32; // small batches keep us under freshly-funded (low-tier) TPM limits
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** POST one batch, retrying with exponential backoff on 429/5xx (honors Retry-After). */
async function embedBatch(inputs, attempt = 0) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: MODEL, dimensions: 512, input: inputs }),
  });

  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 7) throw new Error(`Gave up after ${attempt} retries (${res.status}): ${await res.text()}`);
    const ra = Number(res.headers.get("retry-after"));
    const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(60000, 1000 * 2 ** attempt);
    process.stdout.write(`\n  ${res.status} rate-limited — backing off ${Math.round(wait / 1000)}s (retry ${attempt + 1}/7)`);
    await sleep(wait);
    return embedBatch(inputs, attempt + 1);
  }
  if (!res.ok) throw new Error(`Embeddings failed (${res.status}): ${await res.text()}`);
  return (await res.json()).data;
}

let done = 0;
for (let i = 0; i < opps.length; i += BATCH) {
  const slice = opps.slice(i, i + BATCH);
  const data = await embedBatch(slice.map((o) => `${o.program}. ${o.agency}. ${o.description}`.slice(0, 8000)));
  data.forEach((d, k) => {
    slice[k].embedding = d.embedding.map((v) => Math.round(v * 1e5) / 1e5);
  });
  done += slice.length;
  process.stdout.write(`\rembedded ${done}/${opps.length}`);
  await sleep(400); // gentle inter-batch pacing
}

await writeFile("data/opportunities.json", JSON.stringify(opps));
console.log(`\n→ ${done} programs embedded with ${MODEL}`);
console.log("Next: npm run dev — then npm run data:precompute once it works");
