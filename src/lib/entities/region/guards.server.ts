/**
 * The database-backed half of the region mutation guards.
 *
 * Split out of `regions.remote.ts` because a `.remote.ts` module pulls in SvelteKit's client
 * runtime and cannot be imported from a test. These are the rules that keep a region
 * administrable and its membership consensual, so they are the half worth testing.
 */
import * as schema from '$lib/db/schema'
import { events, regionMembers, users } from '$lib/db/schema'
import { formError } from '$lib/forms/schemas'
import { error } from '@sveltejs/kit'
import { and, eq, isNull } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { isLastAdmin } from './permissions'

type Db = PostgresJsDatabase<typeof schema>

/**
 * The event `removeRegionMember` logs, and the only record that a removal happened.
 *
 * `metadata is null` is load-bearing rather than tidiness: a revoked invitation writes the same
 * verb about the same subject, with the address in `metadata`, so without it an admin who revoked
 * an invitation could "restore" a member who was never removed.
 */
const removalEvent = (regionFk: number, userFk: number) =>
  and(eq(events.verb, 'remove'), eq(events.subjectFk, userFk), eq(events.regionFk, regionFk), isNull(events.metadata))

/** The user ids of a region's active admins, which is all {@link isLastAdmin} needs. */
export async function activeAdminUserFks(db: Db, regionFk: number): Promise<number[]> {
  const admins = await db.query.regionMembers.findMany({
    columns: { userFk: true },
    where: and(
      eq(regionMembers.regionFk, regionFk),
      eq(regionMembers.role, 'region_admin'),
      eq(regionMembers.isActive, true),
    ),
  })

  return admins.map((admin) => admin.userFk)
}

/**
 * Guards a role change or removal: {@link assertNotLastAdmin}, plus the rule that nobody may
 * change their own role - an accidental self-demotion locks you out of the screen you did it on.
 * `leaveRegion` is the one path that asks for the first half only, since leaving is by definition
 * something you do to yourself.
 *
 * `nextRole` is the role the member ends up with, or null when they are being removed.
 */
export async function assertMemberChangeAllowed(
  db: Db,
  actorUserFk: number,
  { nextRole, regionFk, userFk }: { nextRole: null | string; regionFk: number; userFk: number },
) {
  if (userFk === actorUserFk) {
    error(403, formError('region_cannotChangeOwnRole'))
  }

  if (nextRole === 'region_admin') {
    return
  }

  await assertNotLastAdmin(db, regionFk, userFk)
}

/**
 * A region must never lose its last admin: it would become unadministrable, since only an admin
 * can promote anyone. Asked on every path that takes the admin role away from somebody, whether
 * that is a demotion, a removal or their own departure.
 */
export async function assertNotLastAdmin(db: Db, regionFk: number, userFk: number) {
  if (isLastAdmin(await activeAdminUserFks(db, regionFk), userFk)) {
    error(409, formError('region_lastAdmin'))
  }
}

/**
 * A member's active row in a region, or 404. Active only, like every other read of this table:
 * a deactivated membership is not one the settings screen may act on.
 */
export async function findActiveMember(db: Db, regionFk: number, userFk: number) {
  const member = await db.query.regionMembers.findFirst({
    where: and(
      eq(regionMembers.regionFk, regionFk),
      eq(regionMembers.userFk, userFk),
      eq(regionMembers.isActive, true),
    ),
  })

  if (member == null) {
    error(404, 'Member not found')
  }

  return member
}

/**
 * Every check `restoreRegionMember` makes, in one place so the whole decision is testable.
 *
 * The removal event is what makes an undo an undo rather than an insert: without it every
 * field of the restore snapshot is client-supplied, and an admin can add any user in the database
 * to their region - no invitation, no consent, no seat limit - by reading the ids straight off the
 * globally readable `users` table. `authUserFk` comes back derived rather than trusted, because it
 * is what `authorize_in_region` and every Zero region query key on: a mismatched one would hand
 * the region to a different account than the one being restored.
 *
 * `alreadyMember` stands in for the unique constraint on (region_fk, user_fk) we chose not to add,
 * so a double-tap on Undo or a re-invite in between cannot duplicate the membership.
 */
export async function resolveRestore(
  db: Db,
  regionFk: number,
  userFk: number,
): Promise<{ alreadyMember: boolean; authUserFk: string }> {
  const removal = await db.query.events.findFirst({ where: removalEvent(regionFk, userFk) })

  if (removal == null) {
    error(404, 'Nothing to restore')
  }

  // Neither of these feeds the other, so they go together rather than one round-trip after the
  // other. The removal check stays ahead of them: it is the one that decides whether to ask at all.
  const [user, existing] = await Promise.all([
    db.query.users.findFirst({ columns: { authUserFk: true }, where: eq(users.id, userFk) }),
    db.query.regionMembers.findFirst({
      where: and(eq(regionMembers.regionFk, regionFk), eq(regionMembers.userFk, userFk)),
    }),
  ])

  if (user == null) {
    error(404, 'User not found')
  }

  return { alreadyMember: existing != null, authUserFk: user.authUserFk }
}
