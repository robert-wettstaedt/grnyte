import * as z from '$lib/forms/zod'
import { authenticatedUserCan, relatedRegion } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineQuery } from '@rocicorp/zero'

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
      content: z.optional(z.string()),
      // Narrow to specific users. Unlike `usersByIds` this stays inside the
      // region scope below, so it is safe to resolve an id that came off a URL.
      ids: z.optional(z.array(z.number())),
      limit: z.optional(z.number()),
      // Users who are active members of any of these regions (a global search
      // spans every region the signed-in user belongs to). Empty = match none.
      regionFks: z.array(z.number()),
    }),
    authenticatedUserCan(({ args, ctx }) => {
      const r = relatedRegion(ctx)

      let q = zql.users
        .whereExists('regionMemberships', (membership) =>
          r(membership).where('regionFk', 'IN', args.regionFks).where('isActive', true),
        )
        // The matching memberships come back too, so the caller can label each
        // user with its region(s) when the search spans more than one.
        .related('regionMemberships', (membership) =>
          r(membership).where('regionFk', 'IN', args.regionFks).where('isActive', true),
        )
        .orderBy('username', 'asc')

      if (args.content != null) {
        q = q.where('username', 'ILIKE', `%${args.content}%`)
      }

      if (args.ids != null) {
        q = q.where('id', 'IN', args.ids)
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
