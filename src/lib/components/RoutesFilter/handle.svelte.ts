import { page } from '$app/state'
import { type Ascent } from '$lib/db/schema'
import { enrichRoute, type EnrichedRoute } from '$lib/db/utils.svelte'
import { validateObject } from '$lib/forms/validate.svelte'
import { paginationParamsSchema, type PaginatedData } from '$lib/pagination.svelte'
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

type Route = EnrichedRoute & { ascents: Ascent[] }

export const load = (areaId?: number) => {
  const searchParamsObj = Object.fromEntries(page.url.searchParams.entries())
  const searchParams = validateObject(searchParamsSchema, searchParamsObj)

  const allRoutes = new Query(
    page.data.z.current.query.routes
      .where('gradeFk', '>', searchParams.minGrade ?? page.data.grades.at(0)!.id)
      .where('gradeFk', '<', searchParams.maxGrade ?? page.data.grades.at(-1)!.id)
      .orderBy(searchParams.sort === 'grade' ? 'gradeFk' : searchParams.sort, searchParams.sortOrder)
      .orderBy('id', 'asc')
      .related('ascents', (q) => q.where('createdBy', '=', page.data.user?.id))
      .related('block', (q) =>
        q.related('area', (q) =>
          q.related('parent', (q) => q.related('parent', (q) => q.related('parent', (q) => q.related('parent')))),
        ),
      ),
  )

  const routes = allRoutes.current.slice(
    searchParams.page * searchParams.pageSize,
    (searchParams.page + 1) * searchParams.pageSize,
  )

  const enrichedRoutes = routes.map((route) => ({ ...enrichRoute(route), ascents: route.ascents }))

  return {
    current: {
      routes: enrichedRoutes,
      pagination: {
        page: searchParams.page,
        pageSize: searchParams.pageSize,
        total: allRoutes.current.length,
        totalPages: Math.ceil(allRoutes.current.length / searchParams.pageSize),
      },
    } satisfies PaginatedData<{ routes: Route[] }>,
    details: allRoutes.details,
  }
}
