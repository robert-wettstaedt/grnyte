/**
 * The database bootstrap the RLS, guard and tenancy tests share.
 *
 * All three want the same three things: a superuser connection (RLS bypassed, so fixtures can be
 * created regardless of what the test is about), a way to skip the whole file when there is no
 * local database, and the seed users resolved from their emails. Kept in one place so the seed
 * login set and the auth-user join are defined once rather than once per test file.
 *
 * Not a test file itself, so vitest never picks it up; it is imported by the ones that are. Each
 * test file gets its own module instance (vitest isolates per file), so each owns its pool and is
 * free to `sql.end()` in `afterAll`.
 *
 * That last part is a fact about vitest, NOT about this module. Playwright runs its spec files in
 * one worker process, so they share this instance and the first `sql.end()` strands the rest: a
 * spec there wants its own {@link connect} pool plus {@link resolveSeedUsers}.
 */
import 'dotenv/config'
import { connect, resolveSeedUsers, type SeedUser } from './testAccounts'

export const sql = connect()

/** False when there is no local database, so `npm test` still passes without one. Every DB-backed
 *  suite guards on this with `describe.skipIf(!reachable)`. */
export const reachable = await sql`select 1`.then(
  () => true,
  () => false,
)

export type { SeedUser } from './testAccounts'

/**
 * An account that belongs to one suite and nothing else, created on the spot.
 *
 * The four seed logins are shared, which is fine for a test that only reads them or writes rows
 * it deletes again. It is not fine for a test that COUNTS what an account owns: half a dozen
 * suites insert regions as one seed user or another, vitest runs their files in parallel, and a
 * count taken in one file changes under it while another file writes. That is what made the
 * region-cap test fail in full runs and pass on its own, and no seed account was free to move
 * it to.
 *
 * `label` only has to be unique per suite; the row itself is made unique with a fresh uuid.
 * Pair every call with {@link dropThrowawayUser} in `afterAll`.
 */
export async function createThrowawayUser(label: string): Promise<SeedUser> {
  const email = `__throwaway_${label}_${crypto.randomUUID()}@grnyte.test`

  const [auth] = await sql<{ id: string }[]>`
    insert into auth.users (id, email) values (gen_random_uuid(), ${email}) returning id`
  const [user] = await sql<{ id: number }[]>`
    insert into public.users (auth_user_fk, username) values (${auth.id}, ${email}) returning id`

  return { authId: auth.id, email, userId: user.id }
}

/** Remove a {@link createThrowawayUser} account. Anything it still owns is its suite's to clean
 *  up first: this deliberately does not cascade, so a leak fails loudly rather than silently
 *  taking rows with it. */
export async function dropThrowawayUser(user: SeedUser): Promise<void> {
  await sql`delete from public.users where id = ${user.userId}`
  await sql`delete from auth.users where id = ${user.authId}`
}

/** {@link resolveSeedUsers} on this module's pool, which is what every vitest suite wants. */
export async function seedUsers<K extends string>(emails: Record<K, string>): Promise<Record<K, SeedUser>> {
  return resolveSeedUsers(sql, emails)
}
