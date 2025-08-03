import { getRequestEvent } from '$app/server'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import { error, isRedirect, redirect } from '@sveltejs/kit'
import type { ExtractTablesWithRelations } from 'drizzle-orm'
import type { PgTransaction } from 'drizzle-orm/pg-core'
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js'

type Schema = typeof schema
export type Action<T = any> = (
  formData: FormData,
  db: PgTransaction<PostgresJsQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>,
  user: NonNullable<App.SafeSession['user']>,
) => Promise<T>

export async function enhance<T>(formData: FormData, callback: Action<T>) {
  const { locals } = getRequestEvent()

  const rls = await createDrizzleSupabaseClient(locals.supabase)

  const returnValue = await rls(async (db) => {
    if (locals.user == null) {
      error(404)
    }

    return callback(formData, db, locals.user)
  })

  if (typeof returnValue === 'string') {
    redirect(303, returnValue)
  }

  return returnValue
}
