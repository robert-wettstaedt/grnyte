import { SUPABASE_SECRET_KEY } from '$env/static/private'
import { PUBLIC_SUPABASE_URL } from '$env/static/public'
import { createClient } from '@supabase/supabase-js'

/**
 * A new `sb_secret_` key travels only as `apikey`: supabase-js also sends it as a Bearer, which is
 * stripped here. A person's own Bearer passes, and a legacy JWT key keeps its Bearer for the old gateway.
 */
export const secretKeyFetch: typeof fetch = (input, init) => {
  if (!SUPABASE_SECRET_KEY.startsWith('sb_secret_')) {
    return fetch(input, init)
  }

  const headers = new Headers(init?.headers)
  if (headers.get('authorization') === `Bearer ${SUPABASE_SECRET_KEY}`) {
    headers.delete('authorization')
  }
  return fetch(input, { ...init, headers })
}

/** Bypasses RLS and reaches GoTrue's admin API. Server code only, never per request user. */
export const supabaseAdmin = () =>
  createClient(PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: secretKeyFetch },
  })
