import { command, form, getRequestEvent } from '$app/server'
import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
import { createUpdateActivity } from '$lib/components/ActivityFeedLegacy/load.server'
import { generateSlug, routes, routesToTags } from '$lib/db/schema'
import { enhance, enhanceForm, type Action } from '$lib/forms/enhance.server'
import { routeActionSchema } from '$lib/forms/schemas'
import { deleteRoute as deleteRouteHelper, updateRoutesUserData } from '$lib/routes.server'
import { error } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import z from 'zod'

export const updateRoute = form((data) => enhanceForm(data, editRouteActionSchema, updateRouteAction))

export const deleteRoute = command(z.number(), (id) => enhance(id, deleteRouteAction))

const updateRouteAction: Action<EditRouteActionValues> = async (values, db, user) => {
  const { locals } = getRequestEvent()

  const route = await db.query.routes.findFirst({
    where: (table, { eq }) => eq(table.id, values.routeId),
    with: {
      block: {
        columns: {
          name: true,
        },
      },
      tags: true,
    },
  })

  if (route == null) {
    error(404)
  }

  if (!checkRegionPermission(locals.userRegions, [REGION_PERMISSION_EDIT], route.regionFk)) {
    error(401)
  }

  // Generate a slug from the route name
  const slug = generateSlug(values.name)

  if (slug != route.slug && slug.length > 0) {
    // Query the database to check if a route with the same slug already exists in the block
    const existingRoute = await db.query.routes.findFirst({
      where: (table, { and, eq, not }) =>
        and(eq(table.slug, slug), eq(table.blockFk, route.blockFk), not(eq(table.id, route.id))),
    })

    // If a route with the same slug exists, return a 400 error with a message
    if (existingRoute != null) {
      error(400, `Route with name "${existingRoute.name}" already exists in block "${route.block.name}"`)
    }
  }

  const { tags, ...rest } = values

  // Update the route in the database with the validated values
  await db
    .update(routes)
    .set({ ...rest, slug })
    .where(eq(routes.id, route.id))

  // Delete existing route-to-tag associations for the route
  await db.delete(routesToTags).where(eq(routesToTags.routeFk, route.id))

  if (tags != null && tags.length > 0) {
    // Insert new route-to-tag associations for the route
    await db
      .insert(routesToTags)
      .values(tags.map((tag) => ({ routeFk: route.id, tagFk: tag, regionFk: route.regionFk })))
  }

  await updateRoutesUserData(route.id, db)

  const oldRoute = { ...route, tags: route.tags.map((tag) => tag.tagFk).toSorted((a, b) => a.localeCompare(b)) }

  await createUpdateActivity({
    db,
    entityId: String(route.id),
    entityType: 'route',
    newEntity: values,
    oldEntity: oldRoute,
    userFk: user.id,
    parentEntityId: String(route.blockFk),
    parentEntityType: 'block',
    regionFk: route.regionFk,
  })

  return values.redirect != null && values.redirect.length > 0 ? values.redirect : ['', 'routes', route.id].join('/')
}

const deleteRouteAction: Action<number> = async (routeId, db, user) => {
  const { locals } = getRequestEvent()

  const route = await deleteRouteHelper(
    {
      routeId,
      userId: user.id,
      userRegions: locals.userRegions,
    },
    db,
  )

  return ['', 'blocks', route.blockFk].join('/')
}

type EditRouteActionValues = z.infer<typeof editRouteActionSchema>
const editRouteActionSchema = z.intersection(
  z.object({
    blockId: z.number(),
    redirect: z.string().nullish(),
    routeId: z.number(),
  }),
  routeActionSchema,
)
