/**
 * Shadow-DOM overlay that visually flags gaps/excluded/unmapped fields
 * (spec §3, §5.1). A gap is NEVER written to the DOM (INV-2) — this is the
 * ONLY DOM footprint a gap gets: a small badge next to the field, rendered
 * inside a shadow root so the portal page's own CSS can never hide or
 * restyle it away, and the portal page's own JS can never read into it
 * (isolated shadow tree, `mode: "open"` only for our own re-query/cleanup).
 */

export type FlagKind = "gap" | "excluded" | "unmapped";

const FLAG_HOST_ATTR = "data-granted-flag";

const FLAG_STYLE: Record<FlagKind, { background: string; color: string; label: string }> = {
  gap: { background: "#fef3c7", color: "#92400e", label: "you provide" },
  excluded: { background: "#e5e7eb", color: "#374151", label: "left for you — never auto-filled" },
  unmapped: { background: "#fee2e2", color: "#991b1b", label: "couldn't locate" },
};

function buildBadge(kind: FlagKind, detail: string): HTMLSpanElement {
  const host = document.createElement("span");
  host.setAttribute(FLAG_HOST_ATTR, "true");
  host.setAttribute("data-granted-flag-kind", kind);
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    .badge {
      display: inline-block;
      font: 12px/1.4 system-ui, sans-serif;
      padding: 2px 8px;
      margin-left: 6px;
      border-radius: 999px;
      background: ${FLAG_STYLE[kind].background};
      color: ${FLAG_STYLE[kind].color};
      white-space: nowrap;
      vertical-align: middle;
    }
  `;
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = detail || FLAG_STYLE[kind].label;

  shadow.appendChild(style);
  shadow.appendChild(badge);
  return host;
}

/** Insert a flag badge immediately after `el`. Idempotent per-element via `clearFlagsFor`. */
export function flagField(el: Element, kind: FlagKind, detail: string): void {
  clearFlagsFor(el);
  const badge = buildBadge(kind, detail);
  el.insertAdjacentElement("afterend", badge);
}

/** Remove any flag badge(s) previously inserted immediately after `el` (idempotent re-fill). */
export function clearFlagsFor(el: Element): void {
  const next = el.nextElementSibling;
  if (next && next.hasAttribute(FLAG_HOST_ATTR)) {
    next.remove();
  }
}

/** Remove EVERY flag badge under `root` — used at the start of a fresh fill pass. */
export function clearAllFlags(root: ParentNode): void {
  root.querySelectorAll(`[${FLAG_HOST_ATTR}]`).forEach((el) => el.remove());
}
