import { form, getRequestEvent } from '$app/server'
import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
import { insertActivity } from '$lib/components/ActivityFeed/load.server'
import { areas, generateSlug } from '$lib/db/schema'
import { enhanceForm, type Action } from '$lib/forms/enhance.server'
import { areaActionSchema, type AreaActionValues } from '$lib/forms/schemas'
import { error } from '@sveltejs/kit'
import { and, eq } from 'drizzle-orm'

export const createArea = form((data) => enhanceForm(data, areaActionSchema, action))

const action: Action<AreaActionValues> = async (values, db, user) => {
  const { locals } = getRequestEvent()

  const parentArea =
    values.parentFk == null ? undefined : await db.query.areas.findFirst({ where: eq(areas.id, values.parentFk) })

  if (values.parentFk != null && parentArea == null) {
    error(404, 'Parent area not found')
  }

  if (!checkRegionPermission(locals.userRegions, [REGION_PERMISSION_EDIT], values.regionFk)) {
    error(401)
  }

  if (
    parentArea != null &&
    (!checkRegionPermission(locals.userRegions, [REGION_PERMISSION_EDIT], parentArea.regionFk) ||
      values.regionFk !== parentArea.regionFk)
  ) {
    error(401)
  }

  // Generate a slug from the area name
  const slug = generateSlug(values.name)

  // Check if an area with the same slug already exists
  const existingAreasResult = await db.query.areas.findMany({
    where: and(
      eq(areas.slug, slug),
      parentArea == null ? eq(areas.regionFk, values.regionFk) : eq(areas.parentFk, parentArea.id),
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
      .values({ ...values, createdBy: user.id, id: undefined, slug })
      .returning()
  )[0]

  await insertActivity(db, {
    type: 'created',
    userFk: user.id,
    entityId: String(createdArea.id),
    entityType: 'area',
    parentEntityId: createdArea.parentFk == null ? null : String(createdArea.parentFk),
    parentEntityType: 'area',
    regionFk: createdArea.regionFk,
  })

  // Construct the merged path for the new area
  return ['', 'areas', createdArea.id].join('/')
}
