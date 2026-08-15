'use client';

/**
 * app/login/page.tsx — the mock sign-in screen.
 *
 * Colors follow the R7 60/30/10 system: neutral canvas, navy structure,
 * green reserved for the primary action.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

export default function LoginPage() {
  const { user, loading, signIn } = useAuth();
  const router = useRouter();

  // Already signed in? Skip the screen.
  useEffect(() => {
    if (!loading && user) router.replace('/');
  }, [loading, user, router]);

  const handleSignIn = () => {
    signIn(); // defaults to "Hackathon Judge"
    router.push('/');
  };

  if (loading) return null; // avoids a flash of the login form on reload

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f9f9f9] px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_8px_24px_rgba(0,0,0,0.06)]">
        {/* Demo badge — judges should never wonder whether this is real Google auth. */}
        <span className="mb-6 inline-block rounded-full bg-[#ecf1f7] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#005ea2]">
          Demo mode
        </span>

        <h1 className="text-pretty text-2xl font-semibold text-[#212121]">
          Sign in to fundFinder
        </h1>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-[#5b616b]">
          Find federal funding your company can actually apply for.
        </p>

        <button
          type="button"
          onClick={handleSignIn}
          className="mt-8 flex w-full items-center justify-center gap-3 rounded-lg border border-[#d0d7de] bg-white px-4 py-3 text-sm font-medium text-[#212121] transition-colors duration-150 hover:bg-[#f3f6fa] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#005ea2] focus-visible:ring-offset-2"
        >
          <GoogleMark />
          Continue with Google
        </button>

        <p className="mt-4 text-center text-xs leading-relaxed text-[#5b616b]">
          Simulated sign-in for demo purposes. No Google account is contacted and
          no credentials are collected.
        </p>
      </div>
    </main>
  );
}

/** Google's four-color mark. Paired with the "Demo mode" badge above so the
 *  simulated flow is never mistaken for real Google authentication. */
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
