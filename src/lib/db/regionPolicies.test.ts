// @vitest-environment node
/**
 * Row-level-security tests for the three region tables (`regions`,
 * `region_members`, `region_invitations`).
 *
 * Fixtures are created over the superuser connection, which bypasses RLS. Every
 * assertion then runs inside a transaction that is always rolled back and that
 * impersonates a user exactly the way `createDrizzle` does: set
 * `request.jwt.claims`, then `set local role authenticated`. That is all
 * `authorize()` and `authorize_in_region()` read, so no signed JWT is needed.
 *
 * The four fixture users are chosen so each permission path is isolated:
 * `maintainer@` is the region admin (and is deliberately NOT an app admin, so a
 * pass cannot come from the app.admin policy), `admin@` is the app admin (and is
 * deliberately NOT a member of the fixture region, so a pass cannot come from a
 * membership), `user@` is a plain member and `anon@` is an outsider.
 *
 * Denial under RLS is silent for SELECT/UPDATE/DELETE (the row is filtered out,
 * so the count is 0) and loud for INSERT (a 42501 error), hence the two shapes
 * of assertion below.
 *
 * Skipped when DATABASE_URL is unreachable so `npm test` still passes without a
 * local database.
 */
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { reachable, seedUsers, sql, type SeedUser } from './testDb'

const REGION_NAME = '__rls_test__'
const OTHER_REGION_NAME = '__rls_test_other__'
const OTHER_EMAIL = 'somebody-else@example.com'

const EMAILS = {
  appAdmin: 'admin@grnyte.rocks',
  outsider: 'anon@grnyte.rocks',
  regionAdmin: 'maintainer@grnyte.rocks',
  regionUser: 'user@grnyte.rocks',
} as const

type Who = keyof typeof EMAILS

let users = {} as Record<Who, SeedUser>
let regionId = 0
let otherRegionId = 0
let ownInvitationId = 0
let otherInvitationId = 0

/** Rolls back whatever `fn` did, so tests never depend on each other's writes. */
const ROLLBACK = Symbol('rollback')

/** Runs `fn` as `who`, impersonated the way `createDrizzle` does. Always rolls back. */
async function as<T>(who: Who, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  const { authId, email } = users[who]
  const claims = JSON.stringify({ email, role: 'authenticated', sub: authId })

  let result!: T
  try {
    await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${claims}, true)`
      await tx.unsafe('set local role authenticated')
      result = await fn(tx)
      throw ROLLBACK
    })
  } catch (error) {
    if (error !== ROLLBACK) throw error
  }
  return result
}

/** Asserts an INSERT was refused by RLS rather than by some other error. */
async function expectInsertRefused(run: () => Promise<unknown>) {
  await expect(run()).rejects.toThrow(/row-level security/i)
}

async function removeFixtures() {
  const names = [REGION_NAME, OTHER_REGION_NAME]
  await sql`delete from public.region_invitations where region_fk in (select id from public.regions where name = any(${names}))`
  await sql`delete from public.region_members where region_fk in (select id from public.regions where name = any(${names}))`
  await sql`delete from public.regions where name = any(${names})`
}

beforeAll(async () => {
  users = await seedUsers(EMAILS)

  await removeFixtures()

  // Owned by the app admin, who is deliberately left off the member list.
  ;[{ id: regionId }] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by, max_members) values (${REGION_NAME}, ${users.appAdmin.userId}, 10)
    returning id`
  ;[{ id: otherRegionId }] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by, max_members) values (${OTHER_REGION_NAME}, ${users.appAdmin.userId}, 10)
    returning id`

  await sql`
    insert into public.region_members (region_fk, role, is_active, auth_user_fk, user_fk, invited_by) values
      (${regionId}, 'region_admin', true, ${users.regionAdmin.authId}, ${users.regionAdmin.userId}, ${users.appAdmin.userId}),
      (${regionId}, 'region_user', true, ${users.regionUser.authId}, ${users.regionUser.userId}, ${users.regionAdmin.userId})`

  // One invitation addressed to the outsider (the invitee-accept path) and one
  // addressed to a stranger (the "not yours" path).
  ;[{ id: ownInvitationId }] = await sql<{ id: number }[]>`
    insert into public.region_invitations (region_fk, email, expires_at, invited_by, token)
    values (${regionId}, ${users.outsider.email}, now() + interval '7 days', ${users.regionAdmin.userId}, gen_random_uuid())
    returning id`
  ;[{ id: otherInvitationId }] = await sql<{ id: number }[]>`
    insert into public.region_invitations (region_fk, email, expires_at, invited_by, token)
    values (${regionId}, ${OTHER_EMAIL}, now() + interval '7 days', ${users.regionAdmin.userId}, gen_random_uuid())
    returning id`
})

afterAll(async () => {
  if (reachable) await removeFixtures()
  await sql.end()
})

describe.skipIf(!reachable)('regions RLS', () => {
  it('lets a region admin rename their own region', async () => {
    const result = await as(
      'regionAdmin',
      (tx) => tx`update public.regions set name = 'renamed' where id = ${regionId}`,
    )
    expect(result.count).toBe(1)
  })

  it('does not let a region admin rename a region they do not administer', async () => {
    const result = await as(
      'regionAdmin',
      (tx) => tx`update public.regions set name = 'renamed' where id = ${otherRegionId}`,
    )
    expect(result.count).toBe(0)
  })

  it('does not let a region admin delete their region (deleting is app.admin only)', async () => {
    const result = await as('regionAdmin', (tx) => tx`delete from public.regions where id = ${regionId}`)
    expect(result.count).toBe(0)
  })

  it('does not let a plain member rename their region', async () => {
    const result = await as('regionUser', (tx) => tx`update public.regions set name = 'renamed' where id = ${regionId}`)
    expect(result.count).toBe(0)
  })

  it('does not let an outsider rename or delete a region', async () => {
    const updated = await as('outsider', (tx) => tx`update public.regions set name = 'renamed' where id = ${regionId}`)
    expect(updated.count).toBe(0)

    const deleted = await as('outsider', (tx) => tx`delete from public.regions where id = ${regionId}`)
    expect(deleted.count).toBe(0)
  })

  it('lets an app admin rename and delete any region', async () => {
    const updated = await as('appAdmin', (tx) => tx`update public.regions set name = 'renamed' where id = ${regionId}`)
    expect(updated.count).toBe(1)

    const deleted = await as('appAdmin', (tx) => tx`delete from public.regions where id = ${otherRegionId}`)
    expect(deleted.count).toBe(1)
  })

  it('lets members read their region and hides it from outsiders', async () => {
    const asMember = await as('regionUser', (tx) => tx`select id from public.regions where id = ${regionId}`)
    expect(asMember).toHaveLength(1)

    const asOutsider = await as('outsider', (tx) => tx`select id from public.regions where id = ${regionId}`)
    expect(asOutsider).toHaveLength(0)
  })
})

describe.skipIf(!reachable)('region_members RLS', () => {
  it("lets a region admin change another member's role", async () => {
    const result = await as(
      'regionAdmin',
      (tx) =>
        tx`update public.region_members set role = 'region_maintainer' where region_fk = ${regionId} and user_fk = ${users.regionUser.userId}`,
    )
    expect(result.count).toBe(1)
  })

  it('lets a region admin remove another member', async () => {
    const result = await as(
      'regionAdmin',
      (tx) =>
        tx`delete from public.region_members where region_fk = ${regionId} and user_fk = ${users.regionUser.userId}`,
    )
    expect(result.count).toBe(1)
  })

  it('lets a region admin add a member to their region', async () => {
    const result = await as(
      'regionAdmin',
      (tx) => tx`
        insert into public.region_members (region_fk, role, is_active, auth_user_fk, user_fk, invited_by)
        values (${regionId}, 'region_user', true, ${users.outsider.authId}, ${users.outsider.userId}, ${users.regionAdmin.userId})`,
    )
    expect(result.count).toBe(1)
  })

  it('does not let a region admin touch members of a region they do not administer', async () => {
    await expectInsertRefused(() =>
      as(
        'regionAdmin',
        (tx) => tx`
          insert into public.region_members (region_fk, role, is_active, auth_user_fk, user_fk, invited_by)
          values (${otherRegionId}, 'region_admin', true, ${users.regionAdmin.authId}, ${users.regionAdmin.userId}, ${users.regionAdmin.userId})`,
      ),
    )
  })

  it("does not let a plain member change another member's role", async () => {
    const result = await as(
      'regionUser',
      (tx) =>
        tx`update public.region_members set role = 'region_user' where region_fk = ${regionId} and user_fk = ${users.regionAdmin.userId}`,
    )
    expect(result.count).toBe(0)
  })

  it('does not let a member promote themselves', async () => {
    const result = await as(
      'regionUser',
      (tx) =>
        tx`update public.region_members set role = 'region_admin' where region_fk = ${regionId} and user_fk = ${users.regionUser.userId}`,
    )
    expect(result.count).toBe(0)
  })

  it('does not let an outsider join a region on their own', async () => {
    await expectInsertRefused(() =>
      as(
        'outsider',
        (tx) => tx`
          insert into public.region_members (region_fk, role, is_active, auth_user_fk, user_fk, invited_by)
          values (${regionId}, 'region_admin', true, ${users.outsider.authId}, ${users.outsider.userId}, ${users.outsider.userId})`,
      ),
    )
  })

  it('hides the memberships of a region you do not belong to', async () => {
    // The table tenancy is made of. A blanket read here let any signed-in user enumerate every
    // region's roster - names, roles and auth uids - for regions they cannot even see the name of.
    const foreign = await as(
      'regionUser',
      (tx) => tx`select id from public.region_members where region_fk = ${otherRegionId}`,
    )
    expect(foreign).toHaveLength(0)

    const own = await as('regionUser', (tx) => tx`select id from public.region_members where region_fk = ${regionId}`)
    expect(own).toHaveLength(2)
  })

  it('lets an app admin read memberships of regions they are not in', async () => {
    const result = await as('appAdmin', (tx) => tx`select id from public.region_members where region_fk = ${regionId}`)
    expect(result).toHaveLength(2)
  })

  it('lets a member leave their region', async () => {
    const result = await as(
      'regionUser',
      (tx) =>
        tx`delete from public.region_members where region_fk = ${regionId} and auth_user_fk = ${users.regionUser.authId}`,
    )
    expect(result.count).toBe(1)
  })

  it('stops accepting activities from a member the moment they delete their own membership', async () => {
    // `activities` inserts are gated on authorize_in_region('region.edit'), which reads
    // region_members - so within one transaction, leaving first and logging afterwards fails.
    // `leaveRegion` logs before it deletes because of this; keep them in that order.
    await expectInsertRefused(() =>
      as('regionUser', async (tx) => {
        await tx`delete from public.region_members where region_fk = ${regionId} and auth_user_fk = ${users.regionUser.authId}`
        return tx`
          insert into public.activities (type, entity_id, entity_type, column_name, region_fk, user_fk)
          values ('deleted', ${String(users.regionUser.userId)}, 'user', 'role', ${regionId}, ${users.regionUser.userId})`
      }),
    )
  })

  it('accepts the activity when it is logged before the member leaves', async () => {
    const result = await as('regionUser', async (tx) => {
      await tx`
        insert into public.activities (type, entity_id, entity_type, column_name, region_fk, user_fk)
        values ('deleted', ${String(users.regionUser.userId)}, 'user', 'role', ${regionId}, ${users.regionUser.userId})`
      return tx`delete from public.region_members where region_fk = ${regionId} and auth_user_fk = ${users.regionUser.authId}`
    })
    expect(result.count).toBe(1)
  })
})

describe.skipIf(!reachable)('activities RLS', () => {
  // `createUpdateActivity` debounces a repeated edit by updating the activity it already wrote
  // instead of adding a second one. A table with RLS on refuses any command it has no policy for,
  // so while `activities` had none for UPDATE that merge matched nothing - and since the change
  // had already been taken off the insert list, the second edit went unrecorded entirely.
  const logRoleChange = (tx: postgres.TransactionSql, actor: SeedUser) => tx`
    insert into public.activities (type, entity_id, entity_type, column_name, old_value, new_value, region_fk, user_fk)
    values ('updated', ${String(users.regionUser.userId)}, 'user', 'role', 'region_user', 'region_maintainer', ${regionId}, ${actor.userId})
    returning id`

  it('lets an author merge a repeated change into the activity they already logged', async () => {
    const result = await as('regionAdmin', async (tx) => {
      const [{ id }] = await logRoleChange(tx, users.regionAdmin)
      return tx`update public.activities set new_value = 'region_admin' where id = ${id}`
    })
    expect(result.count).toBe(1)
  })

  it('lets a region admin read the removal activity an undo depends on', async () => {
    // `resolveRestore` refuses to restore a member without the activity `removeRegionMember`
    // logged, and reads it through the RLS-scoped connection - so if this SELECT were ever
    // policy-gated away from admins, Undo would silently 404 instead of restoring.
    const rows = await as('regionAdmin', async (tx) => {
      await logRoleChange(tx, users.regionAdmin)
      return tx`select id from public.activities where region_fk = ${regionId} and entity_type = 'user'`
    })
    expect(rows.length).toBeGreaterThan(0)
  })

  it('does not let somebody else rewrite an activity', async () => {
    const result = await as('regionAdmin', async (tx) => {
      const [{ id }] = await logRoleChange(tx, users.appAdmin)
      return tx`update public.activities set new_value = 'region_admin' where id = ${id}`
    })
    expect(result.count).toBe(0)
  })
})

describe.skipIf(!reachable)('region_invitations RLS', () => {
  it('lets any member of the region read its invitations', async () => {
    const result = await as(
      'regionUser',
      (tx) => tx`select id from public.region_invitations where region_fk = ${regionId}`,
    )
    expect(result).toHaveLength(2)
  })

  it('hides a region’s invitations from non-members', async () => {
    const result = await as(
      'outsider',
      (tx) => tx`select id from public.region_invitations where id = ${otherInvitationId}`,
    )
    expect(result).toHaveLength(0)
  })

  it('lets an invitee read the invitation addressed to them', async () => {
    // Without this an invitee could never accept: they are not a member yet.
    const result = await as(
      'outsider',
      (tx) => tx`select id from public.region_invitations where id = ${ownInvitationId}`,
    )
    expect(result).toHaveLength(1)
  })

  it('lets an invitee accept the invitation addressed to them', async () => {
    const result = await as(
      'outsider',
      (tx) => tx`update public.region_invitations set status = 'accepted' where id = ${ownInvitationId}`,
    )
    expect(result.count).toBe(1)
  })

  it('does not let a user touch an invitation addressed to somebody else', async () => {
    const result = await as(
      'outsider',
      (tx) => tx`update public.region_invitations set status = 'accepted' where id = ${otherInvitationId}`,
    )
    expect(result.count).toBe(0)
  })

  it("does not let a plain member revoke somebody else's invitation", async () => {
    const result = await as(
      'regionUser',
      (tx) => tx`update public.region_invitations set status = 'expired' where id = ${otherInvitationId}`,
    )
    expect(result.count).toBe(0)
  })

  it('lets a region admin revoke any invitation in their region', async () => {
    const result = await as(
      'regionAdmin',
      (tx) => tx`update public.region_invitations set status = 'expired' where id = ${otherInvitationId}`,
    )
    expect(result.count).toBe(1)
  })

  it('lets a region admin invite somebody', async () => {
    const result = await as(
      'regionAdmin',
      (tx) => tx`
        insert into public.region_invitations (region_fk, email, expires_at, invited_by, token)
        values (${regionId}, 'new@example.com', now() + interval '7 days', ${users.regionAdmin.userId}, gen_random_uuid())`,
    )
    expect(result.count).toBe(1)
  })

  it('does not let a plain member invite somebody', async () => {
    await expectInsertRefused(() =>
      as(
        'regionUser',
        (tx) => tx`
          insert into public.region_invitations (region_fk, email, expires_at, invited_by, token)
          values (${regionId}, 'new@example.com', now() + interval '7 days', ${users.regionUser.userId}, gen_random_uuid())`,
      ),
    )
  })
})
