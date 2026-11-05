import { dropGuidebookRegion, reachable, seedRegion, sql, type SeedUser } from '$lib/db/testDb'
import { afterAll, beforeAll } from 'vitest'
import { zeroClient } from './testHarness'

/** A maintainer's region and a mutate client for one suite, dropped after it with everything the suite
 *  built in it. Read the fields inside tests: `beforeAll` fills them. */
export function useMaintainerRegion(name: string) {
  const fixture = {
    /** An area in the suite's region, owned by its maintainer. */
    async area(name: string, type: 'area' | 'sector' | null, parentFk: null | number = null) {
      const [row] = await sql<{ id: number }[]>`
        insert into public.areas (name, type, parent_fk, region_fk, created_by)
        values (${name}, ${type}, ${parentFk}, ${fixture.regionId}, ${fixture.user.userId}) returning id`
      return row.id
    },
  } as { area(name: string, type: 'area' | 'sector' | null, parentFk?: null | number): Promise<number> } & {
    client: ReturnType<typeof zeroClient>
    regionId: number
    user: SeedUser
  }
  beforeAll(async () => {
    if (!reachable) return
    const seeded = await seedRegion(name, 'region_maintainer')
    Object.assign(fixture, { client: zeroClient(seeded.user.authId), regionId: seeded.regionId, user: seeded.user })
  })
  afterAll(async () => {
    if (!reachable) return
    await fixture.client.cleanup()
    await dropGuidebookRegion(fixture.regionId)
  })
  return fixture
}
