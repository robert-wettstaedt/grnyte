import { getRequestEvent } from '$app/server'
// @vitest-environment node
import { hasGrant, issueReauthCode, sessionCaller, writeGrant } from '$lib/auth/reauth.server'
import { createThrowawayUser, dropThrowawayUser, reachable, seedUsers, sql, type SeedUser } from '$lib/db/testDb'
import { formError } from '$lib/forms/schemas'
import { asRequest, withLocals } from '$lib/remote/testHarness'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteAccountCommand, updateEmailCommand, updatePasswordCommand } from './account.remote'

const deletion = vi.hoisted(() => ({ deleteAccount: vi.fn() }))
vi.mock('$lib/entities/user/delete.server', () => deletion)

/** What GoTrue answers the change with, and the mails grnyte sent itself. */
const gotrue = vi.hoisted(() => ({
  error: null as null | { code?: string; message: string; status?: number },
  mails: [] as { template: string; to: string }[],
  updateUser: vi.fn(),
}))
/** The admin update and the sign-in after it, as GoTrue answers them. */
const admin = vi.hoisted(() => ({
  breached: false,
  error: null as null | { message: string; name?: string; status?: number },
  options: [] as unknown[],
  updates: [] as [string, unknown][],
}))
const SESSION = { access_token: 'new.access.token', refresh_token: 'new-refresh' }
vi.mock('$lib/db/supabaseAdmin.server', () => ({
  supabaseAdmin: (options: unknown) => {
    admin.options.push(options)
    return {
      auth: {
        admin: {
          updateUserById: async (id: string, attributes: unknown) => {
            admin.updates.push([id, attributes])
            return { data: {}, error: admin.error }
          },
        },
      },
    }
  },
}))
vi.mock('$lib/auth/passwordPolicy.server', () => ({
  checkPassword: async () => (admin.breached ? 'breached' : 'ok'),
}))
vi.mock('$lib/auth/authServer.server', () => ({
  supabaseAuthServer: () => ({
    signInWithPassword: async () => ({ data: { session: { ...SESSION, user: {} } }, error: null }),
  }),
  supabaseAuthServerAs: () => ({
    updateUser: async (attributes: unknown) => {
      gotrue.updateUser(attributes)
      return { data: {}, error: gotrue.error }
    },
  }),
}))
vi.mock('$lib/email/send.server', () => ({
  sendEmail: async ({ template, to }: { template: string; to: string }) => {
    gotrue.mails.push({ template, to })
    return true
  },
}))
vi.mock('$lib/auth/events.server', () => ({ noteMailRefusal: async () => {} }))
vi.mock('$lib/logging/failure.server', () => ({ logServerFailure: async () => {} }))

let user: SeedUser

beforeAll(async () => {
  if (!reachable) return
  ;({ user } = await seedUsers({ user: 'user@grnyte.rocks' }))
})

beforeEach(() => {
  gotrue.error = null
  gotrue.mails = []
  gotrue.updateUser.mockClear()
})

const change = async (email: string) => {
  const outcome = await asRequest(user.authId, () => updateEmailCommand({ email })).then(
    (answer) => answer,
    (cause: { body?: unknown }) => cause.body,
  )
  return { outcome, updateUser: gotrue.updateUser }
}

describe.skipIf(!reachable)('updateEmailCommand', () => {
  it('refuses the address the account already has, on the field, before Supabase sends anything', async () => {
    const { outcome, updateUser } = await change('USER@grnyte.rocks')

    expect(outcome).toEqual({ field: 'email', message: formError('settings_emailUnchanged') })
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('starts the change for a different address', async () => {
    const { outcome, updateUser } = await change('someone-else@grnyte.rocks')

    expect(outcome).toEqual({ current: 'user@grnyte.rocks', email: 'someone-else@grnyte.rocks', success: true })
    expect(updateUser).toHaveBeenCalledWith({ email: 'someone-else@grnyte.rocks' })
  })

  it("answers a taken address like any other, changes nothing and tells that address's owner", async () => {
    await sql`delete from public.auth_code_attempts where subject = 'maintainer@grnyte.rocks'`
    const { outcome, updateUser } = await change('Maintainer@grnyte.rocks')

    expect(outcome).toEqual({ current: 'user@grnyte.rocks', email: 'Maintainer@grnyte.rocks', success: true })
    expect(updateUser).not.toHaveBeenCalled()
    expect(gotrue.mails).toEqual([{ template: 'already-has-account', to: 'maintainer@grnyte.rocks' }])
  })

  it('refuses a revoked session as ended, clears its cookies and starts nothing', async () => {
    const signOut = vi.fn(async () => ({ error: null }))
    const outcome = await asRequest(
      user.authId,
      async () => {
        await sql`delete from auth.sessions where id = ${getRequestEvent().locals.claims?.session_id ?? null}`
        return updateEmailCommand({ email: 'someone-else@grnyte.rocks' })
      },
      { auth: { signOut } },
    ).catch((cause: { body?: unknown; status?: number }) => cause)

    expect(outcome).toMatchObject({ body: { message: formError('auth_sessionEnded') }, status: 401 })
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(gotrue.updateUser).not.toHaveBeenCalled()
  })

  it('answers an outage 503 without signing out or starting anything', async () => {
    const signOut = vi.fn()
    const outcome = await withLocals(
      { backendUnavailable: true, claims: undefined, supabase: { auth: { signOut } } },
      () => updateEmailCommand({ email: 'someone-else@grnyte.rocks' }),
    ).catch((cause: { body?: unknown; status?: number }) => cause)

    expect(outcome).toMatchObject({ body: { message: formError('auth_serviceUnavailable') }, status: 503 })
    expect(signOut).not.toHaveBeenCalled()
    expect(gotrue.updateUser).not.toHaveBeenCalled()
  })

  it('shows a refused send as such instead of a false success', async () => {
    gotrue.error = { code: 'over_email_send_rate_limit', message: 'rate limit', status: 429 }
    expect((await change('someone-else@grnyte.rocks')).outcome).toEqual({ message: formError('auth_mailUnavailable') })

    // GoTrue's per-address wait shares the code: it is a "wait", not a failed mail.
    gotrue.error = {
      code: 'over_email_send_rate_limit',
      message: 'For security purposes, you can only request this after 29 seconds.',
      status: 429,
    }
    expect((await change('someone-else@grnyte.rocks')).outcome).toEqual({ message: formError('auth_rateLimited') })

    gotrue.error = { code: 'unexpected_failure', message: 'down', status: 503 }
    expect((await change('someone-else@grnyte.rocks')).outcome).toEqual({
      message: formError('auth_serviceUnavailable'),
    })
  })
})

describe.skipIf(!reachable)('deleteAccountCommand', () => {
  const signOut = vi.fn(async () => ({ error: null }))
  const remove = (payload: { password?: string } = {}) =>
    asRequest(user.authId, () => deleteAccountCommand(payload), { auth: { signOut } }).then(
      (done) => done,
      (cause: { body?: unknown }) => cause.body,
    )

  it('answers an old tab’s password with "reload this page" and deletes nothing', async () => {
    deletion.deleteAccount.mockClear()

    expect(await remove({ password: 'pw' })).toEqual({ message: formError('auth_reloadPage') })
    expect(deletion.deleteAccount).not.toHaveBeenCalled()
  })

  it('asks the new page for a confirmation when the deletion has none', async () => {
    deletion.deleteAccount.mockResolvedValue({ kind: 'reauthRequired' })

    expect(await remove()).toEqual({ field: 'code', message: formError('auth_reauthRequired') })
  })

  it('refuses while a region still needs the person, naming it', async () => {
    deletion.deleteAccount.mockResolvedValue({ kind: 'blocked', regions: ['Elbsandstein', 'Harz'] })

    expect(await remove()).toEqual({
      message: formError('settings_deleteAccountBlocked', { regions: 'Elbsandstein, Harz' }),
    })
  })

  it('deletes the signed-in account, by the address the verified token carries, for this session', async () => {
    deletion.deleteAccount.mockResolvedValue({ kind: 'deleted' })

    expect(await remove()).toBeUndefined()
    expect(deletion.deleteAccount).toHaveBeenLastCalledWith(
      { authUserFk: user.authId, email: 'user@grnyte.rocks', id: user.userId },
      { authUserId: user.authId, sessionId: expect.any(String) },
    )
    // This browser leaves signed out; GoTrue already revoked every other session with the account.
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
  })
})

describe.skipIf(!reachable)('updatePasswordCommand', () => {
  const NEW = 'a-new-Passw0rd!'
  // Its own account: `voidReauth` empties every code of the account, which other suites' seed users hold.
  let user: SeedUser
  const mail = () => ({ email: user.email, locale: 'en' as const })

  beforeAll(async () => {
    user = await createThrowawayUser('changepassword')
  })

  afterAll(async () => {
    await dropThrowawayUser(user)
  })

  beforeEach(async () => {
    admin.breached = false
    admin.error = null
    admin.options = []
    admin.updates = []
    gotrue.mails = []
    await sql`delete from public.reauth_challenges where auth_user_fk = ${user.authId}`
    await sql`delete from public.auth_code_attempts where subject = ${user.authId}`
  })

  /**
   * Runs the change in one request (grants bind to its session); `before` writes what should or
   * should not survive it. Reads back both grants and the open codes afterwards.
   */
  const change = (values: Record<string, string>, before: () => Promise<unknown> = async () => {}) => {
    const setSession = vi.fn(async () => ({ error: null }))
    const run = async () => {
      await before()
      const outcome = await updatePasswordCommand(values as { password: string }).then(
        (answer) => answer as unknown,
        (cause: { body?: unknown }) => cause.body,
      )
      const caller = sessionCaller()
      return {
        deleteGrant: await hasGrant(caller, 'account.delete', user.authId),
        grant: await hasGrant(caller, 'password.change', user.authId),
        openCodes: (await sql`select 1 from public.reauth_challenges where auth_user_fk = ${user.authId}`).length,
        outcome,
      }
    }
    return asRequest(user.authId, run, { auth: { setSession } }).then((done) => ({ ...done, setSession }))
  }
  const confirmed = () => writeGrant(sessionCaller(), 'password.change', user.authId, 'email_code')
  const confirmedWithOthers = async () => {
    await confirmed()
    await writeGrant(sessionCaller(), 'account.delete', user.authId, 'email_code')
    await issueReauthCode(sessionCaller(), 'region.delete', '1', mail())
  }

  it('answers an old tab’s current password with "reload this page" and changes nothing', async () => {
    const { outcome } = await change({ confirmPassword: NEW, currentPassword: 'hunter12', password: NEW })

    expect(outcome).toEqual({ message: formError('auth_reloadPage') })
    expect(admin.updates).toEqual([])
  })

  it('asks the new page for a confirmation when it has none', async () => {
    const { outcome } = await change({ password: NEW })

    expect(outcome).toEqual({ field: 'code', message: formError('auth_reauthRequired') })
    expect(admin.updates).toEqual([])
  })

  it('refuses a breached password on its field and stores nothing', async () => {
    admin.breached = true
    const { grant, outcome } = await change({ password: NEW }, confirmed)

    expect(outcome).toEqual({ field: 'password', message: formError('auth_passwordBreached') })
    expect(admin.updates).toEqual([])
    expect(grant).toBe(true)
  })

  it('sets the password through the admin API, voids every code and grant, and hands back the new session', async () => {
    const { deleteGrant, grant, openCodes, outcome, setSession } = await change({ password: NEW }, confirmedWithOthers)

    expect(outcome).toMatchObject({ session: SESSION, success: true })
    expect(admin.updates).toEqual([[user.authId, { password: NEW }]])
    expect(admin.options).toEqual([{ timeoutMs: 5000 }])
    expect([grant, deleteGrant, openCodes]).toEqual([false, false, 0])
    expect(setSession).toHaveBeenCalledWith(expect.objectContaining(SESSION))
    expect(gotrue.mails.filter((mail) => mail.template === 'password-changed')).toEqual([
      { template: 'password-changed', to: user.email },
    ])
  })

  it.each([
    ['a GoTrue refusal', { message: 'refused', status: 422 }],
    ['a timed-out call', { message: 'The operation was aborted due to timeout', name: 'AuthRetryableFetchError' }],
  ])('keeps the grant after %s but voids open codes', async (_name, error) => {
    admin.error = error
    const { grant, openCodes, outcome, setSession } = await change({ password: NEW }, confirmedWithOthers)

    expect(outcome).toHaveProperty('message')
    expect([grant, openCodes]).toEqual([true, 0])
    expect(setSession).not.toHaveBeenCalled()
  })
})
