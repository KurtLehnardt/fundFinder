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
const BATCH = 100;
let done = 0;

for (let i = 0; i < opps.length; i += BATCH) {
  const slice = opps.slice(i, i + BATCH);
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      input: slice.map((o) => `${o.program}. ${o.agency}. ${o.description}`.slice(0, 8000)),
    }),
  });

  if (!res.ok) {
    console.error(`Batch at ${i} failed (${res.status}): ${await res.text()}`);
    process.exit(1);
  }

  const json = await res.json();
  json.data.forEach((d, k) => { slice[k].embedding = d.embedding; });
  done += slice.length;
  process.stdout.write(`\rembedded ${done}/${opps.length}`);
}

await writeFile("data/opportunities.json", JSON.stringify(opps));
console.log(`\n→ ${done} programs embedded with ${MODEL}`);
console.log("Next: npm run dev — then npm run data:precompute once it works");
