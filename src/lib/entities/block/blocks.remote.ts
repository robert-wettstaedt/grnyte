import { resolve } from '$app/paths'
import { areas, blocks, geolocations } from '$lib/db/schema'
import { formError, optionalCoordinate, stringToInt } from '$lib/forms/schemas'
import { authedForm } from '$lib/remote/authed.server'
import { invalid } from '@sveltejs/kit'
import { count, eq } from 'drizzle-orm'
import z from 'zod'
import { insertActivity } from '../activity/activity.server'
import { canAddBlock } from '../area/permissions'

const createBlockSchema = z.object({
  areaId: stringToInt,
  lat: optionalCoordinate(90),
  long: optionalCoordinate(180),
  name: z.string().trim().optional().default(''),
})

/** Field shape the add-block form binds to. */
export type CreateBlockInput = z.input<typeof createBlockSchema>

/** Create a block under a crag (or a still-untyped area, which a block turns into a crag).
 *  Location is optional — when given, a geolocation row is created and linked both ways. */
export const createBlock = authedForm(createBlockSchema, async (value, { db, user, userRegions }, issue) => {
  const area = await db.query.areas.findFirst({ where: eq(areas.id, value.areaId) })

  if (area == null) {
    invalid(formError('area_parentNotFound'))
  }

  if (!canAddBlock(userRegions, area)) {
    invalid(formError('form_noPermission'))
  }

  // Reject a duplicate name in the same area. Skip blank names: those render as
  // "Block {order}" (see the mapper), so several unnamed blocks are fine.
  const existingBlock =
    value.name.length === 0
      ? null
      : await db.query.blocks.findFirst({
          where: (table, { and, eq }) => and(eq(table.name, value.name), eq(table.areaFk, value.areaId)),
        })

  if (existingBlock != null) {
    invalid(issue.name(formError('blocks_nameExists', { name: existingBlock.name })))
  }

  const [blocksCount] = await db.select({ count: count() }).from(blocks).where(eq(blocks.areaFk, value.areaId))

  // Optional location: a geolocation row the block points at via `geolocationFk`.
  let geolocationFk: number | undefined
  if (value.lat != null && value.long != null) {
    const [geolocation] = await db
      .insert(geolocations)
      .values({ lat: value.lat, long: value.long, regionFk: area.regionFk })
      .returning()
    geolocationFk = geolocation.id
  }

  const [block] = await db
    .insert(blocks)
    .values({
      areaFk: value.areaId,
      createdBy: user.id,
      geolocationFk,
      name: value.name.trim(),
      order: blocksCount.count + 1,
      regionFk: area.regionFk,
    })
    .returning()

  if (geolocationFk != null) {
    // Back-link the geolocation to its block (mirrors parking's areaFk link).
    await db.update(geolocations).set({ blockFk: block.id }).where(eq(geolocations.id, geolocationFk))
  }

  // The first block fixes a still-undetermined area as a crag (mirrors createArea's parent → 'area').
  if (area.type == null) {
    await db.update(areas).set({ type: 'crag' }).where(eq(areas.id, value.areaId))
  }

  await insertActivity(db, {
    type: 'created',
    userFk: user.id,
    entityId: String(block.id),
    entityType: 'block',
    parentEntityId: String(value.areaId),
    parentEntityType: 'area',
    regionFk: block.regionFk,
  })

  return { redirectTo: resolve('/(app)/(shell)/(map)/blocks/[id]', { id: String(block.id) }) }
})
