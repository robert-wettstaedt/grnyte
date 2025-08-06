import { form } from '$app/server'
import { createRegionAction } from '$lib/forms/actions.server'
import { enhanceForm } from '$lib/forms/enhance.server'
import { regionActionSchema } from '$lib/forms/schemas'

export const createRegion = form((data) => enhanceForm(data, regionActionSchema, createRegionAction))
