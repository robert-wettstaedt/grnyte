import { pinnedTx } from '$lib/db/pinned.server'
import * as schema from '$lib/db/schema'
import {
  activities,
  areas,
  ascents,
  blocks,
  changes,
  clientErrorLogs,
  events,
  favorites,
  feedback,
  files,
  firstAscensionists,
  notifications,
  pushSubscriptions,
  reactions,
  regionInvitations,
  regionMembers,
  regions,
  routes,
  userRoles,
  users,
  userSettings,
} from '$lib/db/schema'
import { supabaseAdmin } from '$lib/db/supabaseAdmin.server'
import { logServerFailure } from '$lib/logging/failure.server'
import { stringifyError } from '$lib/logging/stringify'
import { and, eq, inArray, or } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { deleteFileRows, removeFileStorage, type FileStorageTarget } from '../file/cleanup.server'
import { deleteRegionRows } from '../region/delete.server'
import { lockRegionMembers } from '../region/guards.server'
import { recalcUserGradeAndRating } from '../route/user-grade.server'
import { verifyPassword } from './password.server'

/** The signed-in person, as the session carries them. */
export type Account = { authUserFk: string; email: string; id: number }

export type DeleteAccountResult =
  { kind: 'blocked'; regions: string[] } | { kind: 'deleted' } | { kind: 'wrongPassword' }

type Db = PostgresJsDatabase<typeof schema>

/**
 * Delete the caller's own account. Every refusal is decided before the first write; the rows go in
 * one privileged transaction (it crosses regions and other people's content), and only then the
 * GoTrue record and the stored files, neither of which can be rolled back.
 */
export async function deleteAccount(account: Account, password: string): Promise<DeleteAccountResult> {
  if (!(await verifyPassword(account.email, password))) {
    return { kind: 'wrongPassword' }
  }

  const outcome = await pinnedTx(async (tx) => {
    const { blocking, sole } = await classifyRegions(tx, account.id)
    if (blocking.length > 0) return { kind: 'blocked', regions: blocking } as const
    return { kind: 'deleted', targets: await deleteAccountData(tx, account, sole) } as const
  })

  if (outcome.kind === 'blocked') {
    return outcome
  }

  // A sign-in record left behind reaches nothing without its profile, and the cleanup sweep retries it.
  try {
    const { error } = await supabaseAdmin().auth.admin.deleteUser(account.authUserFk)
    if (error != null) throw error
  } catch (error) {
    await logServerFailure('account', `auth delete failed: ${stringifyError(error)}`)
  }
  await removeFileStorage(outcome.targets)

  return { kind: 'deleted' }
}

/** Everything the spec says goes, goes; everything that stays loses its link. Returns storage targets.
 *  Shared with the cleanup sweep and the test teardown, so the delete order exists once. */
export async function deleteAccountData(
  tx: Db,
  { authUserFk, id }: Pick<Account, 'authUserFk' | 'id'>,
  soleRegions: number[],
): Promise<FileStorageTarget[]> {
  const targets: FileStorageTarget[] = []
  for (const regionFk of soleRegions) {
    targets.push(...(await deleteRegionRows(tx, regionFk)))
  }

  // Their climbing log and its media. The averages it voted in are recomputed below.
  const logged = await tx.query.ascents.findMany({
    columns: { id: true, routeFk: true },
    where: eq(ascents.createdBy, id),
  })
  if (logged.length > 0) {
    const media = await tx.query.files.findMany({
      columns: { bunnyStreamFk: true, id: true, path: true },
      where: inArray(
        files.ascentFk,
        logged.map((ascent) => ascent.id),
      ),
    })
    targets.push(...(await deleteFileRows(tx, media)))
  }

  // Feed events about them cascade their reactions, changes and inbox rows.
  await tx.delete(events).where(or(eq(events.actorFk, id), eq(events.subjectFk, id)))
  await tx.delete(changes).where(eq(changes.subjectFk, id))
  await tx
    .delete(notifications)
    .where(
      or(
        eq(notifications.userFk, id),
        eq(notifications.actorFk, id),
        eq(notifications.subjectFk, id),
        eq(notifications.authUserFk, authUserFk),
      ),
    )
  await tx.delete(ascents).where(eq(ascents.createdBy, id))
  for (const routeFk of new Set(logged.map((ascent) => ascent.routeFk))) {
    await recalcUserGradeAndRating(tx, routeFk)
  }

  // What the region relies on stays, credited to nobody.
  await tx.update(reactions).set({ authUserFk: null, userFk: null }).where(eq(reactions.userFk, id))
  await tx.update(regions).set({ createdBy: null }).where(eq(regions.createdBy, id))
  await tx.update(areas).set({ createdBy: null }).where(eq(areas.createdBy, id))
  await tx.update(blocks).set({ createdBy: null }).where(eq(blocks.createdBy, id))
  await tx.update(routes).set({ createdBy: null }).where(eq(routes.createdBy, id))
  await tx.update(files).set({ createdBy: null }).where(eq(files.createdBy, id))
  await tx.update(feedback).set({ createdBy: null }).where(eq(feedback.createdBy, id))
  await tx.update(activities).set({ userFk: null }).where(eq(activities.userFk, id))
  await tx.update(firstAscensionists).set({ userFk: null }).where(eq(firstAscensionists.userFk, id))
  await tx.update(regionMembers).set({ invitedByFk: null }).where(eq(regionMembers.invitedByFk, id))
  await tx.update(regionInvitations).set({ acceptedByFk: null }).where(eq(regionInvitations.acceptedByFk, id))
  await tx.delete(regionInvitations).where(eq(regionInvitations.invitedByFk, id))

  // What was theirs alone.
  await tx.delete(favorites).where(eq(favorites.userFk, id))
  await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.userFk, id))
  await tx.delete(userRoles).where(eq(userRoles.authUserFk, authUserFk))
  await tx.delete(regionMembers).where(eq(regionMembers.userFk, id))
  await tx.delete(clientErrorLogs).where(eq(clientErrorLogs.createdBy, id))
  await tx.update(users).set({ firstAscensionistFk: null, userSettingsFk: null }).where(eq(users.id, id))
  await tx.delete(userSettings).where(eq(userSettings.userFk, id))
  await tx.delete(users).where(eq(users.id, id))

  return targets
}

/**
 * Which of the person's regions block the deletion (they are its only active admin and others still
 * use it) and which nobody else uses. Takes each region's member lock, held until the transaction ends.
 */
async function classifyRegions(tx: Db, userFk: number): Promise<{ blocking: string[]; sole: number[] }> {
  const mine = await tx.query.regionMembers.findMany({
    columns: { regionFk: true },
    where: and(eq(regionMembers.userFk, userFk), eq(regionMembers.isActive, true)),
    with: { region: { columns: { name: true } } },
  })

  const blocking: string[] = []
  const sole: number[] = []
  for (const { region, regionFk } of mine) {
    await lockRegionMembers(tx, regionFk)
    const members = await tx.query.regionMembers.findMany({
      columns: { role: true, userFk: true },
      where: and(eq(regionMembers.regionFk, regionFk), eq(regionMembers.isActive, true)),
    })
    const others = members.filter((member) => member.userFk !== userFk)
    const amAdmin = members.some((member) => member.userFk === userFk && member.role === 'region_admin')

    if (others.length === 0) sole.push(regionFk)
    else if (amAdmin && !others.some((member) => member.role === 'region_admin')) blocking.push(region?.name ?? '')
  }

  return { blocking, sole }
}
