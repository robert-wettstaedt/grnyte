import { CONTESTED_SIGNUP } from '$lib/auth'
/**
 * GoTrue test: the app's code, password and session endpoints on the branch's GoTrue, codes read
 * from its mail catcher. Skips visibly without the stack (always in CI).
 */
import { appCall } from '$lib/auth/app/appRequest.fixture'
import { bearerSession } from '$lib/auth/app/bearer.server'
import { V1 } from '$lib/auth/app/v1'
import { sessionCaller, writeGrant } from '$lib/auth/reauth/reauth.server'
import {
  codeDevice,
  codeFor,
  createAccount,
  gotrueReachable,
  mailCount,
  publicClient,
} from '$lib/auth/server/gotrue.fixture'
import { verifyAccessToken } from '$lib/auth/server/verify.server'
import { sql } from '$lib/db/testDb'
import { solvedProofOfWork } from '$lib/forms/bot/proofOfWorkFixture'
import { getPageState } from '$lib/hooks/auth.server'
import { asAnonymousRequest } from '$lib/remote/testHarness'
import type { RequestHandler } from '@sveltejs/kit'
import { afterAll, describe, expect, it } from 'vitest'
import { confirmSignupCode } from '../../../(landing)/auth/(tabs)/signup/signup.remote'
import { POST as accountDelete } from './account/delete/+server'
import { GET as deletionPreview } from './account/deletion-preview/+server'
import { POST as identitiesUnlink } from './identities/unlink/+server'
import { POST as passwordChange } from './password/change/+server'
import { POST as passwordForgot } from './password/forgot/+server'
import { POST as resetConfirm } from './password/reset/confirm/+server'
import { POST as reauthConfirm } from './reauth/confirm/+server'
import { POST as reauthRequest } from './reauth/request/+server'
import { GET as reauthStatus } from './reauth/status/+server'
import { POST as signOutOthers } from './sessions/sign-out-others/+server'
import { GET as signInMethods } from './sign-in-methods/+server'
import { POST as signinUnconfirmed } from './signin/unconfirmed/+server'
import { POST as signup } from './signup/+server'
import { POST as signupConfirm } from './signup/confirm/+server'
import { POST as signupResend } from './signup/resend/+server'

const STRANGER = 'stranger-password-1'
const OWNER = 'owner-password-2'
const created: string[] = []
const address = (label: string) => {
  const email = `app${label}${crypto.randomUUID().slice(0, 8)}@example.test`
  created.push(email)
  return email
}

const proof = async () => (await solvedProofOfWork()).encoded
/** A call as the hook leaves an anonymous app request: an in-memory client, no session. */
const anon = async (handler: RequestHandler, path: string, body: object) => {
  const response = await appCall(handler, path, { body, locals: { supabase: publicClient() } })
  return { body: (await response.json()) as Record<string, unknown> & { error?: { code: string } }, response }
}
const signUpApp = async (email: string, password: string) =>
  (await anon(signup, 'signup', { email, password, proofOfWork: await proof() })).body as { resendToken: string }
const flagged = async (email: string) =>
  (
    await sql<{ flag: null | string }[]>`
    select raw_app_meta_data->>${CONTESTED_SIGNUP} as flag from auth.users where email = ${email}`
  )[0]?.flag != null
const sessionRows = async (email: string) =>
  sql`select 1 from auth.sessions s join auth.users u on u.id = s.user_id where u.email = ${email}`
const signsIn = async (email: string, password: string) =>
  (await publicClient().auth.signInWithPassword({ email, password })).error == null
const wrongOf = (code: string) => String((Number(code) + 1) % 1e8).padStart(8, '0')

afterAll(async () => {
  if (!gotrueReachable) return
  await sql`delete from public.auth_code_attempts where subject = any(${created})`
  await sql`delete from auth.users where email = any(${created})`
})

describe.skipIf(!gotrueReachable)('signup/confirm and signup/resend on GoTrue', { timeout: 20_000 }, () => {
  it('answers choosePassword with a working session to the inbox owner of a contested sign-up and refuses the stranger', async () => {
    const email = address('contested')
    await signUpApp(email, STRANGER)
    await signUpApp(email, OWNER)

    const { body } = await anon(signupConfirm, 'signup/confirm', { code: await codeFor(email), email })
    const answer = V1['signup/confirm'].response.parse(body)

    expect(answer.next).toBe('choosePassword')
    expect((await verifyAccessToken(answer.session?.access_token)).ok).toBe(true)
    expect(await signsIn(email, STRANGER)).toBe(false)
  })

  it('confirms an uncontested sign-up as the remote function does (parity)', async () => {
    const [viaApp, viaWeb] = [address('confirmapp'), address('confirmweb')]
    await signUpApp(viaApp, OWNER)
    await signUpApp(viaWeb, OWNER)

    const { body } = await anon(signupConfirm, 'signup/confirm', { code: await codeFor(viaApp), email: viaApp })
    const web = await asAnonymousRequest({ auth: publicClient().auth }, async () =>
      confirmSignupCode({ code: await codeFor(viaWeb), email: viaWeb }),
    )

    expect(V1['signup/confirm'].response.parse(body).next).toBe(web.next)
    const confirmed = await sql`
      select 1 from auth.users where email = any(${[viaApp, viaWeb]}) and email_confirmed_at is not null`
    expect(confirmed).toHaveLength(2)
  })

  it('resends with the sign-up resend token without flagging the account', async () => {
    const email = address('resend')
    const { resendToken } = await signUpApp(email, OWNER)

    await anon(signupResend, 'signup/resend', { email, proofOfWork: await proof(), resendToken })

    expect(await flagged(email)).toBe(false)
  })

  it('locks the code after five wrong tries, and a resend clears the lock', async () => {
    const email = address('locked')
    const { resendToken } = await signUpApp(email, OWNER)
    const code = await codeFor(email)
    const confirm = (sent: string) => anon(signupConfirm, 'signup/confirm', { code: sent, email })

    for (let i = 0; i < 5; i++) expect((await confirm(wrongOf(code))).body.error?.code).toBe('auth_codeWrong')
    expect((await confirm(code)).body.error?.code).toBe('auth_codeLocked')

    // GoTrue mails one code per address per minute.
    await new Promise((resolve) => setTimeout(resolve, 61_000))
    const before = await mailCount(email)
    const resent = await anon(signupResend, 'signup/resend', { email, proofOfWork: await proof(), resendToken })
    expect(V1['signup/resend'].response.parse(resent.body)).toEqual({ ok: true })
    expect(V1['signup/confirm'].response.parse((await confirm(await codeFor(email, before))).body).next).toBe('profile')
  }, 120_000)
})

describe.skipIf(!gotrueReachable)('signin/unconfirmed on GoTrue', { timeout: 20_000 }, () => {
  const ACCENT = 'café-password-3'
  const send = (email: string, password: string) => anon(signinUnconfirmed, 'signin/unconfirmed', { email, password })

  it('sends a code without flagging for the right password, and nothing for a wrong one', async () => {
    const [right, wrong] = [address('unconfright'), address('unconfwrong')]
    await createAccount(right, { confirmed: false, password: OWNER })
    await createAccount(wrong, { confirmed: false, password: OWNER })

    const answer = V1['signin/unconfirmed'].response.parse((await send(right, OWNER)).body)
    const refused = await send(wrong, STRANGER)

    expect(answer).toMatchObject({ confirm: right })
    expect(await codeFor(right)).toMatch(/^\d{8}$/)
    expect(await flagged(right)).toBe(false)
    expect(refused.response.status).toBe(400)
    expect(await mailCount(wrong)).toBe(0)
  })

  it('accepts a decomposed entry of a composed password, and a decomposed stored password entered so', async () => {
    const [composed, decomposed] = [address('unconfnfc'), address('unconfnfd')]
    await createAccount(composed, { confirmed: false, password: ACCENT })
    await createAccount(decomposed, { confirmed: false, password: ACCENT.normalize('NFD') })

    expect((await send(composed, ACCENT.normalize('NFD'))).body).toMatchObject({ confirm: composed })
    expect((await send(decomposed, ACCENT.normalize('NFD'))).body).toMatchObject({ confirm: decomposed })
  })

  it('answers alreadyConfirmed for a confirmed account and leaves no session, decomposed password too', async () => {
    const [plain, decomposed] = [address('confplain'), address('confnfd')]
    await createAccount(plain, { password: OWNER })
    await createAccount(decomposed, { password: ACCENT.normalize('NFD') })

    expect((await send(plain, OWNER)).body).toEqual({ alreadyConfirmed: true })
    expect((await send(decomposed, ACCENT.normalize('NFD'))).body).toEqual({ alreadyConfirmed: true })
    expect(await sessionRows(plain)).toHaveLength(0)
    expect(await sessionRows(decomposed)).toHaveLength(0)
  })
})

describe.skipIf(!gotrueReachable)('password/forgot and password/reset/confirm on GoTrue', { timeout: 20_000 }, () => {
  it('answers every branch alike, and a correct code returns a session', async () => {
    const [confirmed, unconfirmed, unknown] = [address('forgotc'), address('forgotu'), address('forgotn')]
    await createAccount(confirmed, { password: OWNER })
    await createAccount(unconfirmed, { confirmed: false, password: OWNER })

    const answers = []
    for (const email of [confirmed, unconfirmed, unknown]) {
      const { body, response } = await anon(passwordForgot, 'password/forgot', { email, proofOfWork: await proof() })
      answers.push([response.status, V1['password/forgot'].response.parse(body)])
    }
    expect(answers).toEqual([
      [200, { ok: true }],
      [200, { ok: true }],
      [200, { ok: true }],
    ])

    const { body } = await anon(resetConfirm, 'password/reset/confirm', {
      code: await codeFor(confirmed),
      email: confirmed,
    })
    const answer = V1['password/reset/confirm'].response.parse(body)
    expect(answer.next).toBe('choosePassword')
    expect((await verifyAccessToken(answer.session?.access_token)).ok).toBe(true)
  })
})

describe.skipIf(!gotrueReachable)('Bearer sessions on GoTrue', { timeout: 20_000 }, () => {
  it('answers a working session to password/change after a re-auth and ends the other session', async () => {
    const email = address('change')
    await createAccount(email, { password: OWNER })
    const [here, other] = [await codeDevice(email), await codeDevice(email)]
    const locals = { ...here.locals, user: { id: 0 } }
    await appCall(
      async () => {
        await writeGrant(sessionCaller(), 'password.change', here.locals.claims.sub, 'email_code')
        return new Response()
      },
      'grant',
      { locals },
    )

    const response = await appCall(passwordChange, 'password/change', { body: { password: 'a-new-Passw0rd!' }, locals })
    const { session } = V1['password/change'].response.parse(await response.json())

    expect((await publicClient().auth.getUser(session.access_token)).error).toBeNull()
    expect(await sql`select 1 from auth.sessions where id = ${other.locals.claims.session_id ?? null}`).toHaveLength(0)
  })

  it("refuses every account endpoint to another session's token once sessions/sign-out-others ran", async () => {
    const email = address('others')
    await createAccount(email, { password: OWNER })
    const [here, other] = [await codeDevice(email), await codeDevice(email)]
    const token = (await other.client.auth.getSession()).data.session!.access_token

    await appCall(signOutOthers, 'sessions/sign-out-others', { locals: here.locals })
    const request = new Request('https://grnyte.example/api/app/v1/x', {
      headers: { authorization: `Bearer ${token}` },
    })
    const locals = { ...(await bearerSession(request, getPageState)), supabase: publicClient() }

    const subject = { action: 'region.delete', target: '1' }
    const calls: [RequestHandler, string, object?][] = [
      [reauthRequest, 'reauth/request', subject],
      [reauthConfirm, 'reauth/confirm', { ...subject, code: '000000' }],
      [reauthStatus, 'reauth/status?action=region.delete&target=1'],
      [deletionPreview, 'account/deletion-preview'],
      [accountDelete, 'account/delete', {}],
      [signOutOthers, 'sessions/sign-out-others', {}],
      [signInMethods, 'sign-in-methods'],
      [identitiesUnlink, 'identities/unlink', { provider: 'google' }],
    ]
    const statuses = []
    for (const [handler, path, body] of calls) {
      const response = await appCall(handler, path, { body, locals, method: body == null ? 'GET' : 'POST' })
      statuses.push(response.status)
    }
    expect(statuses).toEqual(calls.map(() => 401))
  })
})
