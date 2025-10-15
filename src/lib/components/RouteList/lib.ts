import { page } from '$app/state'
import { pageState } from '$lib/components/Layout'
import { queries } from '$lib/db/zero'
import { validateObject } from '$lib/forms/validate.svelte'
import { paginationParamsSchema } from '$lib/pagination.svelte'
import { z } from 'zod'

const searchParamsSchema = z.intersection(
  z.object({
    maxGrade: z.number().optional(),
    minGrade: z.number().optional(),
    sort: z.enum(['rating', 'grade', 'firstAscentYear']).default('rating'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
  paginationParamsSchema,
)

export const getRoutesFilterQuery = (areaId?: number | null) => {
  const searchParamsObj = Object.fromEntries(page.url.searchParams.entries())
  const searchParams = validateObject(searchParamsSchema, searchParamsObj)

  return queries.listRoutesWithRelations(page.data.session, {
    areaId,
    userId: pageState.user?.id,
    withRelations: true,
    ...searchParams,
  })
}
