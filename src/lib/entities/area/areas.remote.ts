import { areas, areaTypeEnum } from '$lib/db/schema'
import { formError, stringToInt } from '$lib/forms/schemas'
import { authedForm } from '$lib/server/remote'
import { error } from '@sveltejs/kit'
import { and, eq } from 'drizzle-orm'
import z from 'zod'
import { canAddArea } from './permissions'

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

export const createArea = authedForm(areaActionSchema, async (value, { db, user, userRegions }) => {
  const parentArea =
    value.parentFk == null ? undefined : await db.query.areas.findFirst({ where: eq(areas.id, value.parentFk) })

  if (value.parentFk != null && parentArea == null) {
    error(404, 'Parent area not found')
  }

  if (!canAddArea(userRegions, value)) {
    error(401)
  }

  if (parentArea != null && !canAddArea(userRegions, parentArea)) {
    error(401)
  }

  // Check if an area with the same name already exists
  const existingAreasResult = await db.query.areas.findMany({
    where: and(
      eq(areas.name, value.name),
      parentArea == null ? eq(areas.regionFk, value.regionFk) : eq(areas.parentFk, parentArea.id),
    ),
  })

  if (existingAreasResult.length > 0) {
    // If an area with the same name exists, return a 400 error with a message
    error(400, `Area with name "${existingAreasResult[0].name}" already exists`)
  }

  // Insert the new area into the database
  const createdArea = (
    await db
      .insert(areas)
      .values({ ...value, createdBy: user.id, id: undefined })
      .returning()
  )[0]

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
  return ['', 'areas', createdArea.id].join('/')
})
