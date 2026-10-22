import * as schema from '$lib/db/schema'
import {
  activities,
  areas,
  ascents,
  blocks,
  bunnyStreams,
  events,
  favorites,
  files,
  firstAscensionists,
  geolocations,
  notifications,
  regionInvitations,
  regionMembers,
  regions,
  routeExternalResource27crags,
  routeExternalResource8a,
  routeExternalResources,
  routeExternalResourceTheCrag,
  routes,
  routesToFirstAscensionists,
  routesToTags,
  topoRoutes,
  topos,
  users,
} from '$lib/db/schema'
import { eq, inArray } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { deleteFileRows, type FileStorageTarget } from '../file/cleanup.server'

type Db = PostgresJsDatabase<typeof schema>

/**
 * Delete a region and every row that belongs to it, leaves first. Returns the storage targets of
 * its files, for {@link removeFileStorage} once the caller's transaction has committed.
 * Every foreign key here is NO ACTION, so the order is the delete; events cascade their
 * reactions, changes and notifications; membership notices have no event and go by region.
 */
export async function deleteRegionRows(tx: Db, regionFk: number): Promise<FileStorageTarget[]> {
  await tx.delete(events).where(eq(events.regionFk, regionFk))
  await tx.delete(notifications).where(eq(notifications.regionFk, regionFk))
  await tx.delete(favorites).where(eq(favorites.regionFk, regionFk))
  await tx.delete(activities).where(eq(activities.regionFk, regionFk))

  await tx.delete(topoRoutes).where(eq(topoRoutes.regionFk, regionFk))
  await tx.delete(topos).where(eq(topos.regionFk, regionFk))
  await tx.delete(routesToTags).where(eq(routesToTags.regionFk, regionFk))
  await tx.delete(routesToFirstAscensionists).where(eq(routesToFirstAscensionists.regionFk, regionFk))

  // A profile anywhere may point at one of this region's first ascensionists.
  const fas = tx
    .select({ id: firstAscensionists.id })
    .from(firstAscensionists)
    .where(eq(firstAscensionists.regionFk, regionFk))
  await tx.update(users).set({ firstAscensionistFk: null }).where(inArray(users.firstAscensionistFk, fas))
  await tx.delete(firstAscensionists).where(eq(firstAscensionists.regionFk, regionFk))

  const fileRows = await tx.query.files.findMany({
    columns: { bunnyStreamFk: true, id: true, path: true },
    where: eq(files.regionFk, regionFk),
  })
  const targets = await deleteFileRows(tx, fileRows)
  // A stream whose file was already gone is still the region's.
  await tx.delete(bunnyStreams).where(eq(bunnyStreams.regionFk, regionFk))

  await tx.delete(ascents).where(eq(ascents.regionFk, regionFk))

  // Routes and their external resources point at each other.
  await tx.update(routes).set({ externalResourcesFk: null }).where(eq(routes.regionFk, regionFk))
  await tx
    .update(routeExternalResources)
    .set({ externalResource8aFk: null, externalResource27cragsFk: null, externalResourceTheCragFk: null })
    .where(eq(routeExternalResources.regionFk, regionFk))
  await tx.delete(routeExternalResource8a).where(eq(routeExternalResource8a.regionFk, regionFk))
  await tx.delete(routeExternalResource27crags).where(eq(routeExternalResource27crags.regionFk, regionFk))
  await tx.delete(routeExternalResourceTheCrag).where(eq(routeExternalResourceTheCrag.regionFk, regionFk))
  await tx.delete(routeExternalResources).where(eq(routeExternalResources.regionFk, regionFk))
  await tx.delete(routes).where(eq(routes.regionFk, regionFk))

  // Blocks and geolocations point at each other, and areas nest.
  await tx.update(blocks).set({ geolocationFk: null }).where(eq(blocks.regionFk, regionFk))
  await tx.delete(geolocations).where(eq(geolocations.regionFk, regionFk))
  await tx.delete(blocks).where(eq(blocks.regionFk, regionFk))
  await tx.update(areas).set({ parentFk: null }).where(eq(areas.regionFk, regionFk))
  await tx.delete(areas).where(eq(areas.regionFk, regionFk))

  await tx.delete(regionInvitations).where(eq(regionInvitations.regionFk, regionFk))
  await tx.delete(regionMembers).where(eq(regionMembers.regionFk, regionFk))
  await tx.delete(regions).where(eq(regions.id, regionFk))

  return targets
}
