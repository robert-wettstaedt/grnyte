// @vitest-environment node
/**
 * Founding a region, against a real database like the rest of this module's server tests.
 *
 * Two things are worth a test here and the rest is a plain insert: that the founder comes out of
 * it as `region_admin` (without that row the region is invisible to everyone including its
 * creator, since the `regions` select policy is membership-scoped), and that the cap holds.
 *
 * Skipped when DATABASE_URL is unreachable so `npm test` still passes without a local database.
 */
import { createThrowawayUser, dropThrowawayUser, reachable, sql, type SeedUser } from '$lib/db/testDb'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createRegionForUser, listOwnedRegions } from './create.server'
import { MAX_OWNED_REGIONS } from './dto'

const NAME_PREFIX = '__create_region_test__'

let founder = {} as SeedUser
const created: number[] = []

const found = (suffix: string) =>
  createRegionForUser({ authUserId: founder.authId, name: `${NAME_PREFIX}${suffix}`, userId: founder.userId }).then(
    (region) => {
      created.push(region.id)
      return region
    },
  )

describe.skipIf(!reachable)('createRegionForUser', () => {
  beforeAll(async () => {
    // An account of this suite's own, not one of the shared seed logins. This is the only test
    // that counts regions per owner, and `tenancy.test.ts` (plus the guard and invite suites)
    // found regions as those seed users while vitest runs the files in parallel: the count read
    // at the top of the cap test then changed underneath it and the cap arrived mid-loop.
    // Nothing about founding needs a seeded identity, since it is open to anybody signed in.
    founder = await createThrowawayUser('create_region')
  })

  afterAll(async () => {
    await dropThrowawayUser(founder)
  })

  afterEach(async () => {
    if (created.length > 0) {
      await sql`delete from region_members where region_fk = any(${created})`
      await sql`delete from regions where id = any(${created})`
      created.length = 0
    }
  })

  it('puts the founder in the region as its admin', async () => {
    const region = await found('admin')

    const [member] = await sql`
      select role, is_active as "isActive", invited_by as "invitedBy", user_fk as "userFk"
      from region_members where region_fk = ${region.id}`

    expect(member).toMatchObject({ invitedBy: null, isActive: true, role: 'region_admin', userFk: founder.userId })
  })

  it('refuses past the cap, and writes nothing when it does', async () => {
    // Relative to whatever this account already owns in the seeded database, so the test does not
    // depend on starting from zero.
    const already = (await listOwnedRegions(founder.userId)).length

    for (let index = already; index < MAX_OWNED_REGIONS; index += 1) {
      await found(String(index))
    }

    await expect(found('over')).rejects.toMatchObject({ status: 409 })

    expect((await listOwnedRegions(founder.userId)).length).toBe(Math.max(already, MAX_OWNED_REGIONS))
  })
})
