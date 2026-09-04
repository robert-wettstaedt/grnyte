import { command, form, getRequestEvent, query } from '$app/server'
import { createRlsClient, db } from '$lib/db/db.server'
import type { UserRegion } from '$lib/entities/region/dto'
import type { MutationResult } from '$lib/remote/mutation'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { error, redirect, type InvalidField, type RemoteForm, type RemoteFormInput } from '@sveltejs/kit'

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

/**
 * Copy of Kit's unexported `HasNonOptionalBoolean` (`@sveltejs/kit/types/index.d.ts`): a form
 * schema may not carry a required boolean, because an unchecked checkbox sends no value at all.
 * Structurally identical to Kit's, `any` included, so the two can be diffed by eye.
 *
 * Kit enforces it on `form()`'s schema parameter. {@link authedForm} cannot: a conditional sitting
 * where `S` is inferred from blocks inference entirely, collapsing every caller's form to
 * `RemoteForm<RemoteFormInput, unknown>`. It goes on the return type instead, where `S` is already
 * resolved. On a Kit upgrade, check this type against Kit's.
 */
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

/**
 * `form`, but the handler also receives {@link Context} and runs inside the RLS transaction.
 *
 * Overload plus a loose implementation: the signature is the whole contract, and the wider body
 * keeps Kit's deferred schema conditional from needing a cast callers would depend on.
 */
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

/**
 * The 401 gate and an RLS handle, with no transaction wrapped around the caller.
 *
 * For the commands that cannot be an {@link authedCommand}: work that has to take a SECOND,
 * privileged connection while reading through RLS, or that has to run outside the transaction
 * rather than after it (a push send, an irreversible storage teardown). They still want the same
 * gate and the same client, and hand-rolling both per command is how the two drift apart.
 *
 * Returns everything {@link Context} carries, because every caller needs the same values for the
 * permission check that follows and reading them off `locals` separately is half the prelude back.
 * Moving a handler between the two shapes is then a change of wrapper rather than of what it can
 * see.
 *
 * Plus the Supabase client, which `Context` has no reason to expose: the work that cannot sit in a
 * transaction is largely storage work, so the handlers that need this seam are exactly the ones
 * that also need the bucket. One read of `locals`, or the null check goes back to being per-caller.
 */
export async function authedRls(): Promise<{
  rls: Rls
  supabase: App.Locals['supabase']
  user: NonNullable<App.Locals['user']>
  userPermissions: App.Locals['userPermissions']
  userRegions: App.Locals['userRegions']
}> {
  const { claims, supabase, user, userPermissions, userRegions } = getRequestEvent().locals
  if (claims == null || user == null) {
    error(401, 'Not authenticated')
  }

  return { rls: createRlsClient(claims), supabase, user, userPermissions, userRegions }
}

/** before: auth-gate, open an RLS transaction, run the handler inside it; after: drain whatever the
 *  handler deferred to {@link Context.afterCommit}, then log failures. */
async function run<O>(handler: (ctx: Context) => O | Promise<O>): Promise<O> {
  const { claims, user, userPermissions, userRegions } = getRequestEvent().locals
  if (claims == null || user == null) {
    error(401, 'Not authenticated')
  }

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

  // Serially, and outside the transaction, which is the whole point: each is free to take a
  // connection of its own now that this handler is no longer holding one.
  for (const task of deferred) {
    try {
      await task()
    } catch (e) {
      // Logged, never rethrown. The transaction has committed, so letting a notification fan-out
      // fail here would report a mutation that succeeded as a failure, and the user would
      // resubmit into a duplicate-name error for the row they created.
      console.error('[remote] afterCommit task failed', e)
    }
  }

  return returnValue
}
