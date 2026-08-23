import { DATABASE_URL } from '$env/static/private'
import type { SupabaseToken, VerifiedClaims } from '$lib/auth'
import * as schema from '$lib/db/schema'
import { sql } from 'drizzle-orm'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import Database from 'postgres'

const postgres = Database(DATABASE_URL, {
  debug: process.env.NODE_ENV === 'development',
  max: 10,
  prepare: false,
  timeout: 30_000,
})

export const db = drizzle(postgres, { schema })

export function createDrizzle<
  Database extends PostgresJsDatabase<typeof schema>,
  Token extends VerifiedClaims = VerifiedClaims,
>(token: Token, db: Database) {
  return (async (transaction, ...rest) => {
    return await db.transaction(
      async (tx) => {
        // Supabase exposes auth.uid() and auth.jwt()
        // https://supabase.com/docs/guides/database/postgres/row-level-security#helper-functions
        //
        // Bound parameters, not interpolation. The token is signed, but its contents are not
        // trustworthy: `user_metadata` is part of the access token and any account can put what it
        // likes in there (`PUT /auth/v1/user`). `JSON.stringify` escapes double quotes and not
        // single ones, so a claim carrying an apostrophe used to close the SQL literal it was
        // pasted into, on the connection that holds every write privilege in the schema.
        //
        // One statement, three settings: parameters travel on the extended protocol, which refuses
        // multi-statement strings, and `set_config('role', ..., true)` is what `SET LOCAL ROLE` is
        // underneath, so the role travels as a parameter too rather than as interpolated text.
        //
        // Nothing resets them afterwards. `true` is the is_local flag, so all three end with the
        // transaction whichever way it ends, and there is no path out of here that is neither a
        // COMMIT nor a ROLLBACK. The reset that used to sit in a `finally` cost a round-trip on
        // every remote call to undo what the next statement undoes for free, and had to swallow its
        // own errors: on an aborted transaction it failed with 25P02 and hid the 42501 the caller
        // needed to see.
        await tx.execute(
          sql`select set_config('request.jwt.claims', ${JSON.stringify(token)}, true),
                     set_config('request.jwt.claim.sub', ${token.sub}, true),
                     set_config('role', ${roleFor(token)}, true)`,
        )
        return await transaction(tx)
      },
      ...rest,
    )
  }) as typeof db.transaction
}

/**
 * An RLS handle bound to a verified request.
 *
 * Takes the claims, not a Supabase client: verification happens once, in `$lib/hooks/auth.server`,
 * and `VerifiedClaims` is a type only `verifyAccessToken` can produce, so nothing unverified can
 * reach `request.jwt.claims`, which Postgres trusts completely.
 *
 * Synchronous, because there is nothing left to await.
 */
export function createRlsClient(claims: VerifiedClaims) {
  return createDrizzle(claims, db)
}

/**
 * The database role a request runs as.
 *
 * Deliberately not the token's `role` claim verbatim. That claim names the role PostgREST would
 * switch to for the same token, and `authenticated` holds no INSERT, UPDATE or DELETE on anything
 * (see `0120_app_writer_role`): a hand-written request can read what the policies allow and write
 * nothing at all. The app writes as `app_writer`, which is a member of `authenticated`, so every
 * policy declared `TO authenticated` applies to it unchanged.
 *
 * Mapping rather than passing through also means a token can only ever select between these two,
 * whatever its claims say. `verifyAccessToken` already refuses anything whose `role` is not
 * `authenticated`, so this is no longer the defence against a forged claim; it is the defence
 * against a future caller reaching `createDrizzle` by some other route.
 */
function roleFor(token: SupabaseToken): 'anon' | 'app_writer' {
  return token.role === 'authenticated' ? 'app_writer' : 'anon'
}
