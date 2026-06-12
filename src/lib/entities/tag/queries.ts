import { authenticatedUserCan } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineQuery } from '@rocicorp/zero'
import z from 'zod'

export const tagsQueryDefs = {
  listTags: defineQuery(
    z.undefined(),
    authenticatedUserCan(() => zql.tags.orderBy('id', 'asc')),
  ),
}
