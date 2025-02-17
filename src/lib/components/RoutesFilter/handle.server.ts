import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { ascents, routes, type Ascent } from '$lib/db/schema'
import { buildNestedAreaQuery, enrichRoute, type EnrichedRoute } from '$lib/db/utils'
import { validateObject } from '$lib/forms.server'
import { getUser } from '$lib/helper.server'
import { getPaginationQuery, paginationParamsSchema, type PaginatedData } from '$lib/pagination.server'
import type { RequestEvent } from '@sveltejs/kit'
import { and, asc, count, eq, gte, arrayContains, lte, sql } from 'drizzle-orm'
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

const getQueryOpts = (searchParams: z.infer<typeof searchParamsSchema>, areaId?: number) => {
  let orderBy = [asc(routes.id)]
  const where = [
    searchParams.minGrade == null ? undefined : gte(routes.gradeFk, searchParams.minGrade),
    searchParams.maxGrade == null ? undefined : lte(routes.gradeFk, searchParams.maxGrade),
    areaId == null ? undefined : arrayContains(routes.areaFks, [areaId]),
  ]

  switch (searchParams.sort) {
    case 'rating':
      orderBy = [
        searchParams.sortOrder === 'desc'
          ? sql`${routes.rating} DESC NULLS LAST`
          : sql`${routes.rating} ASC NULLS LAST`,
        asc(routes.gradeFk),
        ...orderBy,
      ]
      break

    case 'grade':
      orderBy = [
        searchParams.sortOrder === 'desc'
          ? sql`${routes.gradeFk} DESC NULLS LAST`
          : sql`${routes.gradeFk} ASC NULLS LAST`,
        sql`${routes.rating} DESC NULLS LAST`,
        ...orderBy,
      ]
      break

    case 'firstAscentYear':
      orderBy = [
        searchParams.sortOrder === 'desc'
          ? sql`${routes.firstAscentYear} DESC NULLS LAST`
          : sql`${routes.firstAscentYear} ASC NULLS LAST`,
        ...orderBy,
      ]
      break
  }

  return { orderBy, where: and(...where.filter(Boolean)) }
}

type Route = EnrichedRoute & { ascents: Ascent[] }

export const load = async (
  { locals, url }: RequestEvent,
  areaId?: number,
): Promise<PaginatedData<{ routes: Route[] }>> => {
  const db = await createDrizzleSupabaseClient(locals.supabase)

  return await db(async (db) => {
    const user = await getUser(locals.user, db)

    const searchParamsObj = Object.fromEntries(url.searchParams.entries())
    const searchParams = await validateObject(searchParamsSchema, searchParamsObj)

    const opts = getQueryOpts(searchParams, areaId)

    const routesResult = await db.query.routes.findMany({
      ...getPaginationQuery(searchParams),
      ...opts,
      with: {
        ascents: user == null ? { limit: 0 } : { where: eq(ascents.createdBy, user.id) },
        block: {
          with: {
            area: buildNestedAreaQuery(),
          },
        },
      },
    })

    const countResults = await db.select({ count: count() }).from(routes).where(opts?.where)
    const enrichedRoutes = routesResult.map((route) => ({ ...enrichRoute(route), ascents: route.ascents }))

    return {
      routes: enrichedRoutes,
      pagination: {
        page: searchParams.page,
        pageSize: searchParams.pageSize,
        total: countResults[0].count,
        totalPages: Math.ceil(countResults[0].count / searchParams.pageSize),
      },
    }
  })
}
