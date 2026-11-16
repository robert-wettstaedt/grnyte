import { command, query } from '$app/server'
import { IDENTITY_TARGETS } from '$lib/auth'
import * as z from '$lib/forms/zod'
import * as body from './identities.server'

export const signInMethodsQuery = query(body.signInMethodsQuery)

/** Removes a provider behind an `identity.unlink` grant, which the identity trigger spends. */
export const unlinkProvider = command(z.object({ provider: z.enum(IDENTITY_TARGETS) }), body.unlinkProvider)
