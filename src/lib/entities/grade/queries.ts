import { authenticatedUserCan } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineQuery } from '@rocicorp/zero'
import z from 'zod'

export const gradesQueryDefs = {
  listGrades: defineQuery(
    z.undefined(),
    authenticatedUserCan(() => zql.grades.orderBy('id', 'asc')),
  ),
}
