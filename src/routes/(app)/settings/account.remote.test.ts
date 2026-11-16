// @vitest-environment node
import { reauthCaller, writeGrant } from '$lib/auth/reauth.server'
import { reachable, seedUsers, type SeedUser } from '$lib/db/testDb'
import { formError } from '$lib/forms/schemas'
import { asRequest } from '$lib/remote/testHarness'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { deleteAccountCommand, updateEmailCommand, updatePasswordCommand } from './account.remote'

const deletion = vi.hoisted(() => ({ deleteAccount: vi.fn() }))
vi.mock('$lib/entities/user/delete.server', () => deletion)

let user: SeedUser

beforeAll(async () => {
  if (!reachable) return
  ;({ user } = await seedUsers({ user: 'user@grnyte.rocks' }))
})

const change = async (email: string) => {
  const updateUser = vi.fn(async () => ({ error: null }))
  const outcome = await asRequest(user.authId, () => updateEmailCommand({ email }), { auth: { updateUser } }).then(
    () => 'sent',
    (cause: { body?: unknown }) => cause.body,
  )
  return { outcome, updateUser }
}

describe.skipIf(!reachable)('updateEmailCommand', () => {
  it('refuses the address the account already has, on the field, before Supabase sends anything', async () => {
    const { outcome, updateUser } = await change('USER@grnyte.rocks')

    expect(outcome).toEqual({ field: 'email', message: formError('settings_emailUnchanged') })
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('starts the change for a different address', async () => {
    const { outcome, updateUser } = await change('someone-else@grnyte.rocks')

    expect(outcome).toBe('sent')
    expect(updateUser).toHaveBeenCalledOnce()
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
  const change = (values: Record<string, string>, error: unknown = null, confirmed = false) => {
    const updateUser = vi.fn(async () => ({ error }))
    const run = async () => {
      if (confirmed) await writeGrant(reauthCaller(), 'password.change', user.authId, 'email_code')
      return updatePasswordCommand(values as { password: string })
    }
    return asRequest(user.authId, run, { auth: { updateUser } }).then(
      () => ({ outcome: 'done', updateUser }),
      (cause: { body?: unknown }) => ({ outcome: cause.body, updateUser }),
    )
  }

  it('answers an old tab’s current password with "reload this page" and changes nothing', async () => {
    const { outcome, updateUser } = await change({ confirmPassword: NEW, currentPassword: 'hunter12', password: NEW })

    expect(outcome).toEqual({ message: formError('auth_reloadPage') })
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('asks the new page for a confirmation when it has none', async () => {
    const { outcome, updateUser } = await change({ password: NEW })

    expect(outcome).toEqual({ field: 'code', message: formError('auth_reauthRequired') })
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('points a session Supabase wants re-authenticated at the emailed reset link', async () => {
    const refusal = { code: 'reauthentication_needed', message: 'old session' }
    const { outcome } = await change({ password: NEW }, refusal, true)

    expect(outcome).toEqual({ message: formError('auth_reauthNeeded') })
  })
})
