import { command, form, getRequestEvent, query } from '$app/server'
import { createRlsClient, db } from '$lib/db/db.server'
import type { UserRegion } from '$lib/entities/region/dto'
import { formError } from '$lib/forms/schemas'
import { logServerFailure } from '$lib/logging/failure.server'
import { stringifyError } from '$lib/logging/stringify'
import type { MutationResult } from '$lib/remote/mutation'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { error, redirect, type InvalidField, type RemoteForm, type RemoteFormInput } from '@sveltejs/kit'

/** Injected into every wrapped handler. Add shared per-call deps here. */
export interface Context {
  /** Defer work until after the transaction commits. A write on the privileged `db` handle needs
   *  a second connection, and taking one while this handler holds one deadlocks the pool. */
  afterCommit: (task: () => Promise<void>) => void
  db: Tx
  user: NonNullable<App.Locals['user']>
  userPermissions: App.Locals['userPermissions']
  userRegions: UserRegion[]
}

/** Copy of Kit's unexported `HasNonOptionalBoolean`: a form schema may not carry a required
 *  boolean, since an unchecked checkbox sends no value. Re-check it on a Kit upgrade. */
type HasNonOptionalBoolean<T> = 0 extends 1 & T
  ? never
  : [T] extends [boolean]
    ? true
    : T extends Array<infer U>
      ? HasNonOptionalBoolean<U>
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        T extends Record<string, any>
        ? { [K in keyof T]: HasNonOptionalBoolean<T[K]> }[keyof T]
        : never

type Rls = ReturnType<typeof createRlsClient>

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** `command`, but the handler also receives {@link Context} and runs inside the RLS transaction. */
export function authedCommand<S extends StandardSchemaV1, O>(
  schema: S,
  handler: (input: StandardSchemaV1.InferOutput<S>, ctx: Context) => Promise<MutationResult<O> | void>,
) {
  return command(schema, (input) => run((ctx) => handler(input, ctx)))
}

/** `form`, but the handler also receives {@link Context} and runs inside the RLS transaction.
 *  Overload plus a loose body: a conditional where `S` is inferred would collapse inference. */
export function authedForm<S extends StandardSchemaV1<RemoteFormInput, Record<string, unknown>>, O>(
  schema: S,
  handler: (
    data: StandardSchemaV1.InferOutput<S>,
    ctx: Context,
    issue: InvalidField<StandardSchemaV1.InferInput<S>>,
  ) => Promise<MutationResult<O> | void>,
): true extends HasNonOptionalBoolean<StandardSchemaV1.InferInput<S>>
  ? 'Error: All booleans in form schemas must be optional (e.g. `z.boolean().optional()`) because checkbox inputs do not send a false value when unchecked.'
  : RemoteForm<StandardSchemaV1.InferInput<S>, MutationResult<O> | void>
export function authedForm(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any,
  handler: (data: never, ctx: Context, issue: never) => Promise<MutationResult<unknown> | void>,
) {
  return form(schema, async (data, issue) => {
    const value = await run(async (ctx) => handler(data as never, ctx, issue as never))

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

/** The auth gate and an RLS handle, without a transaction: for work needing a second connection,
 *  or that must run outside the transaction rather than after it (a push send, a storage teardown). */
export async function authedRls(): Promise<{
  rls: Rls
  supabase: App.Locals['supabase']
  user: NonNullable<App.Locals['user']>
  userPermissions: App.Locals['userPermissions']
  userRegions: App.Locals['userRegions']
}> {
  const { claims, user } = requireAuthed()
  const { supabase, userPermissions, userRegions } = getRequestEvent().locals

  return { rls: createRlsClient(claims), supabase, user, userPermissions, userRegions }
}

/** The auth gate alone, for handlers that want neither the transaction nor the RLS client.
 *  `user == null` is either a downed backend or a half-completed sign-up; only the first is a 503. */
export function requireAuthed(): {
  claims: NonNullable<App.Locals['claims']>
  user: NonNullable<App.Locals['user']>
} {
  const { backendUnavailable, claims, user } = getRequestEvent().locals

  if (backendUnavailable) {
    error(503, formError('error_serviceUnavailable'))
  }
  if (claims == null || user == null) {
    error(401, formError('auth_notSignedIn'))
  }

  return { claims, user }
}

/** before: auth-gate, open an RLS transaction, run the handler inside it; after: drain whatever the
 *  handler deferred to {@link Context.afterCommit}, then log failures. */
async function run<O>(handler: (ctx: Context) => O | Promise<O>): Promise<O> {
  const { claims, user } = requireAuthed()
  const { userPermissions, userRegions } = getRequestEvent().locals

  let returnValue: Awaited<O>
  const deferred: (() => Promise<void>)[] = []

  const rls = createRlsClient(claims)
  try {
    returnValue = await rls(async (db) =>
      handler({ afterCommit: (task) => void deferred.push(task), db, user, userPermissions, userRegions }),
    )
  } catch (e) {
    console.error('[remote] handler failed', e)
    throw e
  }

  // Outside the transaction, so each task is free to take a connection of its own.
  for (const task of deferred) {
    try {
      await task()
    } catch (e) {
      // Logged, never rethrown: the transaction has committed, so a failed fan-out must not
      // report a succeeded mutation as a failure. Recorded because of that: the caller was told
      // the mutation succeeded, so nothing else carries this.
      console.error('[remote] afterCommit task failed', e)
      await logServerFailure('remote', `afterCommit task failed: ${stringifyError(e)}`)
    }
  }

  return returnValue
}
