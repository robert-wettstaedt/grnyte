import { db as baseDb } from '$lib/db/db.server'
import { regionMembers, regions } from '$lib/db/schema'
import { formError } from '$lib/forms/schemas'
import { error } from '@sveltejs/kit'
import { count, eq } from 'drizzle-orm'
import { MAX_OWNED_REGIONS, type OwnedRegion } from './dto'

/**
 * Found a region and put its creator in it as `region_admin`, in one transaction.
 *
 * Over the base (non-RLS) `db` for the same reason `acceptInvitation` is: the founder is not a
 * member yet, and `region_members` deliberately has no self-insert policy (see the comment on the
 * table). Creating the region in this transaction is the authorization, and it is
 * checked right here.
 *
 * Atomic on purpose. A region with no members is unreachable garbage: the `regions` select policy
 * is membership-scoped, so nobody, including its creator, could ever see it again.
 */
export async function createRegionForUser({
  authUserId,
  name,
  userId,
}: {
  authUserId: string
  name: string
  userId: number
}): Promise<{ id: number }> {
  return baseDb.transaction(async (tx) => {
    // Re-checked inside the transaction rather than trusting the handler's check: two tabs
    // submitting at once both pass that one and would leave the account over the cap.
    const [{ owned }] = await tx.select({ owned: count() }).from(regions).where(eq(regions.createdBy, userId))

    if (owned >= MAX_OWNED_REGIONS) {
      error(409, formError('region_capReached', { count: MAX_OWNED_REGIONS }))
    }

    const [region] = await tx.insert(regions).values({ createdBy: userId, name }).returning({ id: regions.id })

    // No `invitedByFk`: a null inviter is what marks the founder, the way the member list reads it.
    await tx.insert(regionMembers).values({
      authUserFk: authUserId,
      isActive: true,
      regionFk: region.id,
      role: 'region_admin',
      userFk: userId,
    })

    return { id: region.id }
  })
}

/** The regions this account has founded, oldest first. Over the base `db`, so one the founder
 *  later left still counts against them: under RLS it would have vanished from the list and
 *  handed the seat back. */
export function listOwnedRegions(userId: number): Promise<OwnedRegion[]> {
  return baseDb
    .select({ id: regions.id, name: regions.name })
    .from(regions)
    .where(eq(regions.createdBy, userId))
    .orderBy(regions.id)
}
