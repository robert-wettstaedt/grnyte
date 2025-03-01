import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import type { NestedArea } from '$lib/db/types'
import { buildNestedAreaQuery } from '$lib/db/utils'
import { eq } from 'drizzle-orm'
import handler27crags from './27crags.server'
import handler8a from './8a.server'
import handlerTheCrag from './thecrag.server'

export interface ExternalResourceHandler<ExternalResource, SessionReturnType> {
  postUrl?: string
  query: (
    query: string,
    blockId: number,
    cragName: string | null | undefined,
    sectorName: string | null | undefined,
    userSettings: schema.UserSettings | null | undefined,
  ) => Promise<ExternalResource | null>
  convertToRoute: (data: ExternalResource, grades: schema.Grade[]) => schema.Route
  checkSession: (
    externalResourceId: number | null,
    userSettings: schema.UserSettings,
    locals: App.Locals,
  ) => Promise<SessionReturnType | null>
  logAscent: (
    ascent: schema.Ascent,
    externalResourceId: number | null,
    userSettings: schema.UserSettings,
    session: SessionReturnType,
    locals: App.Locals,
  ) => Promise<void>
}

export const queryExternalResource = async (query: string, blockId: number, locals: App.Locals) => {
  const db = await createDrizzleSupabaseClient(locals.supabase)

  const block = await db((tx) =>
    tx.query.blocks.findFirst({
      where: eq(schema.blocks.id, Number(blockId)),
      with: {
        area: buildNestedAreaQuery(),
      },
    }),
  )

  if (block == null) {
    throw new Error('Block not found')
  }

  const user = await db(async (tx) =>
    locals.session == null
      ? null
      : tx.query.users.findFirst({
          where: eq(schema.users.authUserFk, locals.session.user.id),
        }),
  )

  const userSettings = await db(async (tx) =>
    user == null
      ? null
      : tx.query.userSettings.findFirst({
          where: eq(schema.userSettings.userFk, user.id),
        }),
  )

  let sector: schema.Area | null = null
  let crag: schema.Area | null = null

  let area = block.area as NestedArea
  while (area != null) {
    if (area.type === 'sector') {
      sector = area
    }
    if (area.type === 'crag') {
      crag = area
    }
    area = area.parent as NestedArea
  }

  const normalizedQuery = query.replace(/\(.*\)/g, '').trim()
  const cragName = crag?.name.replace(/\(.*\)/g, '').trim()
  const sectorName = sector?.name.replace(/\(.*\)/g, '').trim()

  const [data8a, data27crags, dataTheCrag] = await Promise.all([
    handler8a.query(normalizedQuery, blockId, cragName, sectorName, userSettings),
    handler27crags.query(normalizedQuery, blockId, cragName, sectorName, userSettings),
    handlerTheCrag.query(normalizedQuery, blockId, cragName, sectorName, userSettings),
  ])

  return { data8a, data27crags, dataTheCrag }
}

export const insertExternalResources = async (route: schema.Route, block: schema.Block, locals: App.Locals) => {
  if (route.name.length === 0) {
    return
  }

  const db = await createDrizzleSupabaseClient(locals.supabase)

  let routeName: string | undefined = route.name.replace(/\(.*\)/g, '').trim()
  let externalResources = await queryExternalResource(routeName, block.id, locals)

  if (
    externalResources?.data8a == null &&
    externalResources?.data27crags == null &&
    externalResources?.dataTheCrag == null
  ) {
    routeName = route.name
      .match(/\(.*\)/)
      ?.at(0)
      ?.replace(/\(|\)/g, '')
      ?.trim()

    if (routeName != null) {
      externalResources = await queryExternalResource(routeName, block.id, locals)
    }
  }

  if (
    externalResources?.data8a == null &&
    externalResources?.data27crags == null &&
    externalResources?.dataTheCrag == null
  ) {
    return
  }

  let resource = await db((tx) =>
    tx.query.routeExternalResources.findFirst({
      where: eq(schema.routeExternalResources.routeFk, route.id),
    }),
  )

  if (resource == null) {
    ;[resource] = await db((tx) => tx.insert(schema.routeExternalResources).values({ routeFk: route.id }).returning())
    await db((tx) =>
      tx.update(schema.routes).set({ externalResourcesFk: resource!.id }).where(eq(schema.routes.id, route.id)),
    )
  }

  const resource8a = await (async () => {
    if (externalResources.data8a == null) {
      return null
    }

    let resource8a = await db((tx) =>
      tx.query.routeExternalResource8a.findFirst({
        where: eq(schema.routeExternalResource8a.externalResourcesFk, resource.id),
      }),
    )

    if (resource8a == null) {
      ;[resource8a] = await db((tx) =>
        tx
          .insert(schema.routeExternalResource8a)
          .values({
            ...externalResources.data8a,
            id: undefined,
            externalResourcesFk: resource.id,
          })
          .returning(),
      )
    }

    return resource8a
  })()

  const resource27crags = await (async () => {
    if (externalResources.data27crags == null) {
      return null
    }

    let resource27crags = await db((tx) =>
      tx.query.routeExternalResource27crags.findFirst({
        where: eq(schema.routeExternalResource27crags.externalResourcesFk, resource.id),
      }),
    )

    if (resource27crags == null) {
      ;[resource27crags] = await db((tx) =>
        tx
          .insert(schema.routeExternalResource27crags)
          .values({
            ...externalResources.data27crags,
            id: undefined,
            externalResourcesFk: resource.id,
          })
          .returning(),
      )
    }

    return resource27crags
  })()

  const resourceTheCrag = await (async () => {
    if (externalResources.dataTheCrag == null) {
      return null
    }

    let resourceTheCrag = await db((tx) =>
      tx.query.routeExternalResourceTheCrag.findFirst({
        where: eq(schema.routeExternalResourceTheCrag.externalResourcesFk, resource.id),
      }),
    )

    if (resourceTheCrag == null) {
      ;[resourceTheCrag] = await db((tx) =>
        tx
          .insert(schema.routeExternalResourceTheCrag)
          .values({
            ...externalResources.dataTheCrag,
            id: undefined,
            externalResourcesFk: resource.id,
          })
          .returning(),
      )
    }

    return resourceTheCrag
  })()

  await db((tx) =>
    tx
      .update(schema.routeExternalResources)
      .set({
        externalResource8aFk: resource8a?.id,
        externalResource27cragsFk: resource27crags?.id,
        externalResourceTheCragFk: resourceTheCrag?.id,
      })
      .where(eq(schema.routeExternalResources.id, resource.id)),
  )

  if (
    externalResources.data27crags?.latitude != null &&
    externalResources.data27crags?.longitude != null &&
    block.geolocationFk == null
  ) {
    const [geolocation] = await db((tx) =>
      tx
        .insert(schema.geolocations)
        .values({
          blockFk: block.id,
          lat: externalResources.data27crags!.latitude!,
          long: externalResources.data27crags!.longitude!,
        })
        .returning(),
    )
    await db((tx) =>
      tx.update(schema.blocks).set({ geolocationFk: geolocation.id }).where(eq(schema.blocks.id, block.id)),
    )
  }
}

export const checkExternalSessions = async (route: schema.Route, locals: App.Locals) => {
  const db = await createDrizzleSupabaseClient(locals.supabase)

  const routeExternalResource = await db((tx) =>
    tx.query.routeExternalResources.findFirst({
      where: eq(schema.routeExternalResources.routeFk, route.id),
    }),
  )

  const user = await db(async (tx) =>
    locals.session == null
      ? null
      : tx.query.users.findFirst({
          where: eq(schema.users.authUserFk, locals.session.user.id),
        }),
  )

  const userSettings = await db(async (tx) =>
    user == null
      ? null
      : tx.query.userSettings.findFirst({
          where: eq(schema.userSettings.userFk, user.id),
        }),
  )

  if (routeExternalResource == null || userSettings == null) {
    return null
  }

  const [session8a, session27crags, sessionTheCrag] = await Promise.all([
    handler8a.checkSession(routeExternalResource.externalResource8aFk, userSettings, locals),
    handler27crags.checkSession(routeExternalResource.externalResource27cragsFk, userSettings, locals),
    handlerTheCrag.checkSession(routeExternalResource.externalResourceTheCragFk, userSettings, locals),
  ])

  return { routeExternalResource, userSettings, session8a, session27crags, sessionTheCrag }
}

export const logExternalAscent = async (
  ascent: schema.Ascent,
  opts: Awaited<ReturnType<typeof checkExternalSessions>>,
  locals: App.Locals,
) => {
  if (opts == null || ascent.type === 'attempt') {
    return
  }

  const { routeExternalResource, userSettings, session8a, session27crags, sessionTheCrag } = opts

  await Promise.all([
    session8a == null
      ? Promise.resolve()
      : handler8a.logAscent(ascent, routeExternalResource.externalResource8aFk, userSettings, session8a, locals),

    session27crags == null
      ? Promise.resolve()
      : handler27crags.logAscent(
          ascent,
          routeExternalResource.externalResource27cragsFk,
          userSettings,
          session27crags,
          locals,
        ),

    sessionTheCrag == null
      ? Promise.resolve()
      : handlerTheCrag.logAscent(
          ascent,
          routeExternalResource.externalResourceTheCragFk,
          userSettings,
          sessionTheCrag,
          locals,
        ),
  ])
}

export * from './27crags.server'
export { default as handler27crags } from './27crags.server'
export * from './8a.server'
export { default as handler8a } from './8a.server'
export * from './thecrag.server'
export { default as handlerTheCrag } from './thecrag.server'
