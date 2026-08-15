'use client';

/**
 * AuthGuard.tsx — client-side route protection for the demo.
 *
 * Wrap any protected page:
 *   <AuthGuard><Dashboard /></AuthGuard>
 *
 * This hides UI. It does not secure anything — the page's JS is already in the
 * browser. Real protection is server-side (middleware + session verification),
 * which arrives with real OAuth in R9.
 */

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

export function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Wait for hydration before redirecting, or signed-in users get bounced.
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <span className="font-mono text-sm text-foreground">Loading…</span>
      </div>
    );
  }

  if (!user) return null; // redirect in flight

  return <>{children}</>;
}
