import * as z from '$lib/forms/zod'
import { authenticatedUserCan } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineQuery } from '@rocicorp/zero'

export const rolePermissionsQueryDefs = {
  listRolePermissions: defineQuery(
    z.undefined(),
    authenticatedUserCan(() => zql.rolePermissions),
  ),
}
