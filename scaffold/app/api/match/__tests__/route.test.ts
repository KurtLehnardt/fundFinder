import { test } from "node:test";
import assert from "node:assert/strict";

import { handleMatchRequest, type MatchDeps } from "../route";
import type { OpportunityMap } from "@/lib/types";

/**
 * NDJSON /api/match route tests (H6). `handleMatchRequest` is the pure
 * request→Response core the Next `POST` forwards to; here it's called with a
 * plain Request and a mocked buildOpportunityMap/cached, so validation, the
 * cache short-circuit, NDJSON framing, and the mid-stream error path are all
 * exercised in-process — no network, no model spend.
 */

const VALID_DESCRIPTION =
  "We build AI-assisted diagnostics for rural clinics and need federal funding.";

function post(body: string): Request {
  return new Request("http://localhost/api/match", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

/** Drain a streamed Response into parsed NDJSON lines (JSON.parse throws if a
 *  line isn't independently parseable — that IS the framing assertion). */
async function readLines(res: Response): Promise<any[]> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    if (done) break; // reaching done proves the stream closes, never hangs
  }
  buf += dec.decode();
  return buf
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

const fakeMap = {
  profile: { description: VALID_DESCRIPTION },
  followUps: [],
  summary: { highPotential: 1, fundingIdentified: 0, agencies: 1, closingIn90Days: 0 },
  matches: [],
  agencyIntelligence: [],
} as unknown as OpportunityMap;

test("missing description → 400 JSON, not a stream", async () => {
  const res = await handleMatchRequest(post(JSON.stringify({})), {
    cached: () => undefined,
    buildOpportunityMap: async () => fakeMap,
  });
  assert.equal(res.status, 400);
  assert.match(res.headers.get("content-type") ?? "", /application\/json/);
  const j = await res.json();
  assert.ok(j.error);
});

test("description under 20 chars → 400 JSON", async () => {
  const res = await handleMatchRequest(post(JSON.stringify({ description: "too short" })), {
    cached: () => undefined,
    buildOpportunityMap: async () => fakeMap,
  });
  assert.equal(res.status, 400);
});

test("invalid JSON body → 400 JSON", async () => {
  const res = await handleMatchRequest(post("{ not valid json"), {
    cached: () => undefined,
    buildOpportunityMap: async () => fakeMap,
  });
  assert.equal(res.status, 400);
  const j = await res.json();
  assert.ok(j.error);
});

test("a precomputed cache hit returns the cached map via one progress + one result line, without calling buildOpportunityMap", async () => {
  let buildCalls = 0;
  const deps: MatchDeps = {
    cached: () => fakeMap,
    buildOpportunityMap: async () => {
      buildCalls++;
      return fakeMap;
    },
  };
  const res = await handleMatchRequest(post(JSON.stringify({ description: VALID_DESCRIPTION })), deps);
  const lines = await readLines(res);
  assert.equal(buildCalls, 0, "cache hit must not invoke buildOpportunityMap");
  assert.equal(lines.filter((l) => l.type === "result").length, 1);
  assert.ok(lines.some((l) => l.type === "progress"));
});

test("NDJSON stream: every line parses; a progress line precedes exactly one terminal result; pct non-decreasing", async () => {
  const deps: MatchDeps = {
    cached: () => undefined,
    buildOpportunityMap: async (_desc, onStep) => {
      onStep?.({ key: "start", label: "a", pct: 5 });
      onStep?.({ key: "score", label: "b", pct: 50 });
      onStep?.({ key: "assemble", label: "c", pct: 90 });
      return fakeMap;
    },
  };
  const res = await handleMatchRequest(post(JSON.stringify({ description: VALID_DESCRIPTION })), deps);
  assert.match(res.headers.get("content-type") ?? "", /x-ndjson/);
  const lines = await readLines(res); // throws if any line isn't valid JSON

  const results = lines.filter((l) => l.type === "result");
  assert.equal(results.length, 1, "exactly one result line terminates the stream");
  const resultIdx = lines.findIndex((l) => l.type === "result");
  assert.ok(
    lines.slice(0, resultIdx).some((l) => l.type === "progress"),
    "a progress line must precede the result",
  );
  assert.equal(resultIdx, lines.length - 1, "the result is the last line");

  const pcts = lines.filter((l) => l.type === "progress").map((l) => l.pct);
  for (let i = 1; i < pcts.length; i++) {
    assert.ok(pcts[i] >= pcts[i - 1], "progress pct must be non-decreasing");
  }
});

test("buildOpportunityMap throwing mid-stream emits a type:'error' line and the stream still closes cleanly", async () => {
  const deps: MatchDeps = {
    cached: () => undefined,
    buildOpportunityMap: async () => {
      throw new Error("kaboom");
    },
  };
  const res = await handleMatchRequest(post(JSON.stringify({ description: VALID_DESCRIPTION })), deps);
  const lines = await readLines(res); // returning at all proves it closed (no hang)
  const errs = lines.filter((l) => l.type === "error");
  assert.equal(errs.length, 1);
  assert.ok(errs[0].error && typeof errs[0].error === "string" && errs[0].error.length > 0);
  assert.equal(lines.filter((l) => l.type === "result").length, 0);
});
