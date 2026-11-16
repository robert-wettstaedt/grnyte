/** For GoTrue tests: the branch's local GoTrue, probed once, and a client on the publishable key. */
import 'dotenv/config'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.PUBLIC_SUPABASE_URL ?? ''

/** False in CI (no GoTrue) and whenever the local stack is down, so those suites skip visibly. */
export const gotrueReachable =
  url !== '' &&
  (await fetch(`${url}/auth/v1/health`, {
    headers: { apikey: process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '' },
    signal: AbortSignal.timeout(2000),
  }).then(
    (response) => response.ok,
    () => false,
  ))

/** A browser's view of GoTrue: the publishable key, one session in memory. */
export const publicClient = (): SupabaseClient =>
  createClient(url, process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '', {
    auth: { autoRefreshToken: false, persistSession: false },
  })
