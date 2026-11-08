// @vitest-environment node
import { reachable, seedUsers, type SeedUser } from '$lib/db/testDb'
import { formError } from '$lib/forms/schemas'
import { asRequest } from '$lib/remote/testHarness'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { deleteAccountCommand, updateEmailCommand, updatePasswordCommand } from './account.remote'

const deletion = vi.hoisted(() => ({ deleteAccount: vi.fn() }))
vi.mock('$lib/entities/user/delete.server', () => deletion)
// A real check signs in against GoTrue, which CI does not run.
vi.mock('$lib/entities/user/password.server', () => ({ verifyPassword: async () => true }))

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
  const remove = (password: string) =>
    asRequest(user.authId, () => deleteAccountCommand({ password }), { auth: { signOut } }).then(
      (done) => done,
      (cause: { body?: unknown }) => cause.body,
    )

  it('refuses a wrong password on the field', async () => {
    deletion.deleteAccount.mockResolvedValue({ kind: 'wrongPassword' })

    expect(await remove('nope')).toEqual({ field: 'password', message: formError('settings_passwordIncorrect') })
  })

  it('refuses while a region still needs the person, naming it', async () => {
    deletion.deleteAccount.mockResolvedValue({ kind: 'blocked', regions: ['Elbsandstein', 'Harz'] })

    expect(await remove('pw')).toEqual({
      message: formError('settings_deleteAccountBlocked', { regions: 'Elbsandstein, Harz' }),
    })
  })

  it('deletes the signed-in account, by the address the verified token carries', async () => {
    deletion.deleteAccount.mockResolvedValue({ kind: 'deleted' })

    expect(await remove('pw')).toBeUndefined()
    expect(deletion.deleteAccount).toHaveBeenLastCalledWith(
      { authUserFk: user.authId, email: 'user@grnyte.rocks', id: user.userId },
      'pw',
    )
    // This browser leaves signed out; GoTrue already revoked every other session with the account.
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
  })
})

describe.skipIf(!reachable)('updatePasswordCommand', () => {
  it('points a session Supabase wants re-authenticated at the emailed reset link', async () => {
    const updateUser = vi.fn(async () => ({ error: { code: 'reauthentication_needed', message: 'old session' } }))
    const values = { confirmPassword: 'a-new-Passw0rd!', currentPassword: 'hunter12', password: 'a-new-Passw0rd!' }
    const outcome = await asRequest(user.authId, () => updatePasswordCommand(values), { auth: { updateUser } }).catch(
      (cause: { body?: unknown }) => cause.body,
    )

    expect(outcome).toEqual({ message: formError('auth_reauthNeeded') })
  })
})
