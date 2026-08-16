import type { ElementType } from "../config/schema";

/**
 * `writeValue` / `readValue` — the ONLY DOM write/read surface the fill
 * engine uses (spec §3.2). Government portals run their own JS
 * (React/Angular/legacy); setting `element.value = x` directly can leave the
 * framework's internal state stale, so writes go through the platform's
 * NATIVE property setter (bypassing any framework-level value interceptor)
 * and then dispatch `input`/`change` events so the portal's own framework
 * re-reads the DOM and registers the value. Centralizing this in one helper
 * keeps the event-dispatch discipline consistent and testable (jsdom).
 */

function nativeSetter(el: Element): ((value: string) => void) | undefined {
  if (el instanceof HTMLInputElement) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    return setter ? (v: string) => setter.call(el, v) : undefined;
  }
  if (el instanceof HTMLTextAreaElement) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    return setter ? (v: string) => setter.call(el, v) : undefined;
  }
  return undefined;
}

function dispatchInputChange(el: Element): void {
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Locate the `<option>` within a `<select>` matching by value or normalized text. */
function findOption(
  select: HTMLSelectElement,
  match: { byValue?: string; byText?: string } | undefined,
  fallbackText: string,
): HTMLOptionElement | undefined {
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const options = Array.from(select.options);

  if (match?.byValue !== undefined) {
    const hit = options.find((o) => o.value === match.byValue);
    if (hit) return hit;
  }
  const textTarget = match?.byText ?? fallbackText;
  return options.find((o) => normalize(o.text) === normalize(textTarget));
}

/** Locate the radio `<input>` within `el`'s form/group matching by value or normalized text. */
function findRadioOption(
  root: ParentNode,
  groupName: string,
  match: { byValue?: string; byText?: string } | undefined,
  fallbackText: string,
): HTMLInputElement | undefined {
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const radios = Array.from(root.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(groupName)}"]`));

  if (match?.byValue !== undefined) {
    const hit = radios.find((r) => r.value === match.byValue);
    if (hit) return hit;
  }
  const textTarget = match?.byText ?? fallbackText;
  return radios.find((r) => {
    const label = r.labels?.[0]?.textContent ?? "";
    return normalize(label) === normalize(textTarget) || normalize(r.value) === normalize(textTarget);
  });
}

export interface WriteOutcome {
  /** True iff a write was actually attempted against the DOM (false ⇒ e.g. no matching select option). */
  wrote: boolean;
  /** Present when a select/radio had no matching option — the fill engine surfaces this as a flag. */
  note?: string;
}

/**
 * Write `value` into `el` per its `elementType`, using the native property
 * setter (for text/textarea/date) plus `input`/`change` events, or
 * option/selection logic (select/radio/checkbox). Never throws; a value with
 * no matching option is reported via `WriteOutcome.note` rather than
 * guessed at.
 */
export function writeValue(
  el: Element,
  elementType: ElementType,
  value: string,
  optionMatch?: { byValue?: string; byText?: string },
): WriteOutcome {
  switch (elementType) {
    case "text":
    case "textarea":
    case "date": {
      const setter = nativeSetter(el);
      if (setter) {
        setter(value);
      } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        el.value = value;
      } else {
        return { wrote: false, note: "target element does not accept a text value" };
      }
      dispatchInputChange(el);
      return { wrote: true };
    }

    case "select": {
      if (!(el instanceof HTMLSelectElement)) return { wrote: false, note: "target element is not a <select>" };
      const option = findOption(el, optionMatch, value);
      if (!option) return { wrote: false, note: `no matching <select> option for "${value}"` };
      el.value = option.value;
      dispatchInputChange(el);
      return { wrote: true };
    }

    case "radio": {
      if (!(el instanceof HTMLInputElement) || el.type !== "radio") {
        return { wrote: false, note: "target element is not a radio input" };
      }
      const group = el.name;
      const root = el.getRootNode() as ParentNode;
      const chosen = group ? findRadioOption(root, group, optionMatch, value) : el;
      if (!chosen) return { wrote: false, note: `no matching radio option for "${value}"` };
      chosen.checked = true;
      dispatchInputChange(chosen);
      return { wrote: true };
    }

    case "checkbox": {
      if (!(el instanceof HTMLInputElement) || el.type !== "checkbox") {
        return { wrote: false, note: "target element is not a checkbox input" };
      }
      const truthy = /^(true|yes|1|on|checked)$/i.test(value.trim());
      el.checked = truthy;
      dispatchInputChange(el);
      return { wrote: true };
    }

    default:
      return { wrote: false, note: `unsupported elementType "${elementType satisfies never}"` };
  }
}

/** Read the current value of `el` for read-back verification / idempotency checks. */
export function readValue(el: Element, elementType: ElementType): string {
  switch (elementType) {
    case "text":
    case "textarea":
    case "date":
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;
      return "";
    case "select":
      if (el instanceof HTMLSelectElement) {
        const selected = el.options[el.selectedIndex];
        return selected ? selected.text : "";
      }
      return "";
    case "radio": {
      if (!(el instanceof HTMLInputElement)) return "";
      const group = el.name;
      if (!group) return el.checked ? el.value : "";
      const root = el.getRootNode() as ParentNode;
      const checked = root.querySelector<HTMLInputElement>(
        `input[type="radio"][name="${CSS.escape(group)}"]:checked`,
      );
      return checked ? checked.value : "";
    }
    case "checkbox":
      return el instanceof HTMLInputElement ? String(el.checked) : "";
    default:
      return "";
  }
}

/** Normalize a value for read-back comparison (whitespace/case-insensitive-safe for most fields). */
export function normalizeForCompare(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
