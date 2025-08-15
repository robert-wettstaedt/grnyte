import { command, form, getRequestEvent } from '$app/server'
import { checkRegionPermission, REGION_PERMISSION_DELETE, REGION_PERMISSION_EDIT } from '$lib/auth'
import { insertActivity } from '$lib/components/ActivityFeedLegacy/load.server'
import { firstAscensionists, routes, routesToFirstAscensionists } from '$lib/db/schema'
import { enhance, enhanceForm, type Action } from '$lib/forms/enhance.server'
import { error } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import z from 'zod'

export const updateFirstAscent = form((data) => enhanceForm(data, firstAscentActionSchema, updateFirstAscentAction))

export const deleteFirstAscent = command(z.number(), (id) => enhance(id, deleteFirstAscentAction))

const updateFirstAscentAction: Action<FirstAscentActionValues> = async (values, db, user) => {
  const { locals } = getRequestEvent()

  const route = await db.query.routes.findFirst({
    where: (table, { eq }) => eq(table.id, values.routeId),
    with: {
      firstAscents: {
        with: {
          firstAscensionist: true,
        },
      },
    },
  })

  if (route == null) {
    error(404)
  }

  if (!checkRegionPermission(locals.userRegions, [REGION_PERMISSION_EDIT], route.regionFk)) {
    error(401)
  }

  await db.delete(routesToFirstAscensionists).where(eq(routesToFirstAscensionists.routeFk, route.id))
  await db
    .update(routes)
    .set({ firstAscentYear: values.year ?? null })
    .where(eq(routes.id, route.id))
  if (values.climberName != null) {
    await Promise.all(
      values.climberName.map(async (name) => {
        let firstAscensionist = await db.query.firstAscensionists.findFirst({
          where: eq(firstAscensionists.name, name),
        })

        if (firstAscensionist == null) {
          firstAscensionist = (
            await db
              .insert(firstAscensionists)
              .values({
                name,
                regionFk: route.regionFk,
              })
              .returning()
          )[0]
        }

        await db
          .insert(routesToFirstAscensionists)
          .values({ firstAscensionistFk: firstAscensionist.id, regionFk: route.regionFk, routeFk: route.id })
      }),
    )
  }

  const oldFirstAscent = [route.firstAscentYear, ...route.firstAscents.map((fa) => fa.firstAscensionist.name)]
    .filter(Boolean)
    .join(' ')
  const newFirstAscent = [values.year, ...(values.climberName ?? [])].filter(Boolean).join(' ')

  await insertActivity(db, {
    type: 'updated',
    userFk: user.id,
    entityId: String(route.id),
    entityType: 'route',
    columnName: 'first ascent',
    oldValue: oldFirstAscent,
    newValue: newFirstAscent,
    parentEntityId: String(route.blockFk),
    parentEntityType: 'block',
    regionFk: route.regionFk,
  })

  return ['', 'routes', route.id].join('/')
}

const deleteFirstAscentAction: Action<number> = async (routeId, db, user) => {
  const { locals } = getRequestEvent()

  const route = await db.query.routes.findFirst({
    where: (table, { eq }) => eq(table.id, routeId),
    with: {
      firstAscents: {
        with: {
          firstAscensionist: true,
        },
      },
    },
  })

  if (route == null) {
    error(404)
  }

  if (!checkRegionPermission(locals.userRegions, [REGION_PERMISSION_DELETE], route.regionFk)) {
    error(401)
  }

  await db.delete(routesToFirstAscensionists).where(eq(routesToFirstAscensionists.routeFk, route.id))
  await db.update(routes).set({ firstAscentYear: null }).where(eq(routes.id, route.id))

  const oldFirstAscent = [route.firstAscentYear, route.firstAscents.map((fa) => fa.firstAscensionist.name)]
    .filter((d) => d != null)
    .join(' ')

  await insertActivity(db, {
    type: 'deleted',
    userFk: user.id,
    entityId: String(route.id),
    entityType: 'route',
    columnName: 'first ascent',
    oldValue: oldFirstAscent,
    parentEntityId: String(route.blockFk),
    parentEntityType: 'block',
    regionFk: route.regionFk,
  })

  return ['', 'routes', route.id].join('/')
}

const firstAscentActionSchema = z
  .object({
    climberName: z.array(z.string().trim()).optional(),
    routeId: z.number(),
    year: z.number().min(1950).max(new Date().getFullYear()).optional(),
  })
  .refine((x) => x.climberName != null || x.year != null, { message: 'Either climberName or year must be set' })
type FirstAscentActionValues = z.infer<typeof firstAscentActionSchema>
