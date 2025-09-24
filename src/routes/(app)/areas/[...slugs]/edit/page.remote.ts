import { command, form, getRequestEvent } from '$app/server'
import { checkRegionPermission, REGION_PERMISSION_DELETE, REGION_PERMISSION_EDIT } from '$lib/auth'
import { createUpdateActivity, insertActivity } from '$lib/components/ActivityFeed/load.server'
import { areas, generateSlug, geolocations } from '$lib/db/schema'
import { buildNestedAreaQuery } from '$lib/db/utils'
import { areaWithPathname } from '$lib/db/utils.svelte'
import type { RowWithRelations } from '$lib/db/zero'
import { enhance, enhanceForm, type Action } from '$lib/forms/enhance.server'
import { areaActionSchema, type AreaActionValues } from '$lib/forms/schemas'
import { deleteFiles } from '$lib/helper.server'
import { getReferences } from '$lib/references.server'
import { error } from '@sveltejs/kit'
import { and, eq, isNull, not } from 'drizzle-orm'
import z from 'zod'

export const updateArea = form(areaActionSchema, (data) => enhanceForm(data, updateAreaAction))

export const deleteArea = command(z.number(), (id) => enhance(id, deleteAreaAction))

const updateAreaAction: Action<AreaActionValues> = async (values, db, user) => {
  const { locals } = getRequestEvent()
  const { id, ...entity } = values

  const area =
    id == null
      ? undefined
      : await db.query.areas.findFirst({ where: eq(areas.id, id), with: { parent: buildNestedAreaQuery() } })

  if (area == null || !checkRegionPermission(locals.userRegions, [REGION_PERMISSION_EDIT], area.regionFk)) {
    error(404)
  }

  // Generate a slug from the area name
  const slug = generateSlug(entity.name)

  // Check if an area with the same slug already exists
  const existingAreasResult = await db.query.areas.findMany({
    where: and(
      eq(areas.slug, slug),
      area.parentFk == null ? isNull(areas.parentFk) : eq(areas.parentFk, area.parentFk),
      not(eq(areas.id, area.id)),
    ),
  })

  if (existingAreasResult.length > 0) {
    // If an area with the same name exists, return a 400 error with a message
    error(400, `Area with name "${existingAreasResult[0].name}" already exists`)
  }

  // Update the area in the database with the validated values
  await db
    .update(areas)
    .set({ ...entity, id: area.id, slug })
    .where(eq(areas.id, area.id))

  await createUpdateActivity({
    db,
    entityId: String(area.id),
    entityType: 'area',
    newEntity: entity,
    oldEntity: area,
    userFk: user.id,
    parentEntityId: String(area.parentFk),
    parentEntityType: 'area',
    regionFk: area.regionFk,
  })

  const nested = { ...area, slug } as unknown as RowWithRelations<'areas', { parent: true }>
  const { pathname } = areaWithPathname(nested) ?? {}
  return pathname
}

const deleteAreaAction: Action<number> = async (areaId, db, user) => {
  const { locals } = getRequestEvent()

  // Query the database to find the area with the given areaId
  const area = await db.query.areas.findFirst({
    where: eq(areas.id, areaId),
    with: {
      areas: true,
      blocks: true,
    },
  })

  if (area == null || !checkRegionPermission(locals.userRegions, [REGION_PERMISSION_DELETE], area.regionFk)) {
    error(404)
  }

  if (area.areas.length > 0) {
    error(400, `${area.name} has ${area.areas.length} subareas. Delete subareas first.`)
  }

  if (area.blocks.length > 0) {
    error(400, `${area.name} has ${area.blocks.length} blocks. Delete blocks first.`)
  }

  const references = await getReferences(area.id, 'areas')
  if (references.areas.length + references.ascents.length + references.routes.length > 0) {
    error(400, 'Area is referenced by other entities. Delete references first.')
  }

  await deleteFiles({ areaFk: area.id }, db)

  await db.delete(geolocations).where(eq(geolocations.areaFk, areaId))
  await db.update(areas).set({ parentFk: null }).where(eq(areas.parentFk, areaId))
  await db.delete(areas).where(eq(areas.id, areaId))
  await insertActivity(db, {
    type: 'deleted',
    userFk: user.id,
    entityId: String(areaId),
    entityType: 'area',
    oldValue: area.name,
    parentEntityId: String(area.parentFk),
    parentEntityType: 'area',
    regionFk: area.regionFk,
  })

  return ['', 'areas', area.parentFk].filter((i) => i != null).join('/')
}
