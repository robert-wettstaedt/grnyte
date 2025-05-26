import { checkRegionPermission, REGION_PERMISSION_READ } from '$lib/auth.js'
import { db } from '$lib/db/db.server'
import { blocks, type InsertRoute } from '$lib/db/schema'
import type { InferResultType } from '$lib/db/types'
import { handler27crags, handler8a, handlerTheCrag, queryExternalResource } from '$lib/external-resources/index.server'
import { eq } from 'drizzle-orm'

export const GET = async ({ locals, url }) => {
  const query = url.searchParams.get('query')
  const blockId = Number(url.searchParams.get('blockId'))

  if (query == null) {
    return new Response(JSON.stringify({ error: 'Query not found' }), { status: 400 })
  }

  if (Number.isNaN(blockId)) {
    return new Response(JSON.stringify({ error: 'Block ID not found' }), { status: 400 })
  }

  const grades = await db.query.grades.findMany()
  const block = await db.query.blocks.findFirst({
    where: eq(blocks.id, blockId),
    columns: {
      regionFk: true,
    },
  })

  if (block == null || !checkRegionPermission(locals.userRegions, [REGION_PERMISSION_READ], block?.regionFk)) {
    return new Response(null, { status: 404 })
  }

  const { data8a, data27crags, dataTheCrag } = await queryExternalResource(query, blockId, locals)

  const route8a = data8a == null ? null : handler8a.convertToRoute(data8a, grades)
  const route27crags = data27crags == null ? null : handler27crags.convertToRoute(data27crags, grades)
  const routeTheCrag = dataTheCrag == null ? null : handlerTheCrag.convertToRoute(dataTheCrag, grades)

  const gradeIndices = [route8a?.gradeFk, route27crags?.gradeFk, routeTheCrag?.gradeFk].filter(Boolean) as number[]
  const gradeIndicesSum = gradeIndices.reduce((sum, index) => {
    if (sum === -1) {
      return index
    }

    if (index === -1) {
      return sum
    }

    return sum + index
  }, -1)
  const gradeIndicesMean = Math.round(gradeIndicesSum / gradeIndices.length)

  const routeRatings = [route8a?.rating, route27crags?.rating, routeTheCrag?.rating].filter(Boolean) as number[]
  const ratingSum = routeRatings.reduce((sum, rating) => sum + rating, 0)
  const ratingMean = Math.round(ratingSum / routeRatings.length)

  const route: InsertRoute = {
    blockFk: blockId,
    createdAt: new Date(),
    createdBy: -1,
    description: route8a?.description ?? route27crags?.description ?? routeTheCrag?.description ?? null,
    externalResourcesFk: null,
    firstAscentYear: null,
    gradeFk: gradeIndicesMean < 0 ? null : grades[gradeIndicesMean].id,
    name: route8a?.name ?? route27crags?.name ?? routeTheCrag?.name ?? query,
    rating: ratingMean,
    slug: '',
    regionFk: block.regionFk,
  }

  const routeExternalResources: InferResultType<
    'routeExternalResources',
    { externalResource8a: true; externalResource27crags: true; externalResourceTheCrag: true }
  > = {
    routeFk: -1,
    regionFk: block.regionFk,
    id: -1,
    externalResource27cragsFk: -1,
    externalResource8aFk: -1,
    externalResourceTheCragFk: -1,

    externalResource8a: data8a,
    externalResource27crags: data27crags,
    externalResourceTheCrag: dataTheCrag,
  }

  return new Response(JSON.stringify({ route, routeExternalResources }))
}
