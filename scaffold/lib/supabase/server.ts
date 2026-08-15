/**
 * lib/supabase/server.ts — server (cookie-bound) Supabase client (R9 real auth).
 *
 * Used ONLY by app/auth/callback/route.ts to exchange the OAuth `?code=` for a
 * session and persist it in cookies. Constructed LAZILY per request (reads
 * `cookies()` at call time), never at module load, so importing this file does
 * not throw during build/SSR when the flag is off.
 *
 * This client handles ONLY the session (§5.3 / R9.0): it gates no route and
 * reads/logs no company descriptions or PII.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Builds a request-scoped server client bound to the incoming cookies. Called
 * from the OAuth callback route handler, where cookie writes are applied to the
 * response. Throws if the public env vars are absent (see client.ts).
 */
export function createSupabaseServerClient(): SupabaseClient {
  const cookieStore = cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'Supabase server client requested but NEXT_PUBLIC_SUPABASE_URL / ' +
        'NEXT_PUBLIC_SUPABASE_ANON_KEY are not set.',
    );
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // `cookies().set` throws when called from a Server Component render;
          // in the callback Route Handler it succeeds, so the session is
          // written. Safe to ignore here.
        }
      },
    },
  });
}
