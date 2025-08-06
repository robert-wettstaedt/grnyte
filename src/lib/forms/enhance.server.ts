import { getRequestEvent } from '$app/server'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import { convertException } from '$lib/errors'
import { error, redirect } from '@sveltejs/kit'
import type { ExtractTablesWithRelations } from 'drizzle-orm'
import type { PgTransaction } from 'drizzle-orm/pg-core'
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js'
import { z } from 'zod'
import type { ActionFailure } from './schemas'
import { validateFormData } from './validate.svelte'

type Schema = typeof schema

export type Action<Output = unknown> = (
  values: Output,
  db: PgTransaction<PostgresJsQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>,
  user: NonNullable<App.SafeSession['user']>,
) => Promise<unknown>

export async function enhance<T = unknown>(values: T, callback: Action<T>) {
  const { locals } = getRequestEvent()

  const rls = await createDrizzleSupabaseClient(locals.supabase)
  let returnValue: Awaited<unknown>

  try {
    returnValue = await rls(async (db) => {
      if (locals.user == null) {
        error(404)
      }

      return await callback(values, db, locals.user)
    })
  } catch (exception) {
    error(400, convertException(exception))
  }

  return returnValue
}

export async function enhanceForm<Output = unknown, Input = Output>(
  formData: FormData,
  schema: z.ZodType<Output, Input>,
  callback: Action<Output>,
) {
  const returnValue = await enhance(formData, async (values, db, user) => {
    let validated: Output

    try {
      // Validate the form data
      validated = await validateFormData(schema, values)
    } catch (exception) {
      const failure = exception as ActionFailure<Output>
      error(failure.status, failure.data.error)
    }

    return await callback(validated, db, user)
  })

  if (typeof returnValue === 'string') {
    redirect(303, returnValue)
  }

  return returnValue
}
