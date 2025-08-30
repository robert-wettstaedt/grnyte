import { form, getRequestEvent } from '$app/server'
import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
import { insertActivity } from '$lib/components/ActivityFeed/load.server'
import { config } from '$lib/config'
import * as schema from '$lib/db/schema'
import { generateSlug, routes } from '$lib/db/schema'
import type { InferResultType } from '$lib/db/types'
import { buildNestedAreaQuery } from '$lib/db/utils'
import { convertException } from '$lib/errors'
import { enhanceForm, type Action } from '$lib/forms/enhance.server'
import { routeActionSchema } from '$lib/forms/schemas'
import { error } from '@sveltejs/kit'
import { and, eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import z from 'zod'

export const createRoute = form((data) => enhanceForm(data, createRouteActionSchema, createRouteAction))

export const createRouteAndReload = form((data) =>
  enhanceForm(data, createRouteActionSchema, createRouteAndReloadAction),
)

const createRouteAction: Action<CreateRouteActionValues> = async (values, db, user) => {
  const { locals } = getRequestEvent()

  const block = await db.query.blocks.findFirst({
    where: (table, { eq }) => eq(table.id, values.blockId),
  })

  if (block == null) {
    error(404)
  }

  if (!checkRegionPermission(locals.userRegions, [REGION_PERMISSION_EDIT], block.regionFk)) {
    error(401)
  }

  const slug = generateSlug(values.name)
  const { areaFks, areaIds } = await getAreaIds(block.id, db)
  values.rating = values.rating == null || String(values.rating).length === 0 ? undefined : values.rating

  if (slug.length > 0) {
    // Query the database to check if a route with the same slug already exists in the block
    const existingRoutesResult = await db
      .select()
      .from(routes)
      .where(and(eq(routes.slug, slug), eq(routes.blockFk, block.id)))

    // If a route with the same slug exists, return a 400 error with a message
    if (existingRoutesResult.length > 0) {
      error(400, `Route with name "${existingRoutesResult[0].name}" already exists in block "${block.name}"`)
    }
  }

  let route: schema.Route

  try {
    const result = await db
      .insert(routes)
      .values({
        ...values,
        areaFks,
        areaIds,
        createdBy: user.id,
        blockFk: block.id,
        regionFk: block.regionFk,
        slug,
      })
      .returning()
    route = result[0]

    await insertActivity(db, {
      type: 'created',
      userFk: user.id,
      entityId: String(route.id),
      entityType: 'route',
      newValue: route.name.length > 0 ? route.name : config.routes.defaultName,
      parentEntityId: String(block.id),
      parentEntityType: 'block',
      regionFk: route.regionFk,
    })
  } catch (exception) {
    error(400, `Unable to create route: ${convertException(exception)}`)
  }

  try {
    if (values.tags != null && values.tags.length > 0) {
      await db
        .insert(schema.routesToTags)
        .values(values.tags!.map((tag) => ({ regionFk: route.regionFk, routeFk: route.id, tagFk: tag })))
    }
  } catch (exception) {
    error(400, `Unable to create tags: ${convertException(exception)}`)
  }

  try {
    // await insertExternalResources(route, block, locals)
  } catch (exception) {
    error(400, `Unable to create route external resources: ${convertException(exception)}`)
  }

  return values.redirect != null && values.redirect.length > 0 ? values.redirect : ['', 'routes', route.id].join('/')
}

const createRouteAndReloadAction: Action<CreateRouteActionValues> = async (values, db, ...rest) => {
  await createRouteAction(values, db, ...rest)
  return '?reload=true'
}

type CreateRouteActionValues = z.infer<typeof createRouteActionSchema>
const createRouteActionSchema = z.intersection(
  z.object({
    blockId: z.number(),
    redirect: z.string().nullish(),
  }),
  routeActionSchema,
)

async function getAreaIds(blockId: number, db: PostgresJsDatabase<typeof schema>) {
  const block = await db.query.blocks.findFirst({
    where: (table, { eq }) => eq(table.id, blockId),
    with: {
      area: buildNestedAreaQuery(),
    },
  })

  if (block == null) {
    error(404)
  }

  const areaFks: number[] = [block.areaFk]
  let current = block.area as InferResultType<'areas', { parent: true }> | null
  while (current?.parent != null) {
    areaFks.push(current.parent.id)
    current = current.parent as InferResultType<'areas', { parent: true }> | null
  }
  areaFks.reverse()
  const areaIds = areaFks.map((id) => `^${id}$`).join(',')

  return { areaFks, areaIds }
}
