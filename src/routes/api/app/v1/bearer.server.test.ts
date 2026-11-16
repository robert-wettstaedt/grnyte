/**
 * The Bearer endpoints on Postgres, GoTrue stubbed: each answers as its remote function and makes
 * the same change. Their GoTrue halves live in `codes.server.test.ts`.
 */
import { appCall } from '$lib/auth/app/appRequest.fixture'
import { V1 } from '$lib/auth/app/v1'
import { signInMethodsQuery, unlinkProvider } from '$lib/auth/identities.remote'
import { confirmReauthCode, reauthGrantStatus, requestReauthCode } from '$lib/auth/reauth.remote'
import { sessionCaller, writeGrant } from '$lib/auth/reauth.server'
import { deleteAccountRows } from '$lib/db/testAccounts'
import { reachable, seedUsers, sql, type SeedUser } from '$lib/db/testDb'
import { passwordSchema } from '$lib/forms/schemas'
import { asRequest, requestLocals, sessionToken } from '$lib/remote/testHarness'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  confirmEmailChangeCode,
  deleteAccountCommand,
  updateEmailCommand,
  updatePasswordCommand,
} from '../../../(app)/settings/account.remote'
import { completeProfile } from '../../../(landing)/auth/profile/profile.remote'
import { POST as accountDelete } from './account/delete/+server'
import { GET as deletionPreview } from './account/deletion-preview/+server'
import { POST as emailChange } from './email/change/+server'
import { POST as emailConfirm } from './email/confirm/+server'
import { POST as identitiesUnlink } from './identities/unlink/+server'
import { POST as passwordChange } from './password/change/+server'
import { POST as passwordNew } from './password/new/+server'
import { POST as profile } from './profile/+server'
import { POST as reauthConfirm } from './reauth/confirm/+server'
import { POST as reauthRequest } from './reauth/request/+server'
import { GET as reauthStatus } from './reauth/status/+server'
import { POST as signOutOthers } from './sessions/sign-out-others/+server'
import { GET as signInMethods } from './sign-in-methods/+server'

const deletion = vi.hoisted(() => ({ deleteAccount: vi.fn() }))
vi.mock('$lib/entities/user/delete.server', async (original) => ({ ...(await original<object>()), ...deletion }))

/** GoTrue as these bodies reach it, and the mails grnyte sends itself. */
const gotrue = vi.hoisted(() => ({
  breached: false,
  calls: [] as unknown[][],
  mails: [] as { code?: string; template: string; to: string }[],
  /** What `verifyOtp` answers: no session unless a test sets one. */
  otpSession: null as null | { access_token: string; refresh_token: string },
  /** The access token each `supabaseAuthServerAs` client acts as. */
  signedInAs: [] as string[],
}))
vi.mock('$lib/db/supabaseAdmin.server', () => ({
  supabaseAdmin: () => ({
    auth: {
      admin: {
        updateUserById: async (id: string, attributes: unknown) => {
          gotrue.calls.push(['admin.updateUserById', id, attributes])
          return { data: {}, error: null }
        },
      },
    },
  }),
}))
vi.mock('$lib/auth/passwordPolicy.server', () => ({ checkPassword: async () => (gotrue.breached ? 'breached' : 'ok') }))
const SESSION = { access_token: 'new.access.token', expires_at: 1_900_000_000, refresh_token: 'new-refresh' }
/** The address an email change code moves the account to. */
const MOVED = 'moved@grnyte.test'
vi.mock('$lib/auth/authServer.server', () => {
  const record =
    (name: string) =>
    async (...args: unknown[]) => {
      gotrue.calls.push([name, ...args])
      return { data: {}, error: null }
    }
  return {
    supabaseAuthServer: () => ({
      signInWithPassword: async () => ({ data: { session: { ...SESSION, user: {} } }, error: null }),
      verifyOtp: async () => ({
        data: { session: gotrue.otpSession, user: gotrue.otpSession && { email: MOVED } },
        error: null,
      }),
    }),
    supabaseAuthServerAs: (_event: unknown, token: { accessToken: string }) => {
      gotrue.signedInAs.push(token.accessToken)
      return { signOut: record('signOut'), updateUser: record('updateUser') }
    },
  }
})
vi.mock('$lib/email/send.server', async () =>
  (await import('$lib/email/send.fixture')).recordingSend(
    ({ code, template, to }: { code?: string; template: string; to: string }) =>
      gotrue.mails.push({ template, to, ...(code == null ? {} : { code }) }),
  ),
)
vi.mock('$lib/auth/events.server', () => ({ noteMailRefusal: async () => {}, recordAuthEvent: async () => {} }))
vi.mock('$lib/logging/failure.server', () => ({ logServerFailure: async () => {} }))
// The harness token carries no `amr`; the code-session rule has its own GoTrue tests.
vi.mock('$lib/auth', async (original) => ({ ...(await original<object>()), isFreshCodeSession: () => true }))

let user: SeedUser
const stub = { auth: { setSession: async () => ({}), signOut: async () => ({ error: null }) } }
/** A new Bearer session of `authUserId`, as the hook leaves its locals. */
const bearer = (authUserId = user.authId) => requestLocals(authUserId, stub)
const web = <T>(fn: () => Promise<T>) =>
  asRequest(user.authId, fn, stub).then(
    (answer) => answer as unknown,
    (cause: { body?: unknown }) => cause.body,
  )
const keyOf = (message: string) => (JSON.parse(message) as { message: string }).message

const profileless: string[] = []
async function newProfileless(): Promise<string> {
  const [{ id }] = await sql<{ id: string }[]>`
    insert into auth.users (id, email) values (gen_random_uuid(), ${`app-bearer-${crypto.randomUUID()}@grnyte.test`})
    returning id`
  profileless.push(id)
  return id
}

beforeAll(async () => {
  if (!reachable) return
  ;({ user } = await seedUsers({ user: 'user@grnyte.rocks' }))
})

afterAll(async () => {
  if (!reachable) return
  await deleteAccountRows(sql, profileless)
})

beforeEach(() => {
  gotrue.breached = false
  gotrue.calls = []
  gotrue.mails = []
  gotrue.otpSession = null
  gotrue.signedInAs = []
  deletion.deleteAccount.mockReset()
})

describe.skipIf(!reachable)('POST password/new and password/change', () => {
  it('refuses a password with a trailing space with the web key, on its field, and stores nothing', async () => {
    const checked = await passwordSchema['~standard'].validate('a-new-Passw0rd! ')
    const webKey = keyOf(checked.issues![0].message)
    for (const [handler, path] of [
      [passwordNew, 'password/new'],
      [passwordChange, 'password/change'],
    ] as const) {
      const response = await appCall(handler, path, { body: { password: 'a-new-Passw0rd! ' }, locals: await bearer() })
      expect(response.status).toBe(400)
      expect((await response.json()).error).toMatchObject({ code: webKey, field: 'password' })
    }
    expect(gotrue.calls).toEqual([])
  })

  it('refuses a breached password with the web key and stores nothing', async () => {
    gotrue.breached = true
    for (const [handler, path] of [
      [passwordNew, 'password/new'],
      [passwordChange, 'password/change'],
    ] as const) {
      const response = await appCall(handler, path, { body: { password: 'a-new-Passw0rd!' }, locals: await bearer() })
      expect((await response.json()).error).toEqual({ code: 'auth_passwordBreached', field: 'password' })
    }
    expect(gotrue.calls).toEqual([])
  })

  it('changes the password behind a grant as the remote function does, and answers the new session (parity)', async () => {
    const locals = await bearer()
    const grant = async () => {
      await writeGrant(sessionCaller(), 'password.change', user.authId, 'email_code')
      return new Response()
    }
    await appCall(grant, 'grant', { locals })
    const app = await appCall(passwordChange, 'password/change', { body: { password: 'a-new-Passw0rd!' }, locals })
    const appCalls = gotrue.calls
    gotrue.calls = []
    const viaWeb = await web(async () => {
      await writeGrant(sessionCaller(), 'password.change', user.authId, 'email_code')
      return updatePasswordCommand({ password: 'a-new-Passw0rd!' })
    })

    expect(V1['password/change'].response.parse(await app.json())).toEqual({ session: SESSION })
    expect(viaWeb).toMatchObject({ success: true })
    expect(appCalls).toEqual(gotrue.calls)
    expect(appCalls).toEqual([['admin.updateUserById', user.authId, { password: 'a-new-Passw0rd!' }]])
  })
})

describe.skipIf(!reachable)('POST email/change', () => {
  it("answers a taken address as a free one and tells that address's owner, as the remote function does (parity)", async () => {
    await sql`delete from public.auth_code_attempts where subject = 'maintainer@grnyte.rocks'`
    const taken = await appCall(emailChange, 'email/change', {
      body: { email: 'Maintainer@grnyte.rocks' },
      locals: await bearer(),
    })
    const takenMails = gotrue.mails
    const free = await appCall(emailChange, 'email/change', {
      body: { email: 'nobody-here@grnyte.rocks' },
      locals: await bearer(),
    })
    gotrue.mails = []
    await sql`delete from public.auth_code_attempts where subject = 'maintainer@grnyte.rocks'`
    await web(() => updateEmailCommand({ email: 'Maintainer@grnyte.rocks' }))

    expect(V1['email/change'].response.parse(await taken.json())).toEqual({ ok: true })
    expect(V1['email/change'].response.parse(await free.json())).toEqual({ ok: true })
    expect(takenMails).toEqual([{ template: 'already-has-account', to: 'maintainer@grnyte.rocks' }])
    expect(gotrue.mails).toEqual(takenMails)
  })
})

describe.skipIf(!reachable)('POST email/confirm', () => {
  it("answers the first of the two codes as the remote function does, the web's step as next (parity)", async () => {
    await sql`delete from public.auth_code_attempts where subject = 'user@grnyte.rocks'`
    const input = { code: '12345678', email: 'user@grnyte.rocks' }
    const response = await appCall(emailConfirm, 'email/confirm', { body: input, locals: await bearer() })
    const viaWeb = await web(() => confirmEmailChangeCode(input))

    expect(V1['email/confirm'].response.parse(await response.json())).toEqual({ next: 'next' })
    expect(viaWeb).toEqual({ step: 'next' })
  })

  const confirmBoth = async () => {
    await sql`delete from public.auth_code_attempts where subject = ${MOVED}`
    const input = { code: '12345678', email: MOVED }
    const app = await appCall(emailConfirm, 'email/confirm', { body: input, locals: await bearer() })
    const setSession = vi.fn(async () => ({}))
    const viaWeb = await asRequest(user.authId, () => confirmEmailChangeCode(input), {
      auth: { ...stub.auth, setSession },
    })
    return { app: V1['email/confirm'].response.parse(await app.json()), setSession, viaWeb }
  }

  it('signs the other sessions out as the new session and hands it over, on both transports', async () => {
    const fresh = { access_token: await sessionToken(user.authId, MOVED), refresh_token: 'fresh-refresh' }
    gotrue.otpSession = fresh

    const { app, setSession, viaWeb } = await confirmBoth()

    expect(app).toEqual({ next: 'done', session: fresh })
    expect(viaWeb).toEqual({ step: 'done' })
    expect(setSession).toHaveBeenCalledWith(fresh)
    expect(gotrue.signedInAs).toEqual([fresh.access_token, fresh.access_token])
    expect(gotrue.calls).toEqual([
      ['signOut', { scope: 'others' }],
      ['signOut', { scope: 'others' }],
    ])
  })

  it('hands out no session it could not verify, and the caller keeps its own', async () => {
    gotrue.otpSession = { access_token: 'not.a.token', refresh_token: 'fresh-refresh' }

    const { app, setSession, viaWeb } = await confirmBoth()

    expect(app).toEqual({ next: 'done' })
    expect(viaWeb).toEqual({ step: 'done' })
    expect(setSession).not.toHaveBeenCalled()
    expect(gotrue.signedInAs).not.toContain('not.a.token')
  })
})

describe.skipIf(!reachable)('POST profile', () => {
  it('creates the profile of a profile-less Bearer caller, as the remote function does (parity)', async () => {
    const [viaApp, viaWeb] = [await newProfileless(), await newProfileless()]
    const username = (id: string) => `app${id.slice(0, 8)}`

    const response = await appCall(profile, 'profile', {
      body: { gradingScale: 'FB', username: username(viaApp) },
      locals: await requestLocals(viaApp, stub),
    })
    await asRequest(viaWeb, () => completeProfile({ gradingScale: 'FB', username: username(viaWeb) }), stub)

    expect(V1.profile.response.parse(await response.json())).toEqual({ ok: true })
    const rows = await sql`select auth_user_fk from public.users where auth_user_fk = any(${[viaApp, viaWeb]})`
    expect(rows).toHaveLength(2)
  })

  it('refuses a username the web refuses, on its field', async () => {
    const response = await appCall(profile, 'profile', {
      body: { gradingScale: 'FB', username: 'x' },
      locals: await requestLocals(await newProfileless(), stub),
    })
    expect((await response.json()).error.field).toBe('username')
  })
})

describe.skipIf(!reachable)('reauth/request, reauth/confirm, reauth/status', () => {
  it('confirms by the mailed code for the confirming Bearer session only (parity)', async () => {
    const subject = { action: 'region.delete', target: '41' } as const
    await sql`delete from public.auth_code_attempts where subject = ${user.authId}`
    const locals = await bearer()
    const requested = await appCall(reauthRequest, 'reauth/request', { body: subject, locals })
    V1['reauth/request'].response.parse(await requested.json())
    const code = gotrue.mails.at(-1)?.code

    const confirmed = await appCall(reauthConfirm, 'reauth/confirm', { body: { ...subject, code }, locals })
    const status = async (l: object) =>
      V1['reauth/status'].response.parse(
        await (
          await appCall(reauthStatus, `reauth/status?action=${subject.action}&target=${subject.target}`, {
            locals: l,
            method: 'GET',
          })
        ).json(),
      )

    expect(V1['reauth/confirm'].response.parse(await confirmed.json())).toEqual({ confirmed: true })
    expect(await status(locals)).toEqual({ confirmed: true })
    expect(await status(await bearer())).toEqual({ confirmed: false })

    const viaWeb = await web(async () => {
      await requestReauthCode({ action: 'region.delete', target: '42' })
      const answer = await confirmReauthCode({
        action: 'region.delete',
        code: gotrue.mails.at(-1)!.code!,
        target: '42',
      })
      return { answer, status: await reauthGrantStatus({ action: 'region.delete', target: '42' }) }
    })
    expect(viaWeb).toEqual({ answer: { confirmed: true }, status: true })
  })

  it('answers an identity action on a non-provider target invalid_request, never Kit text', async () => {
    const response = await appCall(reauthRequest, 'reauth/request', {
      body: { action: 'identity.link', target: 'x' },
      locals: await bearer(),
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: { code: 'invalid_request' } })
  })
})

describe.skipIf(!reachable)('account/delete and sessions/sign-out-others', () => {
  it('deletes for the Bearer session holding the grant, as the remote function does (parity)', async () => {
    deletion.deleteAccount.mockResolvedValue({ kind: 'deleted' })
    const locals = await bearer()

    const response = await appCall(accountDelete, 'account/delete', { locals })
    await web(() => deleteAccountCommand({}))

    expect(V1['account/delete'].response.parse(await response.json())).toEqual({ ok: true })
    const [[appArgs, appCaller], [webArgs]] = deletion.deleteAccount.mock.calls as [unknown, { sessionId: string }][]
    expect(appArgs).toEqual(webArgs)
    expect(appCaller.sessionId).toBe(locals.claims.session_id)
  })

  it('answers a profile-less caller profile_required on delete and its preview', async () => {
    const locals = await requestLocals(await newProfileless(), stub)
    const deleted = await appCall(accountDelete, 'account/delete', { locals })
    const preview = await appCall(deletionPreview, 'account/deletion-preview', { locals, method: 'GET' })

    for (const response of [deleted, preview]) {
      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: { code: 'profile_required' } })
    }
    expect(deletion.deleteAccount).not.toHaveBeenCalled()
  })

  it('refuses a caller without a grant with the remote key', async () => {
    deletion.deleteAccount.mockResolvedValue({ kind: 'reauthRequired' })
    const response = await appCall(accountDelete, 'account/delete', { locals: await bearer() })
    expect((await response.json()).error).toEqual({ code: 'auth_reauthRequired', field: 'code' })
  })

  it('signs the other sessions out with no grant (parity)', async () => {
    const response = await appCall(signOutOthers, 'sessions/sign-out-others', { locals: await bearer() })
    const appCalls = gotrue.calls
    gotrue.calls = []
    await web(async () => (await import('$lib/auth/session.remote')).signOutOthers())

    expect(V1['sessions/sign-out-others'].response.parse(await response.json())).toEqual({ ok: true })
    expect(appCalls).toEqual([['signOut', { scope: 'others' }]])
    expect(gotrue.calls).toEqual(appCalls)
  })
})

describe.skipIf(!reachable)('sign-in-methods and identities/unlink', () => {
  it('reads the methods the remote query reads (parity)', async () => {
    const response = await appCall(signInMethods, 'sign-in-methods', { locals: await bearer(), method: 'GET' })
    const viaWeb = await web(() => signInMethodsQuery())

    expect(V1['sign-in-methods'].response.parse(await response.json())).toEqual(viaWeb)
  })

  it('refuses to unlink a provider that is not linked with the remote key, and unlinks nothing (parity)', async () => {
    const response = await appCall(identitiesUnlink, 'identities/unlink', {
      body: { provider: 'google' },
      locals: await bearer(),
    })
    const viaWeb = (await web(() => unlinkProvider({ provider: 'google' }))) as { message: string }

    expect((await response.json()).error.code).toBe(keyOf(viaWeb.message))
    expect(gotrue.calls).toEqual([])
  })
})
