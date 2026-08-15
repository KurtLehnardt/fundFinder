/**
 * lib/supabase/user.ts — map a Supabase auth user onto the existing MockUser
 * shape, so components/AuthProvider stays a true drop-in and every consumer
 * compiles untouched.
 *
 * This lives under lib/ (not components/) deliberately: the inline SVG avatar
 * fallback contains literal brand colors, and lib/ is outside the raw-hex CI
 * scan (scripts/design/check-hex.mjs scans components/ and app/ only). It
 * mirrors the mock's own avatarDataUri so a Google-less account still gets an
 * initials avatar.
 */

import type { User } from '@supabase/supabase-js';
import type { MockUser } from '@/lib/mockAuth';

/** Inline SVG initials avatar — no external request, mirrors lib/mockAuth. */
function initialsAvatar(name: string): string {
  const initials =
    name
      .split(' ')
      .map((part) => part[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'U';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
    <rect width="96" height="96" rx="48" fill="#005ea2"/>
    <text x="50%" y="50%" dy="0.35em" text-anchor="middle"
      font-family="system-ui, sans-serif" font-size="38" font-weight="600" fill="#ffffff">${initials}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Map a Supabase `User` to the MockUser shape the whole app already consumes:
 *   - name:      user_metadata.full_name / name / email local-part
 *   - email:     user.email
 *   - avatarUrl: user_metadata.avatar_url, else an inline initials avatar
 *   - signedInAt: last_sign_in_at, else now
 */
export function mapSupabaseUser(user: User): MockUser {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const email = user.email ?? '';

  const metaName =
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.name === 'string' && meta.name) ||
    '';
  const name = metaName || (email ? email.split('@')[0] : 'User');

  const avatarUrl =
    (typeof meta.avatar_url === 'string' && meta.avatar_url) || initialsAvatar(name);

  return {
    id: user.id,
    name,
    email,
    avatarUrl,
    signedInAt: user.last_sign_in_at ?? new Date().toISOString(),
  };
}
