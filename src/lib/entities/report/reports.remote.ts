import { getRequestEvent, query } from '$app/server'
import { removalTargetSchema } from '$lib/entities/moderation/dto'
import { canModerate } from '$lib/entities/moderation/permissions'
import * as z from '$lib/forms/zod'
import { authedQuery } from '$lib/remote/authed.server'
import { error } from '@sveltejs/kit'
import { readRegionReports } from './queue.server'
import { previewReport } from './report.server'

export const reportPreview = authedQuery(removalTargetSchema, (args, ctx) => previewReport(args, ctx))

export const listRegionReports = query(z.object({ regionFk: z.int().check(z.positive()) }), ({ regionFk }) => {
  const { user, userRegions } = getRequestEvent().locals
  if (user == null || !canModerate(userRegions, regionFk)) error(403)
  return readRegionReports(regionFk, user.id)
})
