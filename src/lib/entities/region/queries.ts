import { authenticatedUserCan } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineQuery } from '@rocicorp/zero'
import z from 'zod'

export const regionsQueryDefs = {
  listUserRegions: defineQuery(
    z.undefined(),
    authenticatedUserCan(({ ctx }) =>
      zql.regionMembers.where('authUserFk', ctx.authUserId).where('isActive', true).related('region'),
    ),
  ),
}
