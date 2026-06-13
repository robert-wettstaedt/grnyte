import { regionMemberCan } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineQuery } from '@rocicorp/zero'
import z from 'zod'

export const ascentsQueryDefs = {
  listUserAscents: defineQuery(
    z.object({ userId: z.number() }),
    regionMemberCan(({ args }) => zql.ascents.where('createdBy', args.userId)),
  ),
}
