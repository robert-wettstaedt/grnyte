/**
 * Seed the sandbox database with the minimum needed to log in and exercise the
 * app: global reference data (role_permissions / grades / tags), one region, and
 * the four permission-tier test users. Domain content (areas / routes) is left
 * for you to create through the app's own flows.
 *
 * Idempotent: safe to re-run. Only for the throwaway sandbox DB - never point it
 * at a real database.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postgres from 'postgres'

const DATABASE_URL = process.env.DATABASE_URL
const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PASSWORD = process.env.SANDBOX_TEST_PASSWORD ?? 'sandbox-dev-pw'

if (!DATABASE_URL || !SUPABASE_URL || !SERVICE_KEY) {
  throw new Error('seed-sandbox: DATABASE_URL, PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
}

const sql = postgres(DATABASE_URL, { prepare: false })

type Tier = {
  email: string
  username: string
  appRole: 'app_admin' | null
  regionRole: 'region_user' | 'region_maintainer' | 'region_admin' | null
}

const TIERS: Tier[] = [
  { email: 'anon@grnyte.rocks', username: 'anon', appRole: null, regionRole: null },
  { email: 'user@grnyte.rocks', username: 'user', appRole: null, regionRole: 'region_user' },
  { email: 'maintainer@grnyte.rocks', username: 'maintainer', appRole: null, regionRole: 'region_maintainer' },
  { email: 'admin@grnyte.rocks', username: 'admin', appRole: 'app_admin', regionRole: 'region_admin' },
]

/** Create a GoTrue user (email pre-confirmed), or return the id if it exists. */
const ensureAuthUser = async (email: string): Promise<string> => {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY!, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  })
  if (res.ok) {
    const body = (await res.json()) as { id: string }
    return body.id
  }
  // Already registered: look the id up directly in auth.users.
  const rows = await sql<{ id: string }[]>`select id from auth.users where email = ${email} limit 1`
  // Reference-data import (pg_dump) resets search_path to '' on this pooled
  // connection, so every table below is schema-qualified.
  if (rows.length === 0) {
    throw new Error(`failed to create ${email}: ${res.status} ${await res.text()}`)
  }
  return rows[0].id
}

// 1. Reference data (only if not already present).
const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from public.role_permissions`
if (count === 0) {
  const refdata = readFileSync(resolve(process.cwd(), '.devcontainer/supabase/seed-refdata.sql'), 'utf8')
  await sql.unsafe(refdata)
  console.log('seeded reference data (role_permissions, grades, tags)')
}

// 2. Users + app-level roles (lookup-based: insert only if absent).
const authIdByEmail = new Map<string, string>()
const userIdByEmail = new Map<string, number>()
for (const t of TIERS) {
  const authId = await ensureAuthUser(t.email)
  authIdByEmail.set(t.email, authId)

  const existing = await sql<{ id: number }[]>`select id from public.users where auth_user_fk = ${authId} limit 1`
  const userId = existing.length
    ? existing[0].id
    : (await sql<{ id: number }[]>`insert into public.users (username, auth_user_fk) values (${t.username}, ${authId}) returning id`)[0].id
  userIdByEmail.set(t.email, userId)

  if (t.appRole) {
    const hasRole = await sql`select 1 from public.user_roles where auth_user_fk = ${authId} limit 1`
    if (hasRole.length === 0) {
      await sql`insert into public.user_roles (auth_user_fk, role) values (${authId}, ${t.appRole})`
    }
  }
}
console.log(`ensured ${TIERS.length} tier users`)

// 3. One region, owned by admin.
const adminUserId = userIdByEmail.get('admin@grnyte.rocks')!
const existingRegion = await sql<{ id: number }[]>`select id from public.regions where name = 'Sandbox Region' limit 1`
const regionId = existingRegion.length
  ? existingRegion[0].id
  : (await sql<{ id: number }[]>`insert into public.regions (name, created_by, max_members, settings) values ('Sandbox Region', ${adminUserId}, 100, '{}'::jsonb) returning id`)[0].id

// 4. Region memberships for the region-scoped tiers.
for (const t of TIERS) {
  if (!t.regionRole) continue
  const authId = authIdByEmail.get(t.email)!
  const userId = userIdByEmail.get(t.email)!
  const member = await sql`select 1 from public.region_members where region_fk = ${regionId} and auth_user_fk = ${authId} limit 1`
  if (member.length === 0) {
    await sql`
      insert into public.region_members (region_fk, role, is_active, auth_user_fk, user_fk, invited_by)
      values (${regionId}, ${t.regionRole}, true, ${authId}, ${userId}, ${adminUserId})`
  }
}
console.log(`ensured region ${regionId} + memberships`)

await sql.end()
console.log(`sandbox seeded. Log in with <tier>@grnyte.rocks / ${PASSWORD}`)
