import { authenticatedUserCan } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineQuery } from '@rocicorp/zero'
import z from 'zod'

export const usersQueryDefs = {
  currentUser: defineQuery(
    z.undefined(),
    authenticatedUserCan(({ ctx }) => zql.users.where('authUserFk', ctx.authUserId).related('userSettings').one()),
  ),
}
