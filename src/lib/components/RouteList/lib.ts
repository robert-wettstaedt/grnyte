import { page } from '$app/state'
import { validateObject } from '$lib/forms/validate.svelte'
import { paginationParamsSchema } from '$lib/pagination.svelte'
import { z } from 'zod'
import { pageState } from '$lib/components/Layout'

const searchParamsSchema = z.intersection(
  z.object({
    maxGrade: z.number().optional(),
    minGrade: z.number().optional(),
    sort: z.enum(['rating', 'grade', 'firstAscentYear']).default('rating'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
  paginationParamsSchema,
)

export const getRoutesFilterQuery = (areaId?: number) => {
  const searchParamsObj = Object.fromEntries(page.url.searchParams.entries())
  const searchParams = validateObject(searchParamsSchema, searchParamsObj)

  let query = page.data.z.current.query.routes
    .related('ascents', (q) =>
      pageState.user?.id == null ? q.where('createdBy', 'IS', null) : q.where('createdBy', '=', pageState.user.id),
    )
    .related('block', (q) =>
      q.related('area', (q) =>
        q.related('parent', (q) => q.related('parent', (q) => q.related('parent', (q) => q.related('parent')))),
      ),
    )
    .orderBy(searchParams.sort === 'grade' ? 'gradeFk' : searchParams.sort, searchParams.sortOrder)
    .where(searchParams.sort === 'grade' ? 'gradeFk' : searchParams.sort, 'IS NOT', null)

  if (areaId != null) {
    query = query.where('areaIds', 'ILIKE', `%^${areaId}$%`)
  }

  if (searchParams.minGrade != null) {
    query = query.where('gradeFk', '>=', searchParams.minGrade)
  }
  if (searchParams.maxGrade != null) {
    query = query.where('gradeFk', '<=', searchParams.maxGrade)
  }

  switch (searchParams.sort) {
    case 'rating':
      query = query.orderBy('gradeFk', 'asc')
      break

    case 'grade':
      query = query.orderBy('rating', 'desc')
      break
  }

  query = query.orderBy('id', 'asc').limit(searchParams.pageSize)

  return query
}
