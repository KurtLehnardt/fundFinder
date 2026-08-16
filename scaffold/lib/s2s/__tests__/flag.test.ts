import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { isFlagEnabled } from "../../flags";
import { FLAG_REGISTRY } from "../../flags/registry";

/**
 * The `g6_s2s_submission` flag, read through the real accessor. Follows the
 * env-mutation style of `lib/flags/__tests__/accessor.test.ts`: save/restore
 * `process.env` and clear the flag's env var so the test is hermetic regardless
 * of the outer shell/CI. Default is OFF by construction (spec §11.1).
 */

const ENV_VAR = FLAG_REGISTRY.g6_s2s_submission.envVar;

let savedEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  savedEnv = { ...process.env };
  delete process.env[ENV_VAR];
});

afterEach(() => {
  process.env = savedEnv;
});

describe("g6_s2s_submission flag", () => {
  test("its env var is the documented NEXT_PUBLIC_ name", () => {
    assert.equal(ENV_VAR, "NEXT_PUBLIC_FLAG_G6_S2S_SUBMISSION");
  });

  test("defaults OFF with no env set", () => {
    assert.equal(isFlagEnabled("g6_s2s_submission"), false);
  });

  test("flips ON when NEXT_PUBLIC_FLAG_G6_S2S_SUBMISSION=true", () => {
    process.env.NEXT_PUBLIC_FLAG_G6_S2S_SUBMISSION = "true";
    assert.equal(isFlagEnabled("g6_s2s_submission"), true);
  });
});
