/**
 * welcomeTourPrefs.ts — persistence for whether this browser has already been
 * shown the first-load welcome guide (components/WelcomeTour.tsx).
 *
 * Uses localStorage, NOT sessionStorage. sessionStorage resets on every new
 * browser session, which is why the guide used to reappear on every visit; it
 * also meant a session boundary crossed mid-tour — most notably the full-page
 * reload from an OAuth sign-in redirect — could reset the component's
 * in-memory "started" guard (a fresh mount gets a fresh ref) and let the guide
 * fire again right after sign-in. localStorage persists across sessions,
 * reloads, and that redirect, so once shown, it's shown for good on this
 * browser.
 *
 * The "seen" flag must be set as soon as the guide STARTS, not only when it's
 * dismissed/finished — see markWelcomeTourSeen() call sites in WelcomeTour.tsx.
 * Marking only on dismiss left a window where a reload or sign-in redirect
 * mid-tour (before the visitor reached the end) would re-show it.
 *
 * Framework-agnostic (no React) so the "start at most once ever" contract is
 * trivially unit-testable and degrades safely to "not seen" under SSR /
 * private browsing via lib/localStore's never-throw storage guards.
 */

import { readJSON, writeJSON } from '@/lib/localStore';

const WELCOME_TOUR_SEEN_KEY = 'ff.ui.welcomeTour.seen.v1';

/** Has this browser already been shown the welcome guide? SSR/privacy-safe, never throws. */
export function hasSeenWelcomeTour(): boolean {
  return readJSON<boolean>(WELCOME_TOUR_SEEN_KEY, false);
}

/**
 * Mark the guide as seen. No-ops when storage is unavailable (SSR / private
 * mode / quota exceeded) — never throws. Worst case in that fallback: the
 * guide can show again on a future visit, which is harmless.
 */
export function markWelcomeTourSeen(): void {
  writeJSON(WELCOME_TOUR_SEEN_KEY, true);
}

export interface WelcomeTourStartState {
  /** True while auth is still resolving — wait before deciding whether to start. */
  loading: boolean;
  /** True once this component instance has already started the tour. */
  started: boolean;
  /** True once this browser has already been shown the tour (localStorage). */
  seen: boolean;
}

/**
 * Pure start predicate: the guide starts at most once ever per browser. Kept
 * free of I/O (storage, DOM, React) so the "start at most once" contract —
 * including "signing in after seeing it while signed out must NOT re-show
 * it" — is exhaustively testable. See the .test.ts alongside this file.
 */
export function shouldStartWelcomeTour(state: WelcomeTourStartState): boolean {
  return !state.loading && !state.started && !state.seen;
}
