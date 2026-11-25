import { getRequestEvent, query } from '$app/server'
import { requireLiveSession } from '$lib/auth/server/session.server'
import { applyRls } from '$lib/db/db.server'
import { formError } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import { requireAuthed } from '$lib/remote/authed.server'
import { getQuery, InputValidationError, isQuery } from '@rocicorp/zero'
import { error } from '@sveltejs/kit'
import { sql } from 'drizzle-orm'
import { queries } from './queries'
import { dbProvider } from './server/mutate.server'

/** A registered query run on the app server as the caller, behind its own region filter and row-level security:
 *  nothing a caller may not already sync through `/api/zero/get-queries`. */
export const readQuery = query(
  z.object({ args: z.unknown(), as: z.string(), name: z.string() }),
  async ({ args, as, name }): Promise<unknown> => {
    requireAuthed()
    const claims = await requireLiveSession()
    // The cookie is every tab's: a tab still showing the account before a switch must not read as the next one.
    if (as !== claims.sub) error(409)
    const { userPermissions, userRegions } = getRequestEvent().locals
    // Missing means unread, and a definition without memberships filters nothing.
    if (userRegions == null) error(500, formError('error_server_title'))

    const definition = getQuery(queries, name)
    // A namespace or an inherited name is found too.
    if (!isQuery(definition)) error(400)
    const ctx = { authUserId: claims.sub, pageState: { userPermissions, userRegions } }

    try {
      return await dbProvider.transaction(async (tx) => {
        const db = tx.dbTransaction.wrappedTransaction
        await applyRls(db, claims)
        // A definition's `limit` is the caller's to choose, and the pool is ten connections.
        await db.execute(sql`select set_config('statement_timeout', '10s', true)`)
        return tx.run(definition.fn({ args, ctx } as never) as never)
      })
    } catch (e) {
      if (e instanceof InputValidationError) error(400)
      throw e
    }
  },
)
