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
