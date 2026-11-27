import { PINNED_SEARCH_PATH } from '$lib/db/db.server'
import { pinnedTx } from '$lib/db/pinned.server'
import { appliedWrites } from '$lib/db/schema'
import { isAuthoredMessage } from '$lib/forms/issue'
import { formError } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import { drainAfterCommit } from '$lib/remote/authed.server'
import { ApplicationError, getMutator, InputValidationError, isMutator } from '@rocicorp/zero'
import { error } from '@sveltejs/kit'
import { eq, lt, sql } from 'drizzle-orm'
import { serverMutators } from '../mutators.server'
import { dbProvider, mutationCaller } from './mutate.server'
import type { RefusalDetails, ServerMutatorContext } from './serverMutator.server'

/** `id` is the whole key of `applied_writes`, so it has to be unguessable; the client makes a uuid. */
const bodySchema = z.object({
  args: z.optional(z.unknown()),
  id: z.string().check(z.minLength(1), z.maxLength(64)),
  name: z.string(),
})

/** The PowerSync build's write endpoint: one server mutator, in the transaction Zero would give it, once per write id. */
export async function handleSyncMutate(request: Request, registry = serverMutators): Promise<Response> {
  const caller = await mutationCaller(request)
  const authUserId = caller.claims.sub

  const body = z.safeParse(bodySchema, await request.json().catch(() => undefined))
  if (!body.success) return refusal(400)
  const { args, id, name } = body.data
  const mutator = getMutator(registry, name)
  // A namespace (`areas`) and an inherited name (`toString`) are found too.
  if (!isMutator(mutator)) return refusal(400)

  const deferred: (() => Promise<void>)[] = []
  const ctx: ServerMutatorContext = { ...caller, afterCommit: (task) => void deferred.push(task) }
  try {
    const data = await dbProvider.transaction(async (tx) => {
      const db = tx.dbTransaction.wrappedTransaction
      await db.execute(sql`select set_config('search_path', ${PINNED_SEARCH_PATH}, true)`)

      // Claimed before the mutator runs: a second copy in flight waits here for this transaction.
      const [claimed] = await db
        .insert(appliedWrites)
        .values({ authUserFk: authUserId, id, name })
        .onConflictDoNothing()
        .returning({ id: appliedWrites.id })
      if (claimed == null) {
        const [applied] = await db.select().from(appliedWrites).where(eq(appliedWrites.id, id))
        if (applied?.authUserFk !== authUserId || applied.name !== name) error(409)
        return applied.result
      }

      const result = (await mutator.fn({ args: args as never, ctx, tx: tx as never })) ?? null
      await db.update(appliedWrites).set({ result }).where(eq(appliedWrites.id, id))
      return result
    })
    await drainAfterCommit(deferred)
    return Response.json({ data })
  } catch (e) {
    if (e instanceof InputValidationError) return refusal(400)
    if (!(e instanceof ApplicationError)) throw e
    const { field, status } = (e.details ?? {}) as RefusalDetails
    if (!isAuthoredMessage(e.message)) {
      console.error('[sync-mutate] unauthored refusal', e.message)
      return refusal(status ?? 400)
    }
    return refusal(status ?? 400, e.message, field)
  }
}

/** A client may resend a write for this long. One that queues writes must drop them sooner, or a late resend runs twice. */
export const APPLIED_WRITE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export const sweepAppliedWrites = async (before: Date): Promise<number> => {
  const swept = await pinnedTx((tx) => tx.delete(appliedWrites).where(lt(appliedWrites.createdAt, before)))
  return swept.count
}

/** The body a rejected remote command has, which the forms already read. */
const refusal = (status: number, message: string = formError('error_server_title'), field: null | string = null) =>
  Response.json({ field, message }, { status })
