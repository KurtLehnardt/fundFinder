'use client';

/**
 * AuthProvider.tsx — React state layer over the auth backend.
 *
 * Wrap your app once in app/layout.tsx:
 *   <AuthProvider>{children}</AuthProvider>
 *
 * This is a DROP-IN: the exported context shape
 * `{ user, loading, consent, signIn, signOut, setConsent }` and `useAuth()` are
 * unchanged, and `user` stays `MockUser | null`, so every consumer (login page,
 * AppMenu, UserMenu, AuthGuard, IntakeForm) compiles and behaves untouched.
 *
 * The backend is chosen by the `r9_supabase_auth` flag:
 *   - OFF → the original localStorage MOCK path (byte-for-byte as before).
 *   - ON  → REAL Supabase Auth + Google OAuth.
 * When both `r9_supabase_auth` and `r9_0_mockauth` are on, real auth wins.
 *
 * The flag is env-driven and constant for the app's lifetime, so we branch the
 * *provider component* (never hooks) on it — each inner provider calls its own
 * hooks unconditionally, keeping the Rules of Hooks intact.
 *
 * Consent (`consent` / `setConsent`) stays localStorage-backed in BOTH modes —
 * real auth never moves consent server-side (§5.3).
 *
 * The `loading` flag matters: neither localStorage nor a Supabase session can be
 * read during SSR, so the first client render always starts unauthenticated.
 * Redirecting before `loading` flips false will bounce signed-in users straight
 * back to the login page.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  getUser,
  signIn as storeSignIn,
  signOut as storeSignOut,
  getConsent,
  setConsent as storeSetConsent,
  type MockUser,
  type ConsentRecord,
} from '@/lib/mockAuth';
import { isFlagEnabled } from '@/lib/flags';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { mapSupabaseUser } from '@/lib/supabase/user';

type AuthContextValue = {
  user: MockUser | null;
  loading: boolean;
  consent: ConsentRecord;
  signIn: (name?: string) => void;
  signOut: () => void;
  setConsent: (granted: boolean) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Real auth wins when both flags are on.
  return isFlagEnabled('r9_supabase_auth') ? (
    <SupabaseAuthProvider>{children}</SupabaseAuthProvider>
  ) : (
    <MockAuthProvider>{children}</MockAuthProvider>
  );
}

/* ---- Mock backend (r9_supabase_auth OFF) — original behavior, unchanged ---- */

function MockAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MockUser | null>(null);
  const [consent, setConsentState] = useState<ConsentRecord>({
    granted: false,
    grantedAt: null,
  });
  const [loading, setLoading] = useState(true);

  // Hydrate from storage after mount — never during render.
  useEffect(() => {
    setUser(getUser());
    setConsentState(getConsent());
    setLoading(false);
  }, []);

  // Keep tabs in sync: sign out in one tab, every tab follows.
  useEffect(() => {
    const onStorage = () => setUser(getUser());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const signIn = useCallback((name?: string) => {
    setUser(storeSignIn(name));
  }, []);

  const signOut = useCallback(() => {
    storeSignOut();
    setUser(null);
  }, []);

  const setConsent = useCallback((granted: boolean) => {
    setConsentState(storeSetConsent(granted));
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, consent, signIn, signOut, setConsent }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/* ---- Supabase backend (r9_supabase_auth ON) — real Google OAuth ---- */

function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MockUser | null>(null);
  const [consent, setConsentState] = useState<ConsentRecord>({
    granted: false,
    grantedAt: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Consent stays localStorage-backed even with real auth (§5.3).
    setConsentState(getConsent());

    const supabase = getSupabaseBrowserClient();
    let active = true;

    // Resolve the initial session, then keep in sync with auth changes
    // (sign-in via the /auth/callback redirect, sign-out, token refresh).
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUser(data.session?.user ? mapSupabaseUser(data.session.user) : null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? mapSupabaseUser(session.user) : null);
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Real OAuth: the browser leaves for Google and returns via /auth/callback.
  // `name` is ignored (kept for a signature-compatible drop-in).
  const signIn = useCallback((_name?: string) => {
    const supabase = getSupabaseBrowserClient();
    void supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/` },
    });
  }, []);

  const signOut = useCallback(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase.auth.signOut();
    setUser(null);
  }, []);

  const setConsent = useCallback((granted: boolean) => {
    setConsentState(storeSetConsent(granted));
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, consent, signIn, signOut, setConsent }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
