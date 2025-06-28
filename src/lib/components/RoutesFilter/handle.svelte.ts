import { page } from '$app/state'
import { validateObject } from '$lib/forms/validate.svelte'
import { paginationParamsSchema } from '$lib/pagination.svelte'
import { Query } from 'zero-svelte'
import { z } from 'zod/v4'

const searchParamsSchema = z.intersection(
  z.object({
    maxGrade: z.number().optional(),
    minGrade: z.number().optional(),
    sort: z.enum(['rating', 'grade', 'firstAscentYear']).default('rating'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
  paginationParamsSchema,
)

export const load = (areaId?: number) => {
  const searchParamsObj = Object.fromEntries(page.url.searchParams.entries())
  const searchParams = validateObject(searchParamsSchema, searchParamsObj)

  let query = page.data.z.current.query.routes
    .where('gradeFk', '>', searchParams.minGrade ?? page.data.grades.at(0)!.id)
    .where('gradeFk', '<', searchParams.maxGrade ?? page.data.grades.at(-1)!.id)
    .related('ascents', (q) =>
      page.data.user?.id == null ? q.where('createdBy', 'IS', null) : q.where('createdBy', '=', page.data.user.id),
    )
    .related('block', (q) =>
      q.related('area', (q) =>
        q.related('parent', (q) => q.related('parent', (q) => q.related('parent', (q) => q.related('parent')))),
      ),
    )
    .orderBy(searchParams.sort === 'grade' ? 'gradeFk' : searchParams.sort, searchParams.sortOrder)

  switch (searchParams.sort) {
    case 'rating':
      query = query.orderBy('gradeFk', 'asc')
      break

    case 'grade':
      query = query.orderBy('rating', 'desc')
      break
  }

  query = query.orderBy('id', 'asc').limit(searchParams.pageSize)

  return new Query(query)
}
