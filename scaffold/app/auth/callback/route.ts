/**
 * app/auth/callback/route.ts — Google OAuth code -> session exchange (R9).
 *
 * The official @supabase/ssr App Router pattern: Supabase redirects back here
 * with a `?code=` after Google consent; we exchange it for a session via a
 * cookie-bound server client, then redirect to `next` (default `/`).
 *
 * §5.3 / R9.0: this route handles ONLY the session. It gates nothing and never
 * reads or logs company descriptions or PII.
 */

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  // Only ever redirect to a same-origin relative path; default home. Require a
  // single leading slash and EXPLICITLY reject protocol-relative (`//evil.com`)
  // and backslash (`/\evil.com`) targets, which browsers can treat as an
  // off-origin host — so a future refactor that stops origin-prepending can't
  // reintroduce an open redirect (security review LOW).
  const nextParam = searchParams.get('next') ?? '/';
  const next =
    nextParam.startsWith('/') && !nextParam.startsWith('//') && !nextParam.startsWith('/\\')
      ? nextParam
      : '/';

  if (code) {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // No code, or exchange failed: send them back to the sign-in screen.
  return NextResponse.redirect(`${origin}/login`);
}
