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
 */
import 'dotenv/config'
import postgres from 'postgres'

export const sql = postgres(process.env.DATABASE_URL ?? '', { connect_timeout: 5, max: 2, prepare: false })

/** False when there is no local database, so `npm test` still passes without one. Every DB-backed
 *  suite guards on this with `describe.skipIf(!reachable)`. */
export const reachable = await sql`select 1`.then(
  () => true,
  () => false,
)

export interface SeedUser {
  authId: string
  email: string
  userId: number
}

/**
 * Resolves the dev seed logins to their `auth.users` and `public.users` ids, keyed the way the
 * caller named them. Throws rather than returning a partial map: a missing seed user makes every
 * assertion in the file meaningless, and the failure is far easier to read here than as an
 * undefined id three fixtures later.
 */
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

export async function seedUsers<K extends string>(emails: Record<K, string>): Promise<Record<K, SeedUser>> {
  const wanted: string[] = Object.values(emails)

  const rows = await sql<SeedUser[]>`
    select au.email, au.id as "authId", u.id as "userId"
    from auth.users au join public.users u on u.auth_user_fk = au.id
    where au.email = any(${wanted})`

  return Object.fromEntries(
    (Object.entries(emails) as [K, string][]).map(([who, email]) => {
      const row = rows.find((candidate: SeedUser) => candidate.email === email)
      if (row == null) throw new Error(`seed user ${email} is missing from the dev database`)
      return [who, row]
    }),
  ) as Record<K, SeedUser>
}
