import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { makeLlmClient, isLocalLlm } from "../client";
import { unwrapArrayEnvelope } from "../../claude";

/**
 * The local-model seam. The default (Anthropic) path is exercised by the rest of
 * the suite; here we lock in the translation the verification surfaced: provider
 * detection, the OpenAI-compatible request shape (system BLOCKS flattened to
 * text, JSON mode forced), the Anthropic-shaped response, and the array-envelope
 * unwrap that JSON-object mode makes necessary.
 */

const savedProvider = process.env.LLM_PROVIDER;
const savedModel = process.env.LOCAL_LLM_MODEL;
const realFetch = globalThis.fetch;

afterEach(() => {
  if (savedProvider === undefined) delete process.env.LLM_PROVIDER;
  else process.env.LLM_PROVIDER = savedProvider;
  if (savedModel === undefined) delete process.env.LOCAL_LLM_MODEL;
  else process.env.LOCAL_LLM_MODEL = savedModel;
  globalThis.fetch = realFetch;
});

describe("isLocalLlm — provider detection", () => {
  test("default (unset) is NOT local", () => {
    delete process.env.LLM_PROVIDER;
    assert.equal(isLocalLlm(), false);
  });
  test("'anthropic' is NOT local; 'ollama' IS local", () => {
    process.env.LLM_PROVIDER = "anthropic";
    assert.equal(isLocalLlm(), false);
    process.env.LLM_PROVIDER = "ollama";
    assert.equal(isLocalLlm(), true);
  });
});

describe("openAI-compatible shim — request + response translation", () => {
  test("flattens system BLOCKS to text, forces JSON mode, returns Anthropic shape", async () => {
    process.env.LLM_PROVIDER = "ollama";
    process.env.LOCAL_LLM_MODEL = "gemma4:latest";
    let sentBody: any = null;
    globalThis.fetch = (async (_url: string, init: any) => {
      sentBody = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"ok":true}' } }],
          usage: { prompt_tokens: 11, completion_tokens: 7 },
        }),
      };
    }) as unknown as typeof fetch;

    const client = makeLlmClient({ timeout: 5000 });
    const msg: any = await client.messages.create({
      model: "claude-sonnet-4-6", // the shim ignores this and uses LOCAL_LLM_MODEL
      max_tokens: 1234,
      // system passed as Anthropic cache-control BLOCKS, not a string:
      system: [{ type: "text", text: "SCORE THINGS", cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: "hello" }],
    });

    // request: model swapped to local, system flattened to text, JSON mode on
    assert.equal(sentBody.model, "gemma4:latest");
    assert.equal(sentBody.max_tokens, 1234);
    assert.deepEqual(sentBody.response_format, { type: "json_object" });
    assert.equal(sentBody.messages[0].role, "system");
    assert.equal(sentBody.messages[0].content, "SCORE THINGS"); // NOT "[object Object]"
    assert.equal(sentBody.messages[1].content, "hello");

    // response: Anthropic-shaped (content[].text + usage.{input,output}_tokens)
    assert.equal(msg.content[0].type, "text");
    assert.equal(msg.content[0].text, '{"ok":true}');
    assert.equal(msg.usage.input_tokens, 11);
    assert.equal(msg.usage.output_tokens, 7);
  });
});

describe("unwrapArrayEnvelope — undoes JSON-mode array wrapping", () => {
  test("unwraps a single array-valued key {candidates:[...]} → [...]", () => {
    assert.deepEqual(unwrapArrayEnvelope({ candidates: [{ id: "a", score: 5 }] }), [{ id: "a", score: 5 }]);
  });
  test("leaves a bare array untouched (the default Anthropic path)", () => {
    assert.deepEqual(unwrapArrayEnvelope([{ id: "a" }]), [{ id: "a" }]);
  });
  test("leaves a multi-key object untouched (the object-returning prompts)", () => {
    const profile = { profile: { industry: "bio" }, followUps: ["q"] };
    assert.deepEqual(unwrapArrayEnvelope(profile), profile);
  });
  test("leaves a single non-array key untouched", () => {
    assert.deepEqual(unwrapArrayEnvelope({ summary: "text" }), { summary: "text" });
  });
});
