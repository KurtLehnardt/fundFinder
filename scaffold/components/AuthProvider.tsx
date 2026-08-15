'use client';

/**
 * AuthProvider.tsx — React state layer over lib/mockAuth.
 *
 * Wrap your app once in app/layout.tsx:
 *   <AuthProvider>{children}</AuthProvider>
 *
 * The `loading` flag matters: localStorage can't be read during SSR, so the first
 * client render always starts unauthenticated. Redirecting before `loading` flips
 * false will bounce signed-in users straight back to the login page.
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

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
