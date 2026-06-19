import { command, form, getRequestEvent, query } from '$app/server'
import { createDrizzleSupabaseClient, db } from '$lib/db/db.server'
import type { UserRegion } from '$lib/entities/region/dto'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { error, redirect, type InvalidField, type RemoteFormInput } from '@sveltejs/kit'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** Injected into every wrapped handler. Add shared per-call deps here. */
export interface Context {
  user: NonNullable<App.Locals['user']>
  userPermissions: App.Locals['userPermissions']
  userRegions: UserRegion[]
  db: Tx
}

/** before: auth-gate, open an RLS transaction, run the handler inside it; after: log failures. */
async function run<O>(handler: (ctx: Context) => O | Promise<O>): Promise<O> {
  const { user, userPermissions, userRegions, supabase } = getRequestEvent().locals
  if (user == null) {
    error(401, 'Not authenticated')
  }

  let returnValue: Awaited<O>

  const rls = await createDrizzleSupabaseClient(supabase)
  try {
    returnValue = await rls(async (db) => handler({ user, userPermissions, userRegions, db }))
  } catch (e) {
    console.error('[remote] handler failed', e)
    throw e
  }

  return returnValue
}

/** `command`, but the handler also receives {@link Context} and runs inside the RLS transaction. */
export function authedCommand<S extends StandardSchemaV1, O>(
  schema: S,
  handler: (input: StandardSchemaV1.InferOutput<S>, ctx: Context) => O | Promise<O>,
) {
  return command(schema, (input) => run((ctx) => handler(input, ctx)))
}

/** `query`, but the handler also receives {@link Context} and runs inside the RLS transaction. */
export function authedQuery<S extends StandardSchemaV1, O>(
  schema: S,
  handler: (input: StandardSchemaV1.InferOutput<S>, ctx: Context) => O | Promise<O>,
) {
  return query(schema, (input) => run((ctx) => handler(input, ctx)))
}

/** `form`, but the handler also receives {@link Context} and runs inside the RLS transaction. */
export function authedForm<S extends StandardSchemaV1<RemoteFormInput, Record<string, unknown>>, O>(
  schema: S,
  handler: (
    data: StandardSchemaV1.InferOutput<S>,
    ctx: Context,
    issue: InvalidField<StandardSchemaV1.InferInput<S>>,
  ) => O | Promise<O>,
) {
  return form(schema, async (data, issue) => {
    const value = await run(async (ctx) => handler(data, ctx, issue))

    if (typeof value === 'string') {
      redirect(303, value)
    }

    return value
  })
}
