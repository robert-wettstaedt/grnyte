/**
 * Create a dedicated region for volume test data and add the local test users
 * as members at their permission tier. Pairs with `seed-volume.ts` (run this
 * first, then `npx tsx src/lib/db/scripts/seed-volume.ts`).
 *
 * The four `@grnyte.rocks` test logins must already exist (they do on the dev
 * DB). `anon` is intentionally NOT added: that tier represents no region
 * access. Idempotent: safe to re-run. Dev DB only.
 */
import postgres from 'postgres'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) throw new Error('seed-dev-region: DATABASE_URL is required')

const REGION_NAME = process.env.REGION_NAME ?? 'Volume Test'

// email -> region role (anon omitted: it represents no access).
const MEMBERS = [
  { email: 'user@grnyte.rocks', role: 'region_user' },
  { email: 'maintainer@grnyte.rocks', role: 'region_maintainer' },
  { email: 'admin@grnyte.rocks', role: 'region_admin' },
] as const
const OWNER_EMAIL = 'admin@grnyte.rocks'

const sql = postgres(DATABASE_URL, { prepare: false })

// Resolve test users (public.users id + auth_user_fk) by email.
const emails = MEMBERS.map((m) => m.email)
const users = await sql<{ authUserFk: string; email: string; id: number }[]>`
  select au.email, u.id, u.auth_user_fk as "authUserFk"
  from auth.users au
  join public.users u on u.auth_user_fk = au.id
  where au.email = any(${emails})`
const byEmail = new Map(users.map((u) => [u.email, u]))
for (const email of emails) {
  if (!byEmail.has(email))
    throw new Error(`seed-dev-region: test user ${email} not found - create it / log in once first`)
}
const owner = byEmail.get(OWNER_EMAIL)!

// Region (create if absent).
const existing = await sql<{ id: number }[]>`select id from public.regions where name = ${REGION_NAME} limit 1`
const regionId = existing.length
  ? existing[0].id
  : (
      await sql<{ id: number }[]>`
        insert into public.regions (name, created_by, max_members, settings)
        values (${REGION_NAME}, ${owner.id}, 100, '{}'::jsonb) returning id`
    )[0].id
console.log(`region "${REGION_NAME}" -> id ${regionId}`)

// Memberships (insert if absent).
for (const { email, role } of MEMBERS) {
  const u = byEmail.get(email)!
  const has =
    await sql`select 1 from public.region_members where region_fk = ${regionId} and auth_user_fk = ${u.authUserFk} limit 1`
  if (has.length === 0) {
    await sql`
      insert into public.region_members (region_fk, role, is_active, auth_user_fk, user_fk, invited_by)
      values (${regionId}, ${role}, true, ${u.authUserFk}, ${u.id}, ${owner.id})`
  }
  console.log(`  ${email} -> ${role}`)
}

await sql.end()
console.log(`done. Now: REGION_NAME='${REGION_NAME}' npx tsx src/lib/db/scripts/seed-volume.ts`)
