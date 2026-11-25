import { createThrowawayUser, dropThrowawayUser, reachable, sql, type SeedUser } from '$lib/db/testDb'
import { zero } from '$lib/entities/event/testContext'
import { getUserPermissions } from '$lib/hooks/auth.server'
import { pushRefusal, zeroClient } from '$lib/remote/testHarness'
import { useMaintainerRegion } from '$lib/remote/testRegion'
import { queries } from '$lib/zero/queries'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const region = useMaintainerRegion('__favorite_mutators__')
let areaId: number
let outsider: SeedUser
let outside: ReturnType<typeof zeroClient>

beforeAll(async () => {
  if (!reachable) return
  areaId = await region.area('__favorite_area__', 'area')
  outsider = await createThrowawayUser('favorite_mutators')
  outside = zeroClient(outsider.authId)
})

afterAll(async () => {
  if (!reachable) return
  await outside.cleanup()
  await sql`delete from public.favorites where area_fk = ${areaId}`
  await dropThrowawayUser(outsider)
  // The region goes in `useMaintainerRegion`'s own afterAll, which runs after this one.
})

const set = (saved: boolean) => ({ entityId: areaId, entityType: 'area', saved, userId: region.user.userId })

/** Who the area counts as its savers, as the save button's count reads it. */
async function savers() {
  const ctx = { authUserId: region.user.authId, pageState: await getUserPermissions(region.user.authId) }
  const query = queries.listEntityFavorites.fn({ args: { entityId: areaId, entityType: 'area' }, ctx })
  return ((await zero.run(query as never)) as unknown as { userFk: number }[]).map((row) => row.userFk)
}

describe.skipIf(!reachable)('favorites.set', () => {
  it('saves, changes nothing when saved again, and unsaves', async () => {
    expect(await region.client.push('favorites.set', set(true))).toEqual({})
    expect(await savers()).toEqual([region.user.userId])

    expect(await region.client.push('favorites.set', set(true))).toEqual({})
    expect(await savers()).toEqual([region.user.userId])

    expect(await region.client.push('favorites.set', set(false))).toEqual({})
    expect(await savers()).toEqual([])
  })

  it('refuses a member of another region', async () => {
    const result = await outside.push('favorites.set', { ...set(true), userId: outsider.userId })

    expect(pushRefusal(result)).toEqual({ message: 'areas_notFound' })
    expect(await savers()).toEqual([])
  })
})
