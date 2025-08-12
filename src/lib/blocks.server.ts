import { caches, getFromCacheWithDefault } from '$lib/cache/cache.server'
import type { NestedBlock } from '$lib/components/BlocksMap'
import * as schema from '$lib/db/schema'
import { buildNestedAreaQuery } from '$lib/db/utils'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

export const getLayoutBlocks = async <T extends NestedBlock>(
  db: PostgresJsDatabase<typeof schema>,
  regions: App.Locals['userRegions'],
): Promise<T[]> => {
  return getFromCacheWithDefault(
    caches.layoutBlocks,
    regions,
    async () => {
      const blocks = await db.query.blocks.findMany({
        where: (table, { isNotNull }) => isNotNull(table.geolocationFk),
        with: {
          area: buildNestedAreaQuery(),
          geolocation: true,
        },
      })

      return blocks as T[]
    },
    undefined,
    null,
  )
}
