"use client";

/**
 * R6 — client-only entitlement stub.
 *
 * §3.7 says every Pro surface reads its tier/feature access from the CON-01
 * `Entitlements` contract instead of scattering tier checks through components.
 * This module centralizes that read for the client so the R6 assisted-apply
 * PREVIEW can frame itself as a Pro feature (badge / lock / eyebrow).
 *
 * IT GATES NOTHING. There is deliberately no server call and no identity read
 * here: it always resolves the default `free` tier from `DEFAULT_ENTITLEMENTS`,
 * so `assisted_application` is `false`. Real server-side enforcement is PLT-07
 * (out of scope) — never treat this hook as an authorization decision. It only
 * tells the UI how to *frame* itself; the walkthrough proceeds regardless
 * because it is a preview that submits nothing.
 *
 * Kept React-free (pure functions + a trivial hook wrapper) so the read is unit
 * testable without a React runtime and so nothing here can accidentally grow a
 * side effect.
 */

import {
  DEFAULT_ENTITLEMENTS,
  type Entitlements,
  type SubscriptionTier,
} from "../contracts/entitlements";

/**
 * The tier this stub always reports. Free by default — matching a signed-out /
 * unpaid user — which is what makes `assisted_application` resolve to `false`.
 */
export const STUB_TIER: SubscriptionTier = "free";

/** Pure, React-free read of the default entitlements for a tier. */
export function readEntitlements(tier: SubscriptionTier = STUB_TIER): Entitlements {
  return DEFAULT_ENTITLEMENTS[tier];
}

/** The narrow, UI-facing view the R6 flow consumes for Pro *framing* only. */
export interface EntitlementsView {
  tier: SubscriptionTier;
  /** Whether the resolved tier is the paid one. Framing only. */
  isPro: boolean;
  features: Entitlements["features"];
  /**
   * Convenience: is `assisted_application` entitled? Always `false` at the free
   * default. Used ONLY to decide whether to show the Pro lock/upsell framing —
   * never to allow or block any real action.
   */
  assistedApplication: boolean;
}

/** Project an `Entitlements` record down to the framing-only view. */
export function toEntitlementsView(ent: Entitlements): EntitlementsView {
  return {
    tier: ent.tier,
    isPro: ent.tier === "pro",
    features: ent.features,
    assistedApplication: ent.features.assisted_application,
  };
}

/**
 * Client hook: the current entitlement view. A stub — always the default
 * `free` tier. No React state/effect is used, so it is safe to call anywhere
 * (and testable outside React), and it can never gate anything server-side.
 */
export function useEntitlements(): EntitlementsView {
  return toEntitlementsView(readEntitlements(STUB_TIER));
}
