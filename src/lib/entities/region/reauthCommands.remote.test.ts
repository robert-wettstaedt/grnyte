/** The region commands behind re-authentication: an old tab's password reloads, a new page without a confirmation is asked for one. */
import {
  createThrowawayUser,
  dropGuidebookRegion,
  dropThrowawayUser,
  reachable,
  seedRegion,
  sql,
  type SeedUser,
} from '$lib/db/testDb'
import { formError } from '$lib/forms/schemas'
import { asRequest } from '$lib/remote/testHarness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteRegionCommand, transferRegionOwnershipCommand } from './regions.remote'

const NAME = `__reauth_commands_${crypto.randomUUID().slice(0, 8)}`
let regionId = 0
let owner: SeedUser
let admin: SeedUser

beforeAll(async () => {
  if (!reachable) return
  ;({ regionId, user: owner } = await seedRegion(NAME, 'region_admin'))
  admin = await createThrowawayUser('reauth_commands_admin')
  await sql`
    insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active)
    values (${regionId}, ${admin.userId}, ${admin.authId}, 'region_admin', true)`
})

afterAll(async () => {
  if (!reachable) return
  await dropGuidebookRegion(regionId)
  await dropThrowawayUser(admin)
})

const answer = (run: () => Promise<unknown>) =>
  asRequest(owner.authId, run).then(
    () => 'done',
    (cause: { body?: unknown }) => cause.body,
  )
const state = async () =>
  (await sql<{ created_by: number }[]>`select created_by from public.regions where id = ${regionId}`)[0]?.created_by

// Each command with the payload its new page builds; an old tab adds `password`.
const commands = [
  {
    name: 'deleteRegionCommand',
    run: (extra: { password?: string }) => deleteRegionCommand({ name: NAME, regionFk: regionId, ...extra }),
  },
  {
    name: 'transferRegionOwnershipCommand',
    run: (extra: { password?: string }) =>
      transferRegionOwnershipCommand({ regionFk: regionId, userFk: admin.userId, ...extra }),
  },
]

describe.skipIf(!reachable).each(commands)('$name', ({ run }) => {
  it('answers an old tab’s password with "reload this page" and changes nothing', async () => {
    expect(await answer(() => run({ password: 'pw' }))).toEqual({ message: formError('auth_reloadPage') })
    expect(await state()).toBe(owner.userId)
  })

  it('asks the new page for a confirmation when it has none', async () => {
    expect(await answer(() => run({}))).toEqual({ field: 'code', message: formError('auth_reauthRequired') })
    expect(await state()).toBe(owner.userId)
  })
})
