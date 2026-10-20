// @vitest-environment node
import { reachable, seedUsers, type SeedUser } from '$lib/db/testDb'
import { formError } from '$lib/forms/schemas'
import { asRequest } from '$lib/remote/testHarness'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { updateEmailCommand } from './account.remote'

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
