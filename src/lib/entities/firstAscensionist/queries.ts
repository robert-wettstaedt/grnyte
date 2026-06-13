import { regionMemberCan } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineQuery } from '@rocicorp/zero'
import z from 'zod'

export const firstAscensionistsQueryDefs = {
  listFirstAscensionists: defineQuery(
    z.undefined(),
    regionMemberCan(() => zql.firstAscensionists.orderBy('name', 'asc')),
  ),
}
