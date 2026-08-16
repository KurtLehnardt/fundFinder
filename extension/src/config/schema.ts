import { z } from "zod";

/**
 * Declarative per-portal field-map config (spec §2.1).
 *
 * Design goal: adding a new portal = adding a new config file, not new code.
 * The content-script runtime, fill engine, selector resolver, and navigator
 * are all portal-agnostic; every portal-specific fact lives in a declarative
 * `PortalFieldMap`. A registry (`src/config/index.ts`) maps a URL to its
 * `PortalFieldMap`.
 *
 * Selector strings are DATA, filled in later (an in-session capture pass) —
 * never code. The seed configs ship every selector as a `TODO:` placeholder;
 * the resolver treats any tier string starting with `TODO` (case-insensitive)
 * as ABSENT (§2.2), which is what makes the all-TODO seed configs degrade
 * gracefully (INV-9): import works, nothing is filled, everything is flagged
 * "unmapped", never a throw, never a guess.
 */

export const PORTAL_IDS = ["grants_gov", "research_gov", "nih_assist", "sbir_gov"] as const;
export type PortalId = (typeof PORTAL_IDS)[number];

export const ELEMENT_TYPES = ["text", "textarea", "select", "radio", "checkbox", "date"] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];

/**
 * Field semantic role. Anything not "data" is structurally excluded from
 * filling (INV-4 / INV-5) — checked by the fill engine BEFORE anything else,
 * unconditionally, and not overridable by config.
 */
export const FIELD_ROLES = ["data", "signature", "date_signed", "certification", "credential"] as const;
export type FieldRole = (typeof FIELD_ROLES)[number];

export const VALUE_TRANSFORM_IDS = [
  "identity",
  "date_iso_to_mmddyyyy",
  "state_name_to_code",
  "entity_type_to_sf424_option",
  "currency_plain",
] as const;
export type ValueTransformId = (typeof VALUE_TRANSFORM_IDS)[number];

/**
 * Tiered selector strategy. Tiers are tried in order (id → name → aria →
 * labelText); the FIRST tier that resolves to exactly one visible, enabled
 * element wins. A tier whose string begins with "TODO" is treated as ABSENT
 * (not-yet-captured). If no tier resolves, the field is SKIPPED and flagged
 * "unmapped" — never guessed.
 */
export interface SelectorStrategy {
  id?: string;
  name?: string;
  aria?: { label?: string; labelledby?: string };
  labelText?: string;
  /** For radio groups / selects: the option value or visible text to choose once located. */
  optionMatch?: { byValue?: string; byText?: string };
}

export const SelectorStrategySchema: z.ZodType<SelectorStrategy> = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  aria: z
    .object({
      label: z.string().optional(),
      labelledby: z.string().optional(),
    })
    .optional(),
  labelText: z.string().optional(),
  optionMatch: z
    .object({
      byValue: z.string().optional(),
      byText: z.string().optional(),
    })
    .optional(),
});

/** A single bindable field. */
export interface FieldBinding {
  /** PrefilledField.key from the app package, or null for a portal-only control (never filled). */
  packageKey: string | null;
  formName?: string;
  boxRef?: string;
  label: string;
  elementType: ElementType;
  stepId: string;
  selector: SelectorStrategy;
  transform?: ValueTransformId;
  /** Defaults to "data". Non-"data" ⇒ NEVER filled (INV-4/INV-5). */
  role?: FieldRole;
  /** Belt-and-suspenders hard exclusion even if role/packageKey were mis-set. */
  neverFill?: boolean;
}

export const FieldBindingSchema: z.ZodType<FieldBinding> = z.object({
  packageKey: z.string().min(1).nullable(),
  formName: z.string().optional(),
  boxRef: z.string().optional(),
  label: z.string().min(1),
  elementType: z.enum(ELEMENT_TYPES),
  stepId: z.string().min(1),
  selector: SelectorStrategySchema,
  transform: z.enum(VALUE_TRANSFORM_IDS).optional(),
  role: z.enum(FIELD_ROLES).optional(),
  neverFill: z.boolean().optional(),
});

/** An ordered section/step in the portal's flow. */
export interface PortalStep {
  stepId: string;
  title: string;
  order: number;
  landmark?: SelectorStrategy;
}

export const PortalStepSchema: z.ZodType<PortalStep> = z.object({
  stepId: z.string().min(1),
  title: z.string().min(1),
  order: z.number().int().nonnegative(),
  landmark: SelectorStrategySchema.optional(),
});

export interface PortalFieldMap {
  portalId: PortalId;
  displayName: string;
  urlMatch: string[];
  steps: PortalStep[];
  /** ALLOWLIST of controls the navigator may click to ADVANCE. Submit-guard always wins. */
  advanceControls: SelectorStrategy[];
  /** Documented-only forbidden controls; the runtime denylist is hardcoded/unconditional. */
  forbiddenControls?: SelectorStrategy[];
  fields: FieldBinding[];
}

export const PortalFieldMapSchema: z.ZodType<PortalFieldMap> = z.object({
  portalId: z.enum(PORTAL_IDS),
  displayName: z.string().min(1),
  urlMatch: z.array(z.string().min(1)),
  steps: z.array(PortalStepSchema),
  advanceControls: z.array(SelectorStrategySchema),
  forbiddenControls: z.array(SelectorStrategySchema).optional(),
  fields: z.array(FieldBindingSchema),
});

/** True iff every tier string on a strategy begins with "TODO" (case-insensitive) or is absent. */
export function isSelectorCaptured(strategy: SelectorStrategy | undefined): boolean {
  if (!strategy) return false;
  const isTodo = (s: string | undefined) => s !== undefined && !/^todo/i.test(s.trim());
  return Boolean(
    isTodo(strategy.id) ||
      isTodo(strategy.name) ||
      isTodo(strategy.aria?.label) ||
      isTodo(strategy.aria?.labelledby) ||
      isTodo(strategy.labelText),
  );
}
