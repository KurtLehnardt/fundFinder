import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST } from "../route";
import { __resetRateLimits } from "@/lib/security/rateLimit";

/**
 * B1b /api/extract-profile route — the "never a 5xx" contract, mirroring
 * app/api/interview/__tests__/route.test.ts. `extractProfile` (lib/claude.ts)
 * reads `ANTHROPIC_API_KEY` from the environment; the route promises the
 * client it degrades to `{ profile: null }` on ANY extraction failure rather
 * than surfacing a 500, so a broken/missing key never blocks the structured
 * form's manual-entry path.
 */

const VALID_DESCRIPTION =
  "We build AI-assisted diagnostics for rural clinics and need federal funding.";

function post(body: string): NextRequest {
  return new NextRequest("http://localhost/api/extract-profile", {
    method: "POST",
    body,
  });
}

test("missing description -> 400", async () => {
  __resetRateLimits();
  const res = await POST(post(JSON.stringify({})));
  assert.equal(res.status, 400);
  const j = await res.json();
  assert.ok(j.error);
});

test("description under 20 chars -> 400", async () => {
  __resetRateLimits();
  const res = await POST(post(JSON.stringify({ description: "too short" })));
  assert.equal(res.status, 400);
  const j = await res.json();
  assert.ok(j.error);
});

test("invalid JSON body -> 400", async () => {
  __resetRateLimits();
  const res = await POST(post("{ not valid json"));
  assert.equal(res.status, 400);
  const j = await res.json();
  assert.ok(j.error);
});

test("description over the max length -> 400", async () => {
  __resetRateLimits();
  const res = await POST(post(JSON.stringify({ description: "x".repeat(8_001) })));
  assert.equal(res.status, 400);
  const j = await res.json();
  assert.ok(j.error);
});

test("valid description with ANTHROPIC_API_KEY unset -> extraction fails internally but the route still returns 200 with { profile: null } (never a 5xx)", async () => {
  __resetRateLimits();
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const res = await POST(post(JSON.stringify({ description: VALID_DESCRIPTION })));
    assert.equal(res.status, 200);
    const j = await res.json();
    assert.deepEqual(j, { profile: null });
  } finally {
    if (saved === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = saved;
  }
});
