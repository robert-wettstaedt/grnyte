import { resolve } from '$app/paths'
import { regionMembers } from '$lib/db/schema'
import type * as z from '$lib/forms/zod'
import type { Context } from '$lib/remote/authed.server'
import { eq } from 'drizzle-orm'
import { createUpdateEvent, deleteEvent, insertEvent } from '../event/event.server'
import { notify, notifyOutOfBand, retractOutOfBand } from '../notification/notification.server'
import { assignableRoleSchema, type memberRoleSchema, type RemovedMemberSnapshot } from './dto'
import { assertCanEdit } from './edit.server'
import {
  assertMemberChangeAllowed,
  assertNotOwner,
  findActiveMember,
  lockRegionMembers,
  resolveRestore,
} from './guards.server'
import { assertSeatFree } from './invite.server'

type Caller = Pick<Context, 'afterCommit' | 'db' | 'user' | 'userRegions'>

/**
 * Leave a region. Not admin-gated, any member may leave, which is what the own-row DELETE
 * policy on `region_members` exists for.
 */
export async function leaveRegionRow({ regionFk }: { regionFk: number }, { db, user }: Pick<Context, 'db' | 'user'>) {
  const member = await findActiveMember(db, regionFk, user.id)

  await assertNotOwner(db, regionFk, user.id)

  // Logged BEFORE the membership goes: inserting into `events` is gated on
  // authorize_in_region, which reads region_members and so is already false inside this
  // transaction once your own row is deleted. Both statements share the transaction, so a failed
  // delete still rolls the event back.
  //
  // `leave`, not `remove`: being removed and choosing to leave are two different things, and
  // sharing one spelling made the feed render a member who left as "Mara removed Mara".
  await insertEvent(db, {
    actorFk: user.id,
    object: { id: user.id, type: 'user' },
    regionFk,
    verb: 'leave',
  })

  await db.delete(regionMembers).where(eq(regionMembers.id, member.id))

  return { redirectTo: resolve('/(app)/settings') }
}

/** Remove a member from a region. Returns the snapshot {@link restoreRegionMemberRow} undoes it with. */
export async function removeRegionMemberRow({ regionFk, userFk }: { regionFk: number; userFk: number }, ctx: Caller) {
  const { afterCommit, db, user } = ctx
  assertCanEdit(ctx, regionFk)

  const member = await findActiveMember(db, regionFk, userFk)

  await assertMemberChangeAllowed(db, user.id, { nextRole: null, regionFk, userFk })

  await db.delete(regionMembers).where(eq(regionMembers.id, member.id))

  await insertEvent(db, {
    actorFk: user.id,
    object: { id: userFk, type: 'user' },
    regionFk,
    verb: 'remove',
  })

  // Queued, not sent: Undo deletes the row inside `DIRECTED_DEBOUNCE_MS`, which is why that
  // snackbar has a bounded duration. `notifyOutOfBand`, since the recipient is no longer a member.
  afterCommit(() => notifyOutOfBand({ actorFk: user.id, regionFk, sourceType: 'membership_removed', userFk }))

  return {
    data: {
      regionFk,
      // Throws only for a membership hand-set to `app_admin`, which nothing here can produce.
      role: assignableRoleSchema.parse(member.role),
      userFk,
    } satisfies RemovedMemberSnapshot,
  }
}

/** Undo a {@link removeRegionMemberRow}, and erase the event it logged. */
export async function restoreRegionMemberRow(snapshot: z.output<typeof memberRoleSchema>, ctx: Caller) {
  const { afterCommit, db } = ctx
  assertCanEdit(ctx, snapshot.regionFk)

  // An undo, not an insert. See resolveRestore for what that costs to enforce. Locked like an accept:
  // the freed seat may have gone to an invitation since, and a join for the same person may race.
  await lockRegionMembers(db, snapshot.regionFk)
  const { alreadyMember, authUserFk, invitedByFk } = await resolveRestore(db, snapshot.regionFk, snapshot.userFk)

  if (!alreadyMember) {
    await assertSeatFree(db, snapshot.regionFk)
    await db.insert(regionMembers).values({
      authUserFk,
      invitedByFk,
      isActive: true,
      regionFk: snapshot.regionFk,
      role: snapshot.role,
      userFk: snapshot.userFk,
    })
  }

  // Scoped to this region but not to the caller: any admin may undo any admin's removal.
  // `metadata: null` is what keeps it off a revoked invitation, which writes the same verb.
  await deleteEvent(db, {
    metadata: null,
    object: { id: snapshot.userFk, type: 'user' },
    regionFk: snapshot.regionFk,
    verb: 'remove',
  })

  // And take back the notice the removal queued: the reason the queue is a row, not a send.
  //
  // Deferred like the write it undoes: `retractOutOfBand` runs on the privileged handle, so it
  // takes a second connection while this handler holds the RLS transaction's own and commits
  // independently. Inline, a restore that failed after this point would leave the member removed
  // with the notice already erased.
  afterCommit(() =>
    retractOutOfBand({
      regionFk: snapshot.regionFk,
      sourceType: 'membership_removed',
      userFk: snapshot.userFk,
    }),
  )
}

export async function updateRegionMemberRoleRow(
  { regionFk, role, userFk }: z.output<typeof memberRoleSchema>,
  ctx: Caller,
) {
  const { afterCommit, db, user } = ctx
  assertCanEdit(ctx, regionFk)

  const member = await findActiveMember(db, regionFk, userFk)

  await assertMemberChangeAllowed(db, user.id, { nextRole: role, regionFk, userFk })

  await db.update(regionMembers).set({ role }).where(eq(regionMembers.id, member.id))

  // The one case where subject and actor genuinely differ: somebody acts on somebody else.
  await createUpdateEvent(db, {
    actorFk: user.id,
    newEntity: { role },
    object: { id: userFk, type: 'user' },
    oldEntity: { role: member.role },
    regionFk,
  })

  // `metadata` carries the role because a person holds a different one per region.
  // Deferred so the recipient check reads the committed membership, not this transaction's view.
  afterCommit(() =>
    notify({
      actorFk: user.id,
      metadata: role,
      object: { id: userFk, type: 'user' },
      regionFk,
      sourceType: 'role_changed',
      userFks: [userFk],
    }),
  )
}
