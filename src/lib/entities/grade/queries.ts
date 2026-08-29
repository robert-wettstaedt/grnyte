import * as z from '$lib/forms/zod'
import { authenticatedUserCan } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineQuery } from '@rocicorp/zero'

export const gradesQueryDefs = {
  listGrades: defineQuery(
    z.undefined(),
    authenticatedUserCan(() => zql.grades.orderBy('id', 'asc')),
  ),
}
