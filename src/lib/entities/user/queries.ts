import { authenticatedUserCan, relatedRegion } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineQuery } from '@rocicorp/zero'
import z from 'zod'

export const usersQueryDefs = {
  currentUser: defineQuery(
    z.undefined(),
    authenticatedUserCan(({ ctx }) => zql.users.where('authUserFk', ctx.authUserId).related('userSettings').one()),
  ),
  currentUserRole: defineQuery(
    z.undefined(),
    authenticatedUserCan(({ ctx }) => zql.userRoles.where('authUserFk', ctx.authUserId).one()),
  ),

  listUsers: defineQuery(
    z.object({
      regionFk: z.number(),
      content: z.string().optional(),
      limit: z.number().optional(),
    }),
    authenticatedUserCan(({ args, ctx }) => {
      const r = relatedRegion(ctx)

      let q = zql.users
        .whereExists('regionMemberships', (membership) =>
          r(membership).where('regionFk', args.regionFk).where('isActive', true),
        )
        .orderBy('username', 'asc')

      if (args.content != null) {
        q = q.where('username', 'ILIKE', `%${args.content}%`)
      }

      if (args.limit != null) {
        q = q.limit(args.limit)
      }

      return q
    }),
  ),

  /**
   * Render-resolver for `!users:id!` tokens: resolve explicit ids already
   * embedded in stored content → `username`. Looking up known ids is not an
   * enumeration vector, so `authenticatedUserCan` is sufficient.
   */
  usersByIds: defineQuery(
    z.object({ id: z.array(z.number()) }),
    authenticatedUserCan(({ args }) => zql.users.where('id', 'IN', args.id)),
  ),
}
