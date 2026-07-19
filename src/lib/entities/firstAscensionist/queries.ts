import { regionMemberCan } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineQuery } from '@rocicorp/zero'
import z from 'zod'

export const firstAscensionistsQueryDefs = {
  listFirstAscensionists: defineQuery(
    z.object({ regionFk: z.number().optional() }).optional(),
    regionMemberCan(({ args }) => {
      // The linked user (for the "@username" subtitle), users aren't region-scoped.
      let q = zql.firstAscensionists.related('user').orderBy('name', 'asc')
      if (args?.regionFk != null) {
        q = q.where('regionFk', args.regionFk)
      }
      return q
    }),
  ),

  // The first-ascensionist row(s) linked to a user — resolves the fk the route FA
  // filter needs to list a climber's first ascents on their profile.
  listUserFirstAscensionist: defineQuery(
    z.object({ userId: z.number() }),
    regionMemberCan(({ args }) => zql.firstAscensionists.where('userFk', args.userId)),
  ),
}
