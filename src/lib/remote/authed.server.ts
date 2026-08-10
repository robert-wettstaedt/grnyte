import { command, form, getRequestEvent, query } from '$app/server'
import { createDrizzleSupabaseClient, db } from '$lib/db/db.server'
import type { UserRegion } from '$lib/entities/region/dto'
import type { MutationResult } from '$lib/remote/mutation'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { error, redirect, type InvalidField, type RemoteFormInput } from '@sveltejs/kit'

/** Injected into every wrapped handler. Add shared per-call deps here. */
export interface Context {
  /**
   * Defer work until the handler's transaction has committed.
   *
   * For the writes that cannot join it: anything on the privileged `db` handle (the notification
   * fan-out) needs a SECOND connection, and taking one while this handler is holding one out of
   * the same ten-slot pool deadlocks it under load. Deferring also means such a write cannot
   * announce a change that then rolled back, and that it reads committed state rather than the
   * transaction's private view.
   *
   * Tasks run in the order they were queued, after the transaction closes and before the handler's
   * value is returned. A handler that throws never reaches them.
   */
  afterCommit: (task: () => Promise<void>) => void
  db: Tx
  user: NonNullable<App.Locals['user']>
  userPermissions: App.Locals['userPermissions']
  userRegions: UserRegion[]
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** `command`, but the handler also receives {@link Context} and runs inside the RLS transaction. */
export function authedCommand<S extends StandardSchemaV1, O>(
  schema: S,
  handler: (input: StandardSchemaV1.InferOutput<S>, ctx: Context) => Promise<MutationResult<O> | void>,
) {
  return command(schema, (input) => run((ctx) => handler(input, ctx)))
}

/** `form`, but the handler also receives {@link Context} and runs inside the RLS transaction. */
export function authedForm<S extends StandardSchemaV1<RemoteFormInput, Record<string, unknown>>, O>(
  schema: S,
  handler: (
    data: StandardSchemaV1.InferOutput<S>,
    ctx: Context,
    issue: InvalidField<StandardSchemaV1.InferInput<S>>,
  ) => Promise<MutationResult<O> | void>,
) {
  return form(schema, async (data, issue) => {
    const value = await run(async (ctx) => handler(data, ctx, issue))

    if (value?.redirectTo != null) {
      redirect(303, value.redirectTo)
    }

    return value
  })
}

/** `query`, but the handler also receives {@link Context} and runs inside the RLS transaction. */
export function authedQuery<S extends StandardSchemaV1, O>(
  schema: S,
  handler: (input: StandardSchemaV1.InferOutput<S>, ctx: Context) => O | Promise<O>,
) {
  return query(schema, (input) => run((ctx) => handler(input, ctx)))
}

/** before: auth-gate, open an RLS transaction, run the handler inside it; after: drain whatever the
 *  handler deferred to {@link Context.afterCommit}, then log failures. */
async function run<O>(handler: (ctx: Context) => O | Promise<O>): Promise<O> {
  const { supabase, user, userPermissions, userRegions } = getRequestEvent().locals
  if (user == null) {
    error(401, 'Not authenticated')
  }

  let returnValue: Awaited<O>
  const deferred: (() => Promise<void>)[] = []

  const rls = await createDrizzleSupabaseClient(supabase)
  try {
    returnValue = await rls(async (db) =>
      handler({ afterCommit: (task) => void deferred.push(task), db, user, userPermissions, userRegions }),
    )
  } catch (e) {
    console.error('[remote] handler failed', e)
    throw e
  }

  // Serially, and outside the transaction, which is the whole point: each is free to take a
  // connection of its own now that this handler is no longer holding one.
  for (const task of deferred) {
    await task()
  }

  return returnValue
}
