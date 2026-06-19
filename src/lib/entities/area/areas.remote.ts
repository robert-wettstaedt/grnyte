import { resolve } from '$app/paths'
import { areas, areaTypeEnum } from '$lib/db/schema'
import { formError, stringToInt } from '$lib/forms/schemas'
import { authedForm } from '$lib/server/remote'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { invalid } from '@sveltejs/kit'
import { and, eq, isNull, not } from 'drizzle-orm'
import z from 'zod'
import { canAddArea, canEditArea } from './permissions'

const areaActionSchema = z.object({
  description: z.string().optional().default(''),
  id: stringToInt.optional(),
  name: z
    .string({ error: formError('form_required') })
    .trim()
    .min(3, { error: formError('form_charsMin', { count: 3 }) }),
  parentFk: stringToInt.optional(),
  regionFk: stringToInt,
  type: z.enum(areaTypeEnum).default('area'),
})

/** Field shape the shared area form (`AreaFormFields`) binds to — same for create and edit. */
export type AreaFormInput = StandardSchemaV1.InferInput<typeof areaActionSchema>

export const createArea = authedForm(areaActionSchema, async (value, { db, user, userRegions }, issue) => {
  const parentArea =
    value.parentFk == null ? undefined : await db.query.areas.findFirst({ where: eq(areas.id, value.parentFk) })

  if (value.parentFk != null && parentArea == null) {
    invalid(formError('area_parentNotFound'))
  }

  if (!canAddArea(userRegions, value) || (parentArea != null && !canAddArea(userRegions, parentArea))) {
    invalid(formError('form_noPermission'))
  }

  const existingAreasResult = await db.query.areas.findMany({
    where: and(
      eq(areas.name, value.name),
      parentArea == null ? eq(areas.regionFk, value.regionFk) : eq(areas.parentFk, parentArea.id),
    ),
  })

  if (existingAreasResult.length > 0) {
    invalid(issue.name(formError('areas_nameExists', { name: existingAreasResult[0].name })))
  }

  const [createdArea] = await db
    .insert(areas)
    .values({ ...value, createdBy: user.id, id: undefined })
    .returning()

  // TODO: add later when activities are implemented
  // await insertActivity(db, {
  //   type: 'created',
  //   userFk: user.id,
  //   entityId: String(createdArea.id),
  //   entityType: 'area',
  //   parentEntityId: createdArea.parentFk == null ? null : String(createdArea.parentFk),
  //   parentEntityType: 'area',
  //   regionFk: createdArea.regionFk,
  // })

  // Construct the merged path for the new area
  return resolve('/(app)/areas/[id]', { id: createdArea.id.toString() })
})

export const updateArea = authedForm(areaActionSchema, async ({ id, ...value }, { db, userRegions }, issue) => {
  const area = id == null ? undefined : await db.query.areas.findFirst({ where: eq(areas.id, id) })

  if (area == null) {
    invalid(formError('area_parentNotFound'))
  }

  if (!canEditArea(userRegions, value)) {
    invalid(formError('form_noPermission'))
  }

  const existingAreasResult = await db.query.areas.findMany({
    where: and(
      eq(areas.name, value.name),
      area.parentFk == null ? isNull(areas.parentFk) : eq(areas.parentFk, area.parentFk),
      not(eq(areas.id, area.id)),
    ),
  })

  if (existingAreasResult.length > 0) {
    invalid(issue.name(formError('areas_nameExists', { name: existingAreasResult[0].name })))
  }

  await db
    .update(areas)
    .set({ ...value, id: area.id })
    .where(eq(areas.id, area.id))

  // await createUpdateActivity({
  //   db,
  //   entityId: String(area.id),
  //   entityType: 'area',
  //   newEntity: entity,
  //   oldEntity: area,
  //   userFk: user.id,
  //   parentEntityId: String(area.parentFk),
  //   parentEntityType: 'area',
  //   regionFk: area.regionFk,
  // })

  return resolve('/(app)/areas/[id]', { id: area.id.toString() })
})
