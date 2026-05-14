import { form, getRequestEvent } from '$app/server'
import { APP_PERMISSION_ADMIN, checkAppPermission, checkRegionPermission, REGION_PERMISSION_ADMIN } from '$lib/auth'
import { regionMembers, regions } from '$lib/db/schema'
import { convertException } from '$lib/errors'
import { enhanceForm, type Action } from '$lib/forms/enhance.server'
import {
  regionActionSchema,
  regionSettingsSchema,
  stringToInt,
  type RegionActionValues,
  type RegionSettings,
} from '$lib/forms/schemas'
import { error } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const updateRegionSchema = z.intersection(
  z.object({
    regionId: stringToInt,
  }),
  regionActionSchema,
)
type UpdateRegionValues = z.infer<typeof updateRegionSchema>

export const updateRegion = form(updateRegionSchema, (data) => enhanceForm(data, updateRegionAction))

const updateRegionAction: Action<UpdateRegionValues> = async (values, db, user) => {
  const { locals } = getRequestEvent()

  if (
    !(
      checkAppPermission(locals.userPermissions, [APP_PERMISSION_ADMIN]) ||
      checkRegionPermission(locals.userRegions, [REGION_PERMISSION_ADMIN], Number(values.regionId))
    )
  ) {
    error(401)
  }

  let settings: RegionSettings

  try {
    const parsedSettings = JSON.parse(values.settings ?? '{}')
    settings = await z.parseAsync(regionSettingsSchema, parsedSettings)
  } catch (exception) {
    error(400, convertException(exception))
  }

  await db
    .update(regions)
    .set({ ...values, settings })
    .where(eq(regions.id, Number(values.regionId)))

  return ['', 'settings', 'regions', values.regionId].join('/')
}
