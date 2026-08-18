import * as schema from '$lib/db/schema'
import { users, userSettings } from '$lib/db/schema'
import { eq, type SQL } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

/**
 * Write to somebody's `user_settings`, creating the row if it is missing.
 *
 * The row is NOT guaranteed to exist. Sign-up writes `users` and `user_settings` as separate
 * unwrapped statements, so a failure between them leaves an account with none, and every plain
 * `UPDATE ... WHERE user_fk = ?` against it then affects zero rows and reports success. That is
 * the worst shape a bug can take here: a watermark that never moves is a push that repeats itself
 * every five minutes, forever.
 *
 * Shared by every writer for exactly that reason, rather than each remembering the fallback.
 *
 * ponytail: `user_fk` carries no unique constraint to upsert against, and a per-user settings row
 * has no real write contention, so update-then-insert without a lock is enough. Upgrade = a unique
 * index on `user_fk` and a real upsert, if two devices ever race hard enough to matter.
 */
export async function writeUserSettings(
  db: PostgresJsDatabase<typeof schema>,
  user: { authUserFk: string; id: number },
  // `SQL` per field so a caller can hand over an expression rather than a value, which is what
  // the watermark writes need: `greatest(current, new)` has to be evaluated by the database, not
  // by whoever read the row a moment ago.
  values: { [K in keyof schema.InsertUserSettings]?: schema.InsertUserSettings[K] | SQL },
): Promise<void> {
  // no-drizzle-mass-assignment is exempted for both `.set(values)` in this function, deliberately.
  // The rule exists because a spread lets the CALLER choose which columns move; here the parameter
  // is typed to `InsertUserSettings`, so the column set is the table's and the choice of which
  // subset to write belongs to each caller. Every caller passes a literal except `updateUserSettings`
  // (users.remote.ts), whose zod schema is the allowlist: six preference fields, all owned by the
  // account writing them, and not a schema shared with any create path.
  // eslint-disable-next-line no-restricted-syntax
  const [updated] = await db
    .update(userSettings)
    .set(values)
    .where(eq(userSettings.userFk, user.id))
    .returning({ id: userSettings.id })

  if (updated != null) {
    return
  }

  // An EMPTY row, then the same UPDATE again. `values` may hold expressions that read the row
  // (`greatest(coalesce(user_settings.x, 0), N)`), and inside an `INSERT ... VALUES` that is a
  // self-reference Postgres rejects outright (42P01), which would break the one case this fallback
  // exists for. Against a row that now exists the expression is simply true: coalesce(null, 0).
  //
  // The client reads settings through `users.user_settings_fk`, so the link has to be made too or
  // the row exists and nothing can see it.
  const [created] = await db
    .insert(userSettings)
    .values({ authUserFk: user.authUserFk, userFk: user.id })
    .returning({ id: userSettings.id })

  await db.update(users).set({ userSettingsFk: created.id }).where(eq(users.id, user.id))
  // eslint-disable-next-line no-restricted-syntax -- see the note on the first `.set(values)` above
  await db.update(userSettings).set(values).where(eq(userSettings.id, created.id))
}
