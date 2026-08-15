"use client";

import { useEffect, type RefObject } from "react";

/**
 * FE-06 — shared accessible-dialog behavior for AutoApplyModal and
 * SettingsPanel (kept as a hook rather than duplicated in both so the
 * focus-trap logic only has to be gotten right once).
 *
 * On mount: focuses `initialFocusRef` (falls back to the first focusable
 * descendant of `dialogRef`), locks body scroll, and starts trapping Tab
 * within the dialog. Esc calls `onClose`. On unmount: releases the scroll
 * lock and returns focus to whatever element had it before the dialog
 * opened (the trigger button), so keyboard/screen-reader users land back
 * where they started.
 *
 * Deliberately does not animate anything — see app/globals.css's
 * `prefers-reduced-motion` rule and FE-06's note not to add motion that
 * could mask a state change (e.g. delay conveying which requirements are
 * already on file).
 */
export function useDialogA11y(
  dialogRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  initialFocusRef?: RefObject<HTMLElement | null>
) {
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    function getFocusable(): HTMLElement[] {
      if (!dialog) return [];
      return Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
    }

    (initialFocusRef?.current ?? getFocusable()[0])?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus();
    };
    // Intentionally re-runs only if `onClose` identity changes; dialogRef/
    // initialFocusRef are refs (stable identity) and don't belong in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);
}
