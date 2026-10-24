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
  moderationDecisions,
  moderationDecisionSubjects,
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
import { toDisplayName, type DisplayName } from '$lib/entities/displayName'
import { logServerFailure } from '$lib/logging/failure.server'
import { stringifyError } from '$lib/logging/stringify'
import { getLocale } from '$lib/paraglide/runtime'
import { and, eq, inArray, or, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { deleteFileRows, removeFileStorage, type FileStorageTarget } from '../file/cleanup.server'
import { NOTIFICATION_CONFLICT_TARGET } from '../notification/notification.server'
import { deleteRegionRows } from '../region/delete.server'
import { lockRegionMembers } from '../region/guards.server'
import { recalcUserGradeAndRating } from '../route/user-grade.server'
import { verifyPassword } from './password.server'

export type Account = { authUserFk: string; email: string; id: number }

export type DeleteAccountResult =
  { kind: 'blocked'; regions: string[] } | { kind: 'deleted' } | { kind: 'wrongPassword' }

export type RegionRef = { id: number; name: DisplayName }

type Db = PostgresJsDatabase<typeof schema>

/** What a deleted comment's words become: `reactions_body_fits_type` refuses an empty comment. */
export const ERASED_COMMENT = '…'

// Refusals come before the first write; rows go in one privileged tx (it crosses regions), then the
// GoTrue record and stored files, neither of which can roll back.
export async function deleteAccount(account: Account, password: string): Promise<DeleteAccountResult> {
  if (!(await verifyPassword(account.email, password))) {
    return { kind: 'wrongPassword' }
  }

  const outcome = await pinnedTx(async (tx) => {
    const { blocks: blocking, deletes } = await classifyRegions(tx, account.id)
    if (blocking.length > 0) return { kind: 'blocked', regions: blocking.map((region) => region.name) } as const
    const sole = deletes.map((region) => region.id)
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

  // Feed events about them cascade their reactions, changes and inbox rows; what they did stays.
  await tx.delete(events).where(eq(events.subjectFk, id))
  await tx.update(events).set({ actorFk: null }).where(eq(events.actorFk, id))
  await tx.delete(changes).where(eq(changes.subjectFk, id))
  await tx
    .delete(notifications)
    .where(or(eq(notifications.userFk, id), eq(notifications.subjectFk, id), eq(notifications.authUserFk, authUserFk)))
  // `notifications_source_idx` is NULLS NOT DISTINCT, so a row whose twin already lost its actor (an
  // earlier deletion) would collide once this one does; the twin says the same.
  const key = (alias: string) =>
    sql.join(
      NOTIFICATION_CONFLICT_TARGET.filter((column) => column !== notifications.actorFk).map(
        (column) => sql`${sql.identifier(alias)}.${sql.identifier(column.name)}`,
      ),
      sql`, `,
    )
  await tx.execute(sql`
    delete from ${notifications} mine
    where mine.actor_fk = ${id} and exists (
      select 1 from ${notifications} twin
      where twin.actor_fk is null and (${key('twin')}) is not distinct from (${key('mine')}))`)
  await tx.update(notifications).set({ actorFk: null }).where(eq(notifications.actorFk, id))
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
  await tx.update(moderationDecisions).set({ actorFk: null }).where(eq(moderationDecisions.actorFk, id))
  await tx.update(moderationDecisions).set({ reversedByFk: null }).where(eq(moderationDecisions.reversedByFk, id))
  // A comment of theirs an admin removed: nobody is left to appeal it, so its words go now.
  await tx
    .update(moderationDecisions)
    .set({ removedBody: null })
    .where(
      inArray(
        moderationDecisions.id,
        tx
          .select({ id: moderationDecisionSubjects.decisionFk })
          .from(moderationDecisionSubjects)
          .where(eq(moderationDecisionSubjects.userFk, id)),
      ),
    )
  // The subject's excerpt of such a comment is its words too.
  await tx
    .update(moderationDecisionSubjects)
    .set({
      items: sql`(
        select coalesce(jsonb_agg(case when item->>'kind' = 'comment'
          then jsonb_set(item, '{name}', to_jsonb(${ERASED_COMMENT}::text)) else item end), '[]'::jsonb)
        from jsonb_array_elements(${moderationDecisionSubjects.items}) as item)`,
      userFk: null,
    })
    .where(eq(moderationDecisionSubjects.userFk, id))
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

/** What deleting the account would do to each of the person's regions, for the screen
 *  before the password is typed. The deletion decides again in its own transaction. */
export function previewAccountDeletion(userFk: number): Promise<{ blocks: RegionRef[]; deletes: RegionRef[] }> {
  return pinnedTx((tx) => classifyRegions(tx, userFk))
}

// Locks in id order, so two deletions sharing regions cannot deadlock.
async function classifyRegions(tx: Db, userFk: number) {
  const mine = await tx.query.regionMembers.findMany({
    columns: { regionFk: true },
    orderBy: regionMembers.regionFk,
    where: and(eq(regionMembers.userFk, userFk), eq(regionMembers.isActive, true)),
    with: { region: { columns: { name: true } } },
  })

  const blocking: RegionRef[] = []
  const deletes: RegionRef[] = []
  for (const { region, regionFk } of mine) {
    await lockRegionMembers(tx, regionFk)
    // The owner too after the lock: a handover to this person may have committed while it waited.
    const owner = await tx.query.regions.findFirst({ columns: { createdBy: true }, where: eq(regions.id, regionFk) })
    const members = await tx.query.regionMembers.findMany({
      columns: { userFk: true },
      where: and(eq(regionMembers.regionFk, regionFk), eq(regionMembers.isActive, true)),
    })
    const ref = { id: regionFk, name: toDisplayName(region?.name ?? '', getLocale()) }
    // Nobody else active: the region goes with the account. Shared: its owner must hand it over.
    if (!members.some((member) => member.userFk !== userFk)) deletes.push(ref)
    else if (owner?.createdBy === userFk) blocking.push(ref)
  }

  return { blocks: blocking, deletes }
}
