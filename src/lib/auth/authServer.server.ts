import { SUPABASE_SECRET_KEY } from '$env/static/private'
import { PUBLIC_SUPABASE_URL } from '$env/static/public'
import { secretKeyFetch } from '$lib/db/supabaseAdmin.server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { RequestEvent } from '@sveltejs/kit'

/** The auth calls grnyte makes under the secret key. */
export type AuthServer = Pick<SupabaseClient['auth'], 'resend'>

/**
 * GoTrue under the secret key, forwarding the caller's address so its per-IP limits count each
 * person. An allowlist, never `client.auth`, which would hand out `admin` under the same key.
 */
export function supabaseAuthServer(event: Pick<RequestEvent, 'getClientAddress'>): AuthServer {
  // Per call: the forwarded address is per request. Only the platform's view of it is trusted.
  const client = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, flowType: 'implicit', persistSession: false },
    global: { fetch: secretKeyFetch, headers: { 'sb-forwarded-for': event.getClientAddress() } },
  })

  return Object.freeze({ resend: client.auth.resend.bind(client.auth) })
}
