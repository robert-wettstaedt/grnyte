import { getRequestEvent, query } from '$app/server'
import * as z from '$lib/forms/zod'
import { authedQuery } from '$lib/remote/authed.server'
import { requireAppAdmin } from '$lib/remote/require.server'
import { error } from '@sveltejs/kit'
import { readDecisions } from './admin.server'
import { removalTargetSchema } from './dto'
import { canModerate } from './permissions'
import { previewRemoval } from './preview.server'
import { readStatement } from './statement.server'

export const removalPreview = authedQuery(removalTargetSchema, (args, ctx) => previewRemoval(args, ctx))

export const removalStatement = query(z.int().check(z.positive()), (decisionId) => {
  const { locals } = getRequestEvent()
  return readStatement(decisionId, locals)
})

export const listDecisions = query(() => {
  requireAppAdmin(getRequestEvent().locals.userPermissions)
  return readDecisions()
})

export const listRegionDecisions = query(z.object({ regionFk: z.int().check(z.positive()) }), ({ regionFk }) => {
  if (!canModerate(getRequestEvent().locals.userRegions, regionFk)) error(403)
  return readDecisions(regionFk)
})
