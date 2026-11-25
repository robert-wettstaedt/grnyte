// @vitest-environment node
import { createThrowawayUser, dropThrowawayUser, reachable, type SeedUser } from '$lib/db/testDb'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { deleteRoute } from './testCommands'
import { asRequest } from './testHarness'

let caller: SeedUser

beforeAll(async () => {
  if (reachable) caller = await createThrowawayUser('authed_revoked')
})

afterAll(async () => {
  if (reachable) await dropThrowawayUser(caller)
})

describe.skipIf(!reachable)('a revoked session', () => {
  it('is refused by an authed write and signed out', async () => {
    const signOut = vi.fn(async () => ({}))
    const call = asRequest(caller.authId, () => deleteRoute({ id: -1 }), { auth: { signOut } }, { session: false })

    await expect(call).rejects.toMatchObject({ status: 401 })
    expect(signOut).toHaveBeenCalled()
  })
})
