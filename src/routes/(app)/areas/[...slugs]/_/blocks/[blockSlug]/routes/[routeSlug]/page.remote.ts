import { command, getRequestEvent } from '$app/server'
import { checkRegionPermission, REGION_PERMISSION_ADMIN } from '$lib/auth'
import { insertActivity } from '$lib/components/ActivityFeed/load.server'
import { firstAscensionists, routesToFirstAscensionists, users } from '$lib/db/schema'
import { insertExternalResources } from '$lib/external-resources/index.server'
import { enhance, type Action } from '$lib/forms/enhance.server'
import { error } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import z from 'zod'

type ClaimFirstAscensionistActionValues = z.infer<typeof claimFirstAscensionistActionSchema>
const claimFirstAscensionistActionSchema = z.object({
  firstAscensionistFk: z.number().nullish(),
  routeId: z.number().nullish(),
})

export const syncExternalResources = command(z.number(), (data) => enhance(data, syncExternalResourcesAction))

export const claimFirstAscensionist = command(claimFirstAscensionistActionSchema, (data) =>
  enhance(data, claimFirstAscensionistAction),
)

export const claimFirstAscent = command(z.number(), (data) => enhance(data, claimFirstAscentAction))

const syncExternalResourcesAction: Action<number> = async (routeId, db, user) => {
  const { locals } = getRequestEvent()

  const route = await db.query.routes.findFirst({
    where: (table, { eq }) => eq(table.id, routeId),
    with: {
      block: true,
    },
  })

  if (route == null) {
    error(404)
  }

  if (!checkRegionPermission(locals.userRegions, [REGION_PERMISSION_ADMIN], route.regionFk)) {
    error(401)
  }

  await insertExternalResources(route, route.block, locals)
}

const claimFirstAscensionistAction: Action<ClaimFirstAscensionistActionValues> = async (
  { firstAscensionistFk, routeId },
  db,
  user,
) => {
  const route =
    routeId == null
      ? undefined
      : await db.query.routes.findFirst({
          where: (table, { eq }) => eq(table.id, routeId),
        })

  const firstAscensionist =
    firstAscensionistFk == null
      ? undefined
      : await db.query.firstAscensionists.findFirst({
          where: (table, { eq }) => eq(table.id, firstAscensionistFk),
        })

  if (route == null || firstAscensionist == null) {
    error(404)
  }

  if (firstAscensionist.userFk != null || user.firstAscensionistFk != null) {
    error(400)
  }

  await db.update(users).set({ firstAscensionistFk: firstAscensionist.id }).where(eq(users.id, user.id))
  await db.update(firstAscensionists).set({ userFk: user.id }).where(eq(firstAscensionists.id, firstAscensionist.id))

  await insertActivity(db, {
    type: 'updated',
    userFk: user.id,
    entityId: String(user.id),
    entityType: 'user',
    columnName: 'first ascensionist',
    newValue: firstAscensionist.name,
    regionFk: route.regionFk,
  })
}

const claimFirstAscentAction: Action<number> = async (routeId, db, user) => {
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

  if (route.firstAscents.length > 0) {
    return error(400, `Route already has a first ascent`)
  }

  if (user.firstAscensionistFk == null) {
    return error(400, `User does not have a first ascensionist`)
  }

  const firstAscensionist =
    user.firstAscensionistFk == null
      ? (
          await db
            .insert(firstAscensionists)
            .values({ name: user.username, userFk: user.id, regionFk: route.regionFk })
            .returning()
        ).at(0)
      : await db.query.firstAscensionists.findFirst({
          where: eq(firstAscensionists.id, user.firstAscensionistFk!),
        })

  if (firstAscensionist == null) {
    error(404)
  }

  if (user.firstAscensionistFk == null) {
    user.firstAscensionistFk = firstAscensionist.id
    await db.update(users).set({ firstAscensionistFk: firstAscensionist.id }).where(eq(users.id, user.id))
  }

  await db.insert(routesToFirstAscensionists).values({
    firstAscensionistFk: user.firstAscensionistFk!,
    regionFk: route.regionFk,
    routeFk: route.id,
  })

  const oldFirstAscent = [route.firstAscentYear, ...route.firstAscents.map((fa) => fa.firstAscensionist.name)]
    .filter(Boolean)
    .join(' ')
  const newFirstAscent = [route.firstAscentYear, firstAscensionist.name].filter(Boolean).join(' ')

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
}
