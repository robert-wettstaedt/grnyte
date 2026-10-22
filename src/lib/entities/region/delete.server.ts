import { pinnedTx } from '$lib/db/pinned.server'
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
  userSettings,
} from '$lib/db/schema'
import { regionDeletedEmailContent } from '$lib/email/membership'
import { sendEmailOutcome } from '$lib/email/send.server'
import { contactLocale } from '$lib/i18n/message'
import { and, count, eq, inArray, ne } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { authUsers } from 'drizzle-orm/supabase'
import { deleteFileRows, removeFileStorage, type FileStorageTarget } from '../file/cleanup.server'
import { verifyPassword } from '../user/password.server'
import { lockRegionMembers, requireOwner } from './guards.server'

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

/** `auth.users` is named `users` too: without the alias the join fails at runtime with 42P09. */
const authUser = alias(authUsers, 'auth_user')

export type DeleteRegionResult = { kind: 'deleted' } | { kind: 'wrongName' } | { kind: 'wrongPassword' }

type Owner = { email: string; id: number }

const RATE_LIMIT_PAUSE_MS = 1000

/** The preview's count and the mail's recipients: they must agree. */
const otherActiveMembers = (regionFk: number, ownerFk: number) =>
  and(eq(regionMembers.regionFk, regionFk), eq(regionMembers.isActive, true), ne(regionMembers.userFk, ownerFk))

// Files and mail go after the commit: neither can roll back.
export async function deleteRegion(
  owner: Owner,
  { name, regionFk }: { name: string; regionFk: number },
  password: string,
  origin: string,
): Promise<DeleteRegionResult> {
  const region = await pinnedTx((tx) => requireOwner(tx, regionFk, owner.id))
  if (region.name.trim() !== name.trim()) return { kind: 'wrongName' }
  if (!(await verifyPassword(owner.email, password))) return { kind: 'wrongPassword' }

  const { recipients, targets } = await pinnedTx(async (tx) => {
    await lockRegionMembers(tx, regionFk)
    await requireOwner(tx, regionFk, owner.id)
    // Read before the rows go: afterwards nothing says who was in it.
    const recipients = await tx
      .select({ email: authUser.email, locale: userSettings.contactLocale })
      .from(regionMembers)
      .innerJoin(authUser, eq(authUser.id, regionMembers.authUserFk))
      .leftJoin(userSettings, eq(userSettings.userFk, regionMembers.userFk))
      .where(otherActiveMembers(regionFk, owner.id))
    return { recipients, targets: await deleteRegionRows(tx, regionFk) }
  })

  await removeFileStorage(targets)
  // One at a time: Resend rate-limits a burst, and a rate-limited send gets one more try.
  for (const { email, locale } of recipients) {
    if (email == null) continue
    const mail = {
      ...regionDeletedEmailContent({ locale: contactLocale(locale), regionName: region.name, url: origin }),
      idempotencyKey: `region-deleted-${regionFk}-${email}`,
      template: 'region-deleted',
      to: email,
    }
    if ((await sendEmailOutcome(mail, { quietRetry: true })) === 'retry') {
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_PAUSE_MS))
      await sendEmailOutcome(mail)
    }
  }

  return { kind: 'deleted' }
}

export function previewRegionDeletion(regionFk: number, userFk: number): Promise<{ ascents: number; members: number }> {
  return pinnedTx(async (tx) => {
    await requireOwner(tx, regionFk, userFk)
    const [[{ members }], [{ ascents: logged }]] = await Promise.all([
      tx.select({ members: count() }).from(regionMembers).where(otherActiveMembers(regionFk, userFk)),
      tx
        .select({ ascents: count() })
        .from(ascents)
        .where(and(eq(ascents.regionFk, regionFk), ne(ascents.createdBy, userFk))),
    ])
    return { ascents: logged, members }
  })
}
