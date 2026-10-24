import { command, getRequestEvent, query } from '$app/server'
import * as z from '$lib/forms/zod'
import { authedQuery } from '$lib/remote/authed.server'
import { requireAppAdmin } from '$lib/remote/require.server'
import { error } from '@sveltejs/kit'
import { readDecisions, reverseById } from './admin.server'
import { removalTargetSchema } from './dto'
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

export const reverseDecisionCommand = command(z.int().check(z.positive()), async (decisionId) => {
  const { locals } = getRequestEvent()
  requireAppAdmin(locals.userPermissions)
  if (locals.user == null) error(401)
  await reverseById(decisionId, locals.user)
  await listDecisions().refresh()
})
