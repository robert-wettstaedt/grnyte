import * as schema from '$lib/db/schema'
import { blocks, geolocations } from '$lib/db/schema'
import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

type Db = PostgresJsDatabase<typeof schema>

/** A block's pin is a geolocation row it points at, which points back. Never `areaFk`: that marks a
 *  parking, which `deleteParking` removes under a different permission. */
export async function attachPin(
  db: Db,
  block: { id: number; regionFk: number },
  at: { estimated: boolean; lat: number; long: number },
) {
  const [pin] = await db
    .insert(geolocations)
    .values({ blockFk: block.id, estimated: at.estimated, lat: at.lat, long: at.long, regionFk: block.regionFk })
    .returning()
  await db.update(blocks).set({ geolocationFk: pin.id }).where(eq(blocks.id, block.id))
  return pin
}

/** Move a pin in place. An omitted `estimated` keeps the stored flag (drizzle skips undefined): a map
 *  drag confirms nothing. */
export async function movePin(db: Db, pinId: number, at: { estimated?: boolean; lat: number; long: number }) {
  await db
    .update(geolocations)
    .set({ estimated: at.estimated, lat: at.lat, long: at.long })
    .where(eq(geolocations.id, pinId))
}

/** Drop a pin: the block's link first, so the row it points at can be deleted. */
export async function removePin(db: Db, block: { geolocationFk: number; id: number }) {
  await db.update(blocks).set({ geolocationFk: null }).where(eq(blocks.id, block.id))
  await db.delete(geolocations).where(eq(geolocations.id, block.geolocationFk))
}
