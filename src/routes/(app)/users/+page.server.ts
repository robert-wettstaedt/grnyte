import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import { validateObject } from '$lib/forms/validate.server'
import { getPaginationQuery, paginationParamsSchema } from '$lib/pagination.server'
import { asc, count, inArray } from 'drizzle-orm'
import type { PageServerLoad } from './$types'

export const load = (async ({ locals, url }) => {
  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    const searchParamsObj = Object.fromEntries(url.searchParams.entries())
    const searchParams = await validateObject(paginationParamsSchema, searchParamsObj)
    const where = inArray(
      schema.regionMembers.regionFk,
      locals.userRegions.map((region) => region.regionFk),
    )

    const regionMembers = await db.query.regionMembers.findMany({
      ...getPaginationQuery(searchParams),
      orderBy: [asc(schema.regionMembers.userFk)],
      where,
      with: {
        region: true,
        user: true,
      },
    })

    const countResults = await db.select({ count: count() }).from(schema.regionMembers).where(where)

    const userIds = Array.from(new Set(regionMembers.map((member) => member.userFk)))
    const users = userIds.map((userFk) => {
      const members = regionMembers.filter((member) => member.userFk === userFk)
      return {
        ...members[0].user,
        regions: members.map((member) => ({ ...member.region, role: member.role })),
      }
    })

    return {
      users,
      pagination: {
        page: searchParams.page,
        pageSize: searchParams.pageSize,
        total: countResults[0].count,
      },
    }
  })
}) satisfies PageServerLoad
