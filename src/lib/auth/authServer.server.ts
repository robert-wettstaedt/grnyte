import { SUPABASE_SECRET_KEY } from '$env/static/private'
import { PUBLIC_SUPABASE_URL } from '$env/static/public'
import type { VerifiedToken } from '$lib/auth'
import { secretKeyFetch } from '$lib/db/supabaseAdmin.server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { RequestEvent } from '@sveltejs/kit'
import { decodeJwt } from 'jose'

/** The auth calls grnyte makes under the secret key. */
export type AuthServer = Pick<
  SupabaseClient['auth'],
  'resend' | 'resetPasswordForEmail' | 'signInWithPassword' | 'verifyOtp'
>

export type AuthServerAs = Pick<SupabaseClient['auth'], 'linkIdentity' | 'updateUser'>

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
  const { auth } = client

  return Object.freeze({
    resend: auth.resend.bind(auth),
    resetPasswordForEmail: auth.resetPasswordForEmail.bind(auth),
    signInWithPassword: auth.signInWithPassword.bind(auth),
    verifyOtp: auth.verifyOtp.bind(auth),
  })
}

const STORAGE_KEY = 'grnyte-auth-as'
const YEAR_S = 365 * 24 * 60 * 60

/**
 * Like `supabaseAuthServer`, but acting as `user`: auth-js reads the session from storage before
 * these calls, so a per-call store is seeded with the person's token (`secretKeyFetch` keeps a user Bearer).
 */
export function supabaseAuthServerAs(event: Pick<RequestEvent, 'getClientAddress'>, user: VerifiedToken): AuthServerAs {
  const { session_id: sessionId, sub } = decodeJwt(user.accessToken)
  if (sub !== user.claims.sub || sessionId !== user.claims.session_id) {
    throw new Error('[auth] the token and its claims name different sessions')
  }

  // shortcut: seeding storage is supabase-js's only stateless way to act as a user; move to GoTrue's REST endpoints if a release breaks it.
  // `expires_at` only stops auth-js refreshing (with no refresh token, that throws); GoTrue still checks the JWT's `exp`.
  const stored = new Map([
    [
      STORAGE_KEY,
      JSON.stringify({
        access_token: user.accessToken,
        expires_at: Math.floor(Date.now() / 1000) + YEAR_S,
        refresh_token: '',
        token_type: 'bearer',
        user: { id: sub },
      }),
    ],
  ])
  const client = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: 'implicit',
      // Required: with it false auth-js ignores `storage` and the seed is never read.
      persistSession: true,
      storage: {
        getItem: (key) => stored.get(key) ?? null,
        removeItem: (key) => void stored.delete(key),
        setItem: (key, value) => void stored.set(key, value),
      },
      storageKey: STORAGE_KEY,
    },
    global: { fetch: secretKeyFetch, headers: { 'sb-forwarded-for': event.getClientAddress() } },
  })
  const { auth } = client

  return Object.freeze({
    linkIdentity: auth.linkIdentity.bind(auth),
    updateUser: auth.updateUser.bind(auth),
  })
}
