/** For GoTrue tests: the branch's local GoTrue, probed once, and a client on the publishable key. */
import 'dotenv/config'
import { SIGNUP_MARKER } from '$lib/auth'
import { verifyAccessToken } from '$lib/auth/verify.server'
import { supabaseAdmin } from '$lib/db/supabaseAdmin.server'
import { sql } from '$lib/db/testDb'
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

/** A device signed in by a code, with the locals its requests carry. */
export async function codeDevice(email: string) {
  const client = await codeSignedIn(email)
  const verified = await verifyAccessToken((await client.auth.getSession()).data.session?.access_token)
  if (!verified.ok) throw new Error(`session did not verify: ${verified.reason}`)
  return {
    client,
    locals: { backendUnavailable: false, claims: verified.claims, supabase: client, verifiedToken: verified.token },
  }
}

/** A client signed in by a code the admin API hands out instead of mailing. */
export async function codeSignedIn(email: string): Promise<SupabaseClient> {
  const client = publicClient()
  const link = await supabaseAdmin().auth.admin.generateLink({ email, type: 'magiclink' })
  if (link.error != null) throw link.error
  const { error } = await client.auth.verifyOtp({ email, token: link.data.properties.email_otp, type: 'magiclink' })
  if (error != null) throw error
  return client
}

/** A grnyte-made account through the admin API; its id. */
export async function createAccount(email: string, init: { confirmed?: boolean; password?: string } = {}) {
  const { data, error } = await supabaseAdmin().auth.admin.createUser({
    app_metadata: SIGNUP_MARKER,
    email,
    email_confirm: init.confirmed ?? true,
    password: init.password,
  })
  if (error != null) throw error
  return data.user.id
}

/** Swaps the account's email identity for a `google` one, under the created-user marker. */
export async function makeSocialOnly(userId: string, email: string): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`select set_config('grnyte.auth_user_created', ${userId}, true)`
    await tx`delete from auth.identities where user_id = ${userId}`
    await tx`
      insert into auth.identities (user_id, provider, provider_id, identity_data, created_at, updated_at, last_sign_in_at)
      values (${userId}, 'google', ${crypto.randomUUID()}, ${tx.json({ email })}, now(), now(), now())`
  })
}

const MAILBOX = `${process.env.E2E_MAILBOX ?? 'http://localhost:9010'}/api/v1/mailbox`

/** Subjects of the mails GoTrue sent to `email`, oldest first, from the second stack's mail catcher. */
export const mailSubjects = async (email: string): Promise<string[]> =>
  ((await (await fetch(`${MAILBOX}/${email.split('@')[0]}`)).json()) as { subject: string }[]).map(
    (mail) => mail.subject,
  )
