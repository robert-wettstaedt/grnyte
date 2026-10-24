import type { VerifiedClaims } from '$lib/auth'
import { applyRls, db, PINNED_SEARCH_PATH } from '$lib/db/db.server'
import type { UserRegion } from '$lib/entities/region/dto'
import { formError } from '$lib/forms/schemas'
import { ApplicationError, defineMutatorWithType, type Transaction } from '@rocicorp/zero'
import type { DrizzleTransaction } from '@rocicorp/zero/server/adapters/drizzle'
import { isHttpError, isValidationError } from '@sveltejs/kit'
import { sql } from 'drizzle-orm'
import type { Schema } from './zero-schema'

export type ServerMutatorContext = {
  /** Runs after Zero's transaction commits, and only if this mutation succeeded. */
  afterCommit: (task: () => Promise<void>) => void
  claims: VerifiedClaims
  user: NonNullable<App.SafeSession['user']>
  userPermissions: App.Locals['userPermissions']
  userRegions: UserRegion[]
}

type Tx = DrizzleTransaction<typeof db>

export const defineServerMutator = defineMutatorWithType<Schema, ServerMutatorContext, Tx>()

export const refuseWithField = (message: string, field?: string): never => {
  throw new ApplicationError(message, { details: { field: field ?? null } })
}

/** Runs `write` on Zero's transaction as the caller, after Zero's own bookkeeping (which needs the
 *  login role) and with Kit's `error()` and `invalid()` turned into the error Zero reports. */
export function asCaller<T>(tx: Transaction<Schema, Tx>, ctx: ServerMutatorContext, write: (db: Tx) => Promise<T>) {
  return run(tx, (db) => applyRls(db, ctx.claims), write)
}

/** Runs `write` on Zero's transaction as the login role, for the writes `pinnedTx` made before: the
 *  same role, now committing with the mutation. `write` must still name its permission gate. */
export function asPrivileged<T>(tx: Transaction<Schema, Tx>, write: (db: Tx) => Promise<T>) {
  return run(tx, (db) => db.execute(sql`select set_config('search_path', ${PINNED_SEARCH_PATH}, true)`), write)
}

async function run<T>(tx: Transaction<Schema, Tx>, setup: (db: Tx) => Promise<unknown>, write: (db: Tx) => Promise<T>) {
  if (tx.location !== 'server') {
    throw new Error('server mutator ran on the client')
  }
  const db = tx.dbTransaction.wrappedTransaction

  try {
    await setup(db)
    const result = await write(db)
    // Back to the login role: Zero records the result in its own table after this, which `app_writer` may not write.
    await db.execute(sql`select set_config('role', 'none', true)`)
    return result
  } catch (e) {
    if (isHttpError(e)) {
      throw new ApplicationError(e.body.message, { details: { status: e.status } })
    }
    if (isValidationError(e)) {
      // Kit types the guard as ActionFailure; `invalid()` actually throws one carrying `issues`.
      const [issue] = (e as unknown as { issues: { message: string; path?: (number | string)[] }[] }).issues
      throw new ApplicationError(issue.message, {
        details: { field: issue.path?.[0] == null ? null : String(issue.path[0]) },
      })
    }
    if (e instanceof ApplicationError) {
      throw e
    }
    // Zero sends any other error's text to the client, and a Postgres one can quote row values.
    console.error('[mutate] mutator failed', e)
    throw new ApplicationError(formError('error_server_title'))
  }
}
