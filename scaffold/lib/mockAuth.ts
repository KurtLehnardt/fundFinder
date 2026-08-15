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

import type { Provenanced } from '@/lib/contracts/primitives';

export const STORAGE_KEYS = {
  authed: 'ff.auth.isAuthenticated',
  user: 'ff.auth.user',
  consent: 'ff.consent.v1',
  runs: 'ff.runs.v1',
  autoApply: 'ff.autoapply.v1',
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

/* ---- Auto-apply requirements (FE-06) ----
 * "Auto Apply" is a locked, stubbed affordance on each opportunity card: it
 * opens a Pro-upsell modal listing what the founder needs on file before a
 * real auto-apply flow (blocked on grant-site API keys) could act on their
 * behalf. This form — reached via the hamburger menu's Settings panel — lets
 * them record those facts locally so the modal can show what's already done.
 * Gates nothing: there is no server side to gate.
 */

export type AutoApplyRequirements = {
  samRegistered: boolean;
  /** Optional; only meaningful when samRegistered is true. Free-form date text, '' if unset. */
  samRegisteredDate: string;
  uei: string;
  aorName: string;
  /** "Confirm on file" checkbox — satisfies the requirement even with no name typed. */
  aorOnFile: boolean;
  /** "Confirm on file" checkbox for E-Biz POC delegation. */
  eBizPocOnFile: boolean;
};

export const EMPTY_AUTO_APPLY_REQUIREMENTS: AutoApplyRequirements = {
  samRegistered: false,
  samRegisteredDate: '',
  uei: '',
  aorName: '',
  aorOnFile: false,
  eBizPocOnFile: false,
};

export function getAutoApplyRequirements(): AutoApplyRequirements {
  const raw = safeStorage()?.getItem(STORAGE_KEYS.autoApply);
  if (!raw) return EMPTY_AUTO_APPLY_REQUIREMENTS;
  try {
    const parsed = JSON.parse(raw);
    // Merge over the defaults so an older/partial saved record never yields undefined fields.
    return { ...EMPTY_AUTO_APPLY_REQUIREMENTS, ...parsed };
  } catch {
    return EMPTY_AUTO_APPLY_REQUIREMENTS;
  }
}

export function setAutoApplyRequirements(reqs: AutoApplyRequirements): AutoApplyRequirements {
  safeStorage()?.setItem(STORAGE_KEYS.autoApply, JSON.stringify(reqs));
  return reqs;
}

/**
 * §3.1 CompanyProfile carries the same two registration facts (sam_registered,
 * uei) that R8.1 eligibility screening reads. Pure, unwired mapper from the
 * local Auto Apply form to that shape, provided so ELG/Interview can adopt it
 * later without re-deriving the mapping — nothing in the app calls this today.
 * Provenance is always `user_stated` (the founder's own self-report);
 * confidence 1 because a self-report carries no model uncertainty.
 */
export function mapAutoApplyToCompanyProfileFields(
  reqs: AutoApplyRequirements
): { sam_registered?: Provenanced<boolean>; uei?: Provenanced<string> } {
  const out: { sam_registered?: Provenanced<boolean>; uei?: Provenanced<string> } = {};
  if (reqs.samRegistered) {
    out.sam_registered = { value: true, provenance: 'user_stated', confidence: 1 };
  }
  if (reqs.uei.trim().length > 0) {
    out.uei = { value: reqs.uei.trim(), provenance: 'user_stated', confidence: 1 };
  }
  return out;
}

/** Wipe everything this app stored. Wire this to a visible "Delete my data" control. */
export function clearAllLocalData(): void {
  const store = safeStorage();
  if (!store) return;
  Object.values(STORAGE_KEYS).forEach((key) => store.removeItem(key));
}
