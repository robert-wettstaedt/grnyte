import { invalidateCache } from '$lib/cache/cache.server'
import { config } from '$lib/config'
import * as schema from '$lib/db/schema'
import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import exif from 'exifr'

export const createOrUpdateGeolocation = async (
  db: PostgresJsDatabase<typeof schema>,
  block: schema.Block,
  geolocation: schema.InsertGeolocation,
  operation: 'create' | 'update' | 'all' = 'all',
) => {
  // If the block does not have a geolocation, insert a new geolocation record
  if (block.geolocationFk == null && (operation === 'create' || operation === 'all')) {
    const [createdGeolocation] = await db
      .insert(schema.geolocations)
      .values({ ...geolocation, blockFk: block.id, regionFk: block.regionFk })
      .returning()
    // Update the block with the new geolocation foreign key
    await db.update(schema.blocks).set({ geolocationFk: createdGeolocation.id }).where(eq(schema.blocks.id, block.id))
  }

  if (block.geolocationFk != null && (operation === 'update' || operation === 'all')) {
    // If the block already has a geolocation, update the existing geolocation record
    await db.update(schema.geolocations).set(geolocation).where(eq(schema.geolocations.id, block.geolocationFk!))
  }

  await invalidateCache(config.cache.keys.layoutBlocks)
}

export const createGeolocationFromFiles = async (
  db: PostgresJsDatabase<typeof schema>,
  block: schema.Block,
  buffers: ArrayBuffer[],
  operation: 'create' | 'update' | 'all' = 'all',
) => {
  const allGps = await Promise.all(buffers.map((buffer) => exif.gps(buffer)))
  const nonNullGps = allGps.filter((d) => d != null && !Number.isNaN(d.latitude) && !Number.isNaN(d.longitude))

  const sumGps = nonNullGps.reduce(
    (sum, gps) => {
      return {
        ...sum,
        latitude: (sum?.latitude ?? 0) + gps.latitude,
        longitude: (sum?.longitude ?? 0) + gps.longitude,
      }
    },
    undefined as Awaited<ReturnType<typeof exif.gps>> | undefined,
  )

  if (block == null || sumGps == null) {
    return
  }

  const geolocation: schema.InsertGeolocation = {
    lat: sumGps.latitude / nonNullGps.length,
    long: sumGps.longitude / nonNullGps.length,
  }

  await createOrUpdateGeolocation(db, block, geolocation, operation)
}
