import { z } from "zod";
import { SubscriptionTierSchema } from "./entitlements";

/**
 * §3.10 — RunBudget (per-tier, per-search ceiling from §5.2)
 *
 * The hard token/cost ceiling a single search may spend, enforced in the
 * pipeline executor rather than checked ad hoc at call sites (§3.10). This
 * contract is the ceiling's SHAPE plus a default per-tier table; the executor
 * that enforces it (and picks the real numbers) is Team Perf, not CON-01.
 *
 * R5/R6 runs cost materially more than a free search, hence per-tier (R9.3).
 */

export const RunBudgetSchema = z.object({
  tier: SubscriptionTierSchema,
  /** Hard ceiling on total tokens (in + out) across the whole run. */
  max_total_tokens: z.number().int().positive(),
  max_input_tokens: z.number().int().positive().optional(),
  max_output_tokens: z.number().int().positive().optional(),
  /** Hard dollar ceiling per search (§5.2). */
  max_cost_usd: z.number().positive(),
  /** Optional wall-clock ceiling; a run approaching it degrades gracefully. */
  max_wall_clock_ms: z.number().int().positive().optional(),
  /** Optional cap on number of LLM calls (guards fan-out). */
  max_llm_calls: z.number().int().positive().optional(),
});
export type RunBudget = z.infer<typeof RunBudgetSchema>;

/**
 * Placeholder per-tier defaults. Numbers are conservative starting points for
 * Team Perf to calibrate against the waterfall (R4b) — not final figures.
 */
export const DEFAULT_RUN_BUDGETS: Record<RunBudget["tier"], RunBudget> = {
  free: {
    tier: "free",
    max_total_tokens: 120_000,
    max_cost_usd: 0.5,
    max_wall_clock_ms: 90_000,
    max_llm_calls: 20,
  },
  pro: {
    tier: "pro",
    max_total_tokens: 600_000,
    max_cost_usd: 3.0,
    max_wall_clock_ms: 180_000,
    max_llm_calls: 80,
  },
};
