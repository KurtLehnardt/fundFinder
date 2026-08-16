import type { PortalFieldMap, PortalId } from "./schema";
import { grantsGov } from "./portals/grants_gov";
import { researchGov } from "./portals/research_gov";
import { nihAssist } from "./portals/nih_assist";
import { sbirGov } from "./portals/sbir_gov";

/** Registry: every in-scope portal's declarative field map. */
export const PORTAL_REGISTRY: Record<PortalId, PortalFieldMap> = {
  grants_gov: grantsGov,
  research_gov: researchGov,
  nih_assist: nihAssist,
  sbir_gov: sbirGov,
};

export const ALL_PORTALS: PortalFieldMap[] = Object.values(PORTAL_REGISTRY);

/**
 * Convert a `urlMatch` glob (Chrome match-pattern style, e.g.
 * `"https://www.grants.gov/*"`) into a RegExp. Only `*` is treated as a
 * wildcard (matched non-greedily is unnecessary here — these patterns only
 * ever have a trailing `*`, per the seed configs); every other regex
 * metacharacter is escaped so a literal host/path never behaves unexpectedly.
 */
function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

/**
 * Resolve the `PortalFieldMap` that applies to a given URL, by testing each
 * registered portal's `urlMatch` patterns. Returns `undefined` if no portal
 * claims the URL (the content-script runtime and popup both treat this as
 * "nothing to fill here" — never a guess, never a throw).
 */
export function resolvePortalForUrl(url: string): PortalFieldMap | undefined {
  for (const portal of ALL_PORTALS) {
    if (portal.urlMatch.some((pattern) => globToRegExp(pattern).test(url))) {
      return portal;
    }
  }
  return undefined;
}

export { grantsGov, researchGov, nihAssist, sbirGov };
export * from "./schema";
