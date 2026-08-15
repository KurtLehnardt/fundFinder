"use client";

/**
 * SignInNudge.tsx — a gentle, non-blocking page-load nudge (FE-07 redesign).
 *
 * When the visitor is signed OUT, a small SweetAlert2 modal invites them to sign
 * in ("Sign in to save your searches."). It is deliberately NON-blocking: the X
 * (showCloseButton) and clicking outside (allowOutsideClick) both dismiss it, so
 * it never traps the page. A confirm button routes to /login.
 *
 * It fires once auth has resolved to signed-out, at most once per browser
 * session — a sessionStorage flag suppresses re-shows for the rest of the
 * session (so we don't nag), and it naturally shows again on a fresh session.
 * It never fires while signed in.
 *
 * Themed with the design-token CSS variables (background/color/confirmButton) so
 * it adapts to light/dark exactly like IntakeForm's Swal dialogs.
 *
 * Mounted only on the flag-ON home path (app/page.tsx), so the pre-sidebar
 * (flag-OFF) experience is unchanged.
 */

import { useEffect, useRef } from "react";
import Swal from "sweetalert2";
import { useAuth } from "@/components/AuthProvider";

const SESSION_DISMISS_KEY = "ff.ui.signinNudge.dismissed";

/** sessionStorage guarded for SSR / privacy modes. Never throws. */
function sessionDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(SESSION_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}
function markSessionDismissed(): void {
  try {
    window.sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
  } catch {
    /* storage disabled — worst case the nudge may show once more; harmless. */
  }
}

export default function SignInNudge() {
  const { user, loading } = useAuth();
  // Guard against firing twice (e.g. React 18 StrictMode double-effect, or a
  // re-render before the session flag is written).
  const firedRef = useRef(false);

  useEffect(() => {
    if (loading) return; // wait until auth resolves — don't flash for signed-in users
    if (user) return; // signed in → never nudge
    if (firedRef.current) return;
    if (sessionDismissed()) return;

    firedRef.current = true;
    markSessionDismissed();

    void Swal.fire({
      title: "Sign in to save your searches.",
      icon: "info",
      showCloseButton: true, // the X dismisses
      allowOutsideClick: true, // clicking the backdrop dismisses
      showConfirmButton: true,
      confirmButtonText: "Sign in",
      // Token CSS vars → the modal adapts to light/dark like the rest of the app.
      background: "var(--color-canvas-alt)",
      color: "var(--color-foreground)",
      confirmButtonColor: "var(--color-action)",
    }).then((result) => {
      if (result.isConfirmed) {
        window.location.href = "/login";
      }
    });
  }, [loading, user]);

  return null;
}
