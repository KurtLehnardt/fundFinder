# mock-auth — single-file bundle

All five code files for **R9.0** in one document, because the nested directory structure
did not survive the first transfer. `prompts/mock-auth/README.md` has the setup guide and
porting notes; this file has the code.

Copy each block into the path shown in its heading. Target layout:

```
lib/mockAuth.ts
components/AuthProvider.tsx
components/AuthGuard.tsx
components/UserMenu.tsx
app/login/page.tsx
```

Create the directories first — `mkdir -p lib components app/login` from your source root
(add a `src/` prefix if you use a src layout), then add `NEXT_PUBLIC_MOCK_AUTH=true` to
`.env.local`.

---

## `lib/mockAuth.ts`

```typescript
/**
 * mockAuth.ts — demo-only auth backed by localStorage.
 *
 * THIS IS NOT AUTHENTICATION. It is a UI state machine that pretends to be one.
 * Anyone can open devtools and set isAuthenticated to true. Never gate anything
 * that matters (paid features, private data, API access) on this — server-side
 * entitlement checks only. Delete this file when real Google OAuth lands.
 *
 * Framework-agnostic: no React, no Next.js imports. The React layer sits on top,
 * so porting to vanilla JS or another framework means keeping this file as-is.
 */

export const STORAGE_KEYS = {
  authed: 'ff.auth.isAuthenticated',
  user: 'ff.auth.user',
  consent: 'ff.consent.v1',
  runs: 'ff.runs.v1',
} as const;

export type MockUser = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  signedInAt: string;
};

/** Demo mode is opt-in via env so this can never silently ride to production. */
export const MOCK_AUTH_ENABLED = process.env.NEXT_PUBLIC_MOCK_AUTH === 'true';

/** localStorage is unavailable during SSR and in some privacy modes. Never throw. */
function safeStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    const probe = '__ff_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null; // Safari private mode, storage disabled, quota exceeded
  }
}

/** Inline SVG avatar — no external request, works offline during a demo. */
function avatarDataUri(initials: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
    <rect width="96" height="96" rx="48" fill="#005ea2"/>
    <text x="50%" y="50%" dy="0.35em" text-anchor="middle"
      font-family="system-ui, sans-serif" font-size="38" font-weight="600" fill="#ffffff">${initials}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function createMockUser(name = 'Hackathon Judge'): MockUser {
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return {
    id: `mock_${Math.random().toString(36).slice(2, 10)}`,
    name,
    email: 'judge@example.com', // reserved domain — never a real address
    avatarUrl: avatarDataUri(initials),
    signedInAt: new Date().toISOString(),
  };
}

export function signIn(name?: string): MockUser {
  const store = safeStorage();
  const user = createMockUser(name);
  if (store) {
    store.setItem(STORAGE_KEYS.authed, 'true');
    store.setItem(STORAGE_KEYS.user, JSON.stringify(user));
  }
  return user;
}

export function signOut(): void {
  const store = safeStorage();
  if (!store) return;
  // Clear auth only. Saved runs and consent survive sign-out, matching real behavior.
  store.removeItem(STORAGE_KEYS.authed);
  store.removeItem(STORAGE_KEYS.user);
}

export function getUser(): MockUser | null {
  const store = safeStorage();
  if (!store) return null;
  if (store.getItem(STORAGE_KEYS.authed) !== 'true') return null;

  const raw = store.getItem(STORAGE_KEYS.user);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as MockUser;
    // Anything hand-edited in devtools gets discarded rather than rendered.
    if (!parsed?.id || !parsed?.name) throw new Error('malformed');
    return parsed;
  } catch {
    signOut();
    return null;
  }
}

export function isAuthenticated(): boolean {
  return getUser() !== null;
}

/* ---- Consent (§5.3: descriptions reusable only with opt-in) ---- */

export type ConsentRecord = { granted: boolean; grantedAt: string | null };

export function getConsent(): ConsentRecord {
  const raw = safeStorage()?.getItem(STORAGE_KEYS.consent);
  if (!raw) return { granted: false, grantedAt: null }; // default: no consent
  try {
    return JSON.parse(raw) as ConsentRecord;
  } catch {
    return { granted: false, grantedAt: null };
  }
}

export function setConsent(granted: boolean): ConsentRecord {
  const record: ConsentRecord = {
    granted,
    grantedAt: granted ? new Date().toISOString() : null,
  };
  safeStorage()?.setItem(STORAGE_KEYS.consent, JSON.stringify(record));
  return record;
}

/** Wipe everything this app stored. Wire this to a visible "Delete my data" control. */
export function clearAllLocalData(): void {
  const store = safeStorage();
  if (!store) return;
  Object.values(STORAGE_KEYS).forEach((key) => store.removeItem(key));
}
```

---

## `components/AuthProvider.tsx`

```tsx
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
```

---

## `components/AuthGuard.tsx`

```tsx
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
      <div className="flex min-h-screen items-center justify-center bg-[#f9f9f9]">
        <span className="text-sm text-[#5b616b]">Loading…</span>
      </div>
    );
  }

  if (!user) return null; // redirect in flight

  return <>{children}</>;
}
```

---

## `components/UserMenu.tsx`

```tsx
'use client';

/**
 * UserMenu.tsx — avatar, name, and log out. Drop into your header.
 *
 *   <header className="flex items-center justify-between ...">
 *     <Logo />
 *     <UserMenu />
 *   </header>
 */

import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

export function UserMenu() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  if (loading || !user) return null;

  const handleSignOut = () => {
    signOut();
    router.replace('/login');
  };

  return (
    <div className="flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- inline SVG data URI */}
      <img
        src={user.avatarUrl}
        alt=""
        width={32}
        height={32}
        className="rounded-full"
      />
      <span className="hidden text-sm font-medium text-[#212121] sm:inline">
        {user.name}
      </span>
      <button
        type="button"
        onClick={handleSignOut}
        className="rounded-md px-3 py-1.5 text-sm font-medium text-[#005ea2] transition-colors duration-150 hover:bg-[#ecf1f7] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#005ea2] focus-visible:ring-offset-2"
      >
        Log out
      </button>
    </div>
  );
}
```

---

## `app/login/page.tsx`

```tsx
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
```

---

## Verify

After placing the files, confirm all five landed:

```bash
ls -1 lib/mockAuth.ts components/AuthProvider.tsx components/AuthGuard.tsx \
      components/UserMenu.tsx app/login/page.tsx
```

Five lines of output means the §0.1 input check will pass. Anything less and the
orchestrator should stop and flag it — exactly as it did this time.
