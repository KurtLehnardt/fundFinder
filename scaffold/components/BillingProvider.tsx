"use client";

/**
 * BillingProvider.tsx — reactive context over the FE-07 MOCK billing tier.
 *
 * This is the live source the sidebar's Billing section and the OpportunityCard
 * padlocks both read, so selecting a tier reflects everywhere without a reload.
 * It is a passive React context — no network, no rendered UI of its own — so it
 * mounts unconditionally in app/layout.tsx alongside the other providers and
 * does not affect flag-off behavior.
 *
 * It gates NOTHING and charges NOTHING (§11). The tier is a local demo switch;
 * real entitlement enforcement would be server-side and is out of scope.
 *
 * Hydration: state starts at "free" (the same value SSR and the mock store's
 * no-window default resolve to), then hydrates from getBillingTier() in an
 * effect after mount — so the first client render matches the server render and
 * there's no hydration mismatch.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  billingFeatures,
  getBillingTier,
  setBillingTier as persistBillingTier,
  type BillingFeatures,
  type BillingTier,
} from "@/lib/billing/mockBilling";

type BillingContextValue = {
  tier: BillingTier;
  setTier: (tier: BillingTier) => void;
  features: BillingFeatures;
};

const BillingContext = createContext<BillingContextValue | null>(null);

export function BillingProvider({ children }: { children: ReactNode }) {
  // Start "free" so SSR and the first client render agree; hydrate after mount.
  const [tier, setTierState] = useState<BillingTier>("free");

  useEffect(() => {
    setTierState(getBillingTier());
  }, []);

  const setTier = useCallback((next: BillingTier) => {
    persistBillingTier(next);
    setTierState(next);
  }, []);

  const value = useMemo<BillingContextValue>(
    () => ({ tier, setTier, features: billingFeatures(tier) }),
    [tier, setTier],
  );

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}

/**
 * Current mock billing tier + selector. Outside the provider this is a safe,
 * inert "free" default (rather than a throw) so any consumer stays renderable
 * even if the provider is somehow absent.
 */
export function useBilling(): BillingContextValue {
  const ctx = useContext(BillingContext);
  if (ctx) return ctx;
  return { tier: "free", setTier: () => {}, features: billingFeatures("free") };
}
