/**
 * lib/supabase/client.ts — browser Supabase client (R9 real auth).
 *
 * Created LAZILY and GUARDED: the client is never constructed at module load,
 * so importing this file is free and `npm run build` / SSR never throw when the
 * `r9_supabase_auth` flag is off and no NEXT_PUBLIC_SUPABASE_* vars are set. The
 * only caller is components/AuthProvider.tsx's Supabase backend, which is
 * reached exclusively when the flag is on.
 *
 * Uses @supabase/ssr's cookie-based browser client so the session lives in
 * cookies shared with the /auth/callback server route (createServerClient).
 */

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;

/**
 * Returns a memoized browser Supabase client, constructing it on first call.
 * Throws a clear error if the public env vars are absent — this only happens
 * when the flag is on but the user hasn't pasted their anon key into
 * `.env.local` yet (see .env.example / the task's "User setup required").
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'Supabase browser client requested but NEXT_PUBLIC_SUPABASE_URL / ' +
        'NEXT_PUBLIC_SUPABASE_ANON_KEY are not set. Paste your anon/publishable ' +
        'key into .env.local to use r9_supabase_auth.',
    );
  }

  browserClient = createBrowserClient(url, anonKey);
  return browserClient;
}
