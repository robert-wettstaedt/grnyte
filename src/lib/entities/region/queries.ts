import { authenticatedUserCan, regionMemberCan } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineQuery } from '@rocicorp/zero'
import z from 'zod'

export const regionsQueryDefs = {
  listRegionMembers: defineQuery(
    z.object({ regionFk: z.number() }),
    regionMemberCan(({ args }) =>
      zql.regionMembers.where('regionFk', args.regionFk).where('isActive', true).related('user').related('invitedBy'),
    ),
  ),

  listUserRegions: defineQuery(
    z.undefined(),
    authenticatedUserCan(({ ctx }) =>
      zql.regionMembers.where('authUserFk', ctx.authUserId).where('isActive', true).related('region'),
    ),
  ),

  /**
   * A single region the signed-in user belongs to. `regions` keys on `id` rather than
   * `regionFk`, so `regionMemberCan`'s filter does not apply. The membership check is
   * spelled out instead.
   */
  region: defineQuery(
    z.object({ id: z.number() }),
    authenticatedUserCan(({ args, ctx }) =>
      zql.regions
        .where('id', args.id)
        .whereExists('members', (member) => member.where('authUserFk', ctx.authUserId).where('isActive', true))
        .related('author')
        .one(),
    ),
  ),
}
