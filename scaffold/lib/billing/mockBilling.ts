/**
 * mockBilling.ts — FE-07 local, MOCK subscription-tier layer.
 *
 * THIS IS NOT BILLING. No payment is ever taken, no server is ever called, and
 * nothing here is an authorization decision (§11: honest, no fake charges). It
 * is a purely local, localStorage-backed switch the demo uses to show how the
 * padlocked Pro affordances (Auto Apply / competitor analysis) would light up
 * per tier. Selecting a tier charges nothing and syncs nowhere.
 *
 * Kept SEPARATE from the CON-01 `SubscriptionTier`/`DEFAULT_ENTITLEMENTS`
 * contract on purpose: that contract is a shared 2-tier ("free"|"pro") shape
 * consumed by runBudget/run/modelRouting and must not grow a third tier. This
 * module owns the demo's 3-tier ("free"|"pro"|"max") mock and the single
 * tier -> feature mapping the UI reads.
 *
 * Framework-agnostic (no React, no Next.js imports) so it stays unit-testable
 * outside a React runtime — same posture as lib/mockAuth.ts / lib/flags.
 */

import { STORAGE_KEYS } from '@/lib/mockAuth';
import { readJSON, writeJSON } from '@/lib/localStore';

export type BillingTier = 'free' | 'pro' | 'max';

/** The feature bundle a tier unlocks. The single source of tier -> feature truth. */
export interface BillingFeatures {
  /** R6 assisted "Auto Apply" preview is presented as available. */
  autoApply: boolean;
  /** How many auto-applies/month the tier advertises; null = unlimited. */
  autoApplyLimitPerMonth: number | null;
  /** PRO-01 "Analyze competing companies" is presented as available. */
  competitor: boolean;
}

export interface BillingTierMeta {
  id: BillingTier;
  label: string;
  priceLabel: string;
  /** Short, honest one-liner shown on the tier card. */
  blurb: string;
  features: BillingFeatures;
}

/**
 * Ordered metadata for the three selectable mock cards (Free -> Pro -> Max).
 * Copy is deliberately honest: every card is a mock and takes no real charge.
 */
export const BILLING_TIERS: readonly BillingTierMeta[] = [
  {
    id: 'free',
    label: 'Free',
    priceLabel: '$0',
    blurb: 'Search and read matches. No auto-apply; competitor analysis stays locked.',
    features: { autoApply: false, autoApplyLimitPerMonth: 0, competitor: false },
  },
  {
    id: 'pro',
    label: 'Pro',
    priceLabel: '$20/mo',
    blurb: 'Preview Auto Apply, up to 10 a month. Competitor analysis still locked.',
    features: { autoApply: true, autoApplyLimitPerMonth: 10, competitor: false },
  },
  {
    id: 'max',
    label: 'Max',
    priceLabel: '$100/mo',
    blurb: 'Unlimited Auto Apply previews plus competitor analysis.',
    features: { autoApply: true, autoApplyLimitPerMonth: null, competitor: true },
  },
] as const;

/** Every valid tier id, for validating stored values. */
const VALID_TIERS: readonly BillingTier[] = BILLING_TIERS.map((t) => t.id);

/**
 * The single source of the tier -> feature mapping. Falls back to the Free
 * bundle for any unrecognized value so callers never get undefined features.
 */
export function billingFeatures(tier: BillingTier): BillingFeatures {
  const meta = BILLING_TIERS.find((t) => t.id === tier);
  return meta ? meta.features : BILLING_TIERS[0].features;
}

function isBillingTier(value: unknown): value is BillingTier {
  return typeof value === 'string' && (VALID_TIERS as readonly string[]).includes(value);
}

/**
 * The currently selected mock tier. Defaults to "free" when nothing is stored,
 * storage is unavailable (SSR / private mode), or the stored value is not one
 * of the three known tiers.
 */
export function getBillingTier(): BillingTier {
  const stored = readJSON<unknown>(STORAGE_KEYS.billing, 'free');
  return isBillingTier(stored) ? stored : 'free';
}

/** Persist the selected mock tier. Local-only; charges nothing, syncs nowhere. */
export function setBillingTier(tier: BillingTier): void {
  writeJSON(STORAGE_KEYS.billing, tier);
}
