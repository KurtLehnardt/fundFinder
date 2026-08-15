'use client';

/**
 * app/login/page.tsx — the sign-in screen.
 *
 * Runtime toggle (no env change required) between two identities:
 *   - "Real Google account" → clears any demo override, then the context
 *     signIn(): a genuine Supabase Google OAuth redirect when r9_supabase_auth
 *     is on, or the existing simulated mock sign-in when it is off.
 *   - "Hackathon judge (demo)" → sets the local demo-mode override (see
 *     useDemoMode / lib/mockAuth) and redirects home signed-in as a clearly
 *     labelled demo identity — never a real account.
 *
 * Colors follow the R7 60/30/10 system: neutral canvas, navy structure, green
 * reserved for the primary action. (This file is on the interim raw-hex
 * carve-out in scripts/design/check-hex.mjs alongside the Google brand mark.)
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useDemoMode } from '@/components/AuthProvider';
import { isFlagEnabled } from '@/lib/flags';
import { BRAND } from '@/lib/brand';

type Mode = 'google' | 'demo';

export default function LoginPage() {
  const { user, loading, signIn } = useAuth();
  const { enterDemoMode, exitDemoMode } = useDemoMode();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('google');

  // With real Supabase auth on, the Google option is a genuine OAuth redirect;
  // with it off, that option is the existing simulated mock sign-in. The demo
  // option is always an honest, local demo identity in either case.
  const realAuth = isFlagEnabled('r9_supabase_auth');

  // Already signed in (real, mock, or demo)? Skip the screen.
  useEffect(() => {
    if (!loading && user) router.replace('/');
  }, [loading, user, router]);

  const handleGoogle = () => {
    // Never carry a stale demo identity into a real sign-in.
    exitDemoMode();
    signIn(); // real Google OAuth when configured; simulated mock otherwise
    // Real OAuth navigates away and returns via /auth/callback → home; the mock
    // signs in synchronously and needs an explicit push.
    if (!realAuth) router.push('/');
  };

  const handleDemo = () => {
    enterDemoMode(); // fixed "Hackathon Judge" user, reactively signed in
    router.push('/');
  };

  const handleContinue = () => {
    if (mode === 'google') handleGoogle();
    else handleDemo();
  };

  if (loading) return null; // avoids a flash of the login form on reload

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm rounded-2xl border border-structure-on-canvas/15 bg-canvas-alt p-8 shadow-card">
        <h1 className="text-pretty text-2xl font-semibold text-foreground">
          Sign in to {BRAND}
        </h1>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-foreground/70">
          Find federal funding your company can actually apply for.
        </p>

        {/* Runtime toggle: real Google account vs. hackathon-judge demo.
            Native radios grouped in a fieldset give free keyboard support and
            screen-reader "radio group" semantics. */}
        <fieldset className="mt-8">
          <legend className="sr-only">Choose how to sign in</legend>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-canvas p-1">
            <label className="cursor-pointer">
              <input
                type="radio"
                name="signin-mode"
                value="google"
                checked={mode === 'google'}
                onChange={() => setMode('google')}
                className="peer sr-only"
              />
              <span className="flex items-center justify-center rounded-md px-3 py-2 text-center text-sm font-medium text-foreground/70 transition-colors duration-150 peer-checked:bg-canvas-alt peer-checked:text-structure-on-canvas peer-checked:shadow-card peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-structure-on-canvas">
                Real account
              </span>
            </label>
            <label className="cursor-pointer">
              <input
                type="radio"
                name="signin-mode"
                value="demo"
                checked={mode === 'demo'}
                onChange={() => setMode('demo')}
                className="peer sr-only"
              />
              <span className="flex items-center justify-center rounded-md px-3 py-2 text-center text-sm font-medium text-foreground/70 transition-colors duration-150 peer-checked:bg-canvas-alt peer-checked:text-structure-on-canvas peer-checked:shadow-card peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-structure-on-canvas">
                Judge demo
              </span>
            </label>
          </div>
        </fieldset>

        {mode === 'google' ? (
          <button
            type="button"
            onClick={handleContinue}
            className="mt-4 flex w-full items-center justify-center gap-3 rounded-lg border border-structure-on-canvas/25 bg-canvas-alt px-4 py-3 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-canvas focus:outline-none focus-visible:ring-2 focus-visible:ring-structure-on-canvas focus-visible:ring-offset-2"
          >
            <GoogleMark />
            Continue with Google
          </button>
        ) : (
          <button
            type="button"
            onClick={handleContinue}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-action px-4 py-3 text-sm font-semibold text-token-white transition-colors duration-150 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-structure-on-canvas focus-visible:ring-offset-2"
          >
            Enter demo mode — hackathon judge
          </button>
        )}

        <p className="mt-4 text-center text-xs leading-relaxed text-foreground/70">
          {mode === 'google'
            ? realAuth
              ? 'Sign in with your real Google account.'
              : 'Simulated sign-in for demo purposes. No Google account is contacted and no credentials are collected.'
            : 'Explore signed in as a hackathon judge. This is a demo identity, not a real account — nothing is sent to Google and no credentials are collected.'}
        </p>
      </div>
    </main>
  );
}

/** Google's four-color mark, shown only on the real-account option. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
