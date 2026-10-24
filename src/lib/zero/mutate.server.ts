import { db } from '$lib/db/db.server'
import { pinnedTx } from '$lib/db/pinned.server'
import { isAuthoredMessage } from '$lib/forms/issue'
import { formError } from '$lib/forms/schemas'
import { loadSessionUser } from '$lib/hooks/auth.server'
import { drainAfterCommit } from '$lib/remote/authed.server'
import { mustGetMutator } from '@rocicorp/zero'
import { handleMutateRequest } from '@rocicorp/zero/server'
import { zeroDrizzle } from '@rocicorp/zero/server/adapters/drizzle'
import { error } from '@sveltejs/kit'
import { zeroCaller } from './caller.server'
import { serverMutators } from './mutators.server'
import type { ServerMutatorContext } from './serverMutator.server'
import { schema } from './zero-schema'

const dbProvider = zeroDrizzle(schema, db)

type Failure = { details?: unknown; message?: string }

/** zero-cache's push endpoint. Auth mirrors `get-queries`: the token arrives as a header. */
export async function handleMutate(request: Request, registry = serverMutators): Promise<Response> {
  // Pinned like every other read: an unqualified query on a bare pooled connection is the 42P01 outage.
  const caller = await zeroCaller(request, (authUserId) => pinnedTx((tx) => loadSessionUser(tx, authUserId)))

  // 401 even for expiry, unlike get-queries: `needs-auth` keeps queued writes and resends them after
  // `connect({ auth })`, where the `error` state a 502 ends in rejects them.
  if (!caller.ok || caller.extra == null) {
    error(401)
  }
  const { claims, extra: user, permissions, userRegions } = caller
  const authUserId = claims.sub

  const deferred: (() => Promise<void>)[] = []

  const result = await handleMutateRequest({
    dbProvider,
    handler: async (transact) => {
      const mine: (() => Promise<void>)[] = []
      const ctx: ServerMutatorContext = {
        afterCommit: (task) => void mine.push(task),
        claims,
        user,
        userPermissions: permissions.userPermissions,
        userRegions,
      }
      const response = await transact((tx, name, args) => {
        // Zero re-runs a mutator whose `retryOn` says so; the attempt it abandons rolled back.
        mine.length = 0
        return mustGetMutator(registry, name).fn({ args, ctx, tx: tx as never })
      })
      // A refused mutation rolled back, so its deferred work must not run.
      if (!('error' in response.result)) {
        deferred.push(...mine)
      }
      return response
    },
    request,
    userID: authUserId,
  })

  await drainAfterCommit(deferred)

  return Response.json(scrubbed(result))
}

/** Zero reports a failure of its own queries (SQL with parameters) as the mutation's message, so
 *  only messages we authored with `formError` reach the client. */
function scrubbed<T extends object>(response: T): T {
  const scrub = <F extends Failure>(failure: F): F => {
    if (failure.message == null || isAuthoredMessage(failure.message)) {
      return failure
    }
    console.error('[mutate] zero failure', failure.message)
    return { ...failure, details: undefined, message: formError('error_server_title') }
  }

  if ('mutations' in response && Array.isArray(response.mutations)) {
    const mutations = response.mutations.map((mutation: { result: Failure & { error?: string } }) =>
      mutation.result.error == null ? mutation : { ...mutation, result: scrub(mutation.result) },
    )
    return { ...response, mutations }
  }
  return 'message' in response ? (scrub(response as Failure) as T) : response
}
