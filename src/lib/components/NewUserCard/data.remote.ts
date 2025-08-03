import { form } from '$app/server'
import { createRegionAction } from '$lib/forms/actions.server'
import { enhance } from '$lib/forms/enhance.server'

export const createRegion = form(async (data) => {
  return enhance(data, createRegionAction)
})
