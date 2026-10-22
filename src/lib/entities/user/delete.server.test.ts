// @vitest-environment node
import { db } from '$lib/db/db.server'
import { createThrowawayUser, dropThrowawayUser, reachable, sql, type SeedUser } from '$lib/db/testDb'
import { sql as drizzleSql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteRegionRows } from '../region/delete.server'
import { lockRegionMembers } from '../region/guards.server'
import { deleteAccount, deleteAccountData, ERASED_COMMENT, previewAccountDeletion } from './delete.server'

const auth = vi.hoisted(() => ({ deleteUser: vi.fn(async () => ({ error: null })), password: vi.fn(async () => true) }))
const storage = vi.hoisted(() => ({ remove: vi.fn(async () => {}) }))

vi.mock('$lib/db/supabaseAdmin.server', () => ({ supabaseAdmin: () => ({ auth: { admin: auth } }) }))
vi.mock('./password.server', () => ({ verifyPassword: auth.password }))
vi.mock('../file/cleanup.server', async (original) => ({
  ...(await original<typeof import('../file/cleanup.server')>()),
  removeFileStorage: storage.remove,
}))

const PREFIX = '__delete_account__'
const VIDEO = '5e0d6a8e-0000-4000-8000-00000000acc7'

let person: SeedUser
let other: SeedUser
let shared = 0
let sole = 0
const ids: Record<string, number> = {}

/** Every column that points at a user, so a leftover link anywhere fails the test by name. */
const references = async (user: SeedUser) => {
  const columns = await sql<{ column: string; table: string; target: string }[]>`
    select kcu.table_name as table, kcu.column_name as column, ccu.table_schema || '.' || ccu.table_name as target
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
    where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
      and ccu.column_name = 'id' and (ccu.table_schema, ccu.table_name) in (('public', 'users'), ('auth', 'users'))`
  const found: string[] = []
  for (const { column, table, target } of columns) {
    const id = target === 'auth.users' ? user.authId : user.userId
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from ${sql('public.' + table)} where ${sql(column)} = ${id}`
    if (count > 0) found.push(`${table}.${column}`)
  }
  const [{ count }] = await sql<
    { count: number }[]
  >`select count(*)::int as count from public.users where id = ${user.userId}`
  if (count > 0) found.push('users')
  return found.sort()
}

/** The session user, as the command hands it over. */
const account = () => ({ authUserFk: person.authId, email: person.email, id: person.userId })

const exists = async (table: string, id: number | string) => {
  const [{ count }] = await sql<
    { count: number }[]
  >`select count(*)::int as count from ${sql('public.' + table)} where id = ${id}`
  return count === 1
}

async function removeFixtures() {
  const regions = await sql<{ id: number }[]>`select id from public.regions where name like ${PREFIX + '%'}`
  for (const { id } of regions) await db.transaction((tx) => deleteRegionRows(tx, id))
  await sql`delete from public.feedback where body like ${PREFIX + '%'}`
  for (const user of [person, other]) {
    if (user == null) continue
    await sql`delete from public.user_roles where auth_user_fk = ${user.authId}`
    await sql`delete from public.push_subscriptions where user_fk = ${user.userId}`
    await sql`update public.users set user_settings_fk = null, first_ascentionist_fk = null where id = ${user.userId}`
    await sql`delete from public.user_settings where user_fk = ${user.userId}`
    await dropThrowawayUser(user)
  }
}

async function seed() {
  ;[person, other] = await Promise.all([
    createThrowawayUser('delete_account_person'),
    createThrowawayUser('delete_account_other'),
  ])
  const [{ id: settings }] = await sql<{ id: number }[]>`
    insert into public.user_settings (auth_user_fk, user_fk) values (${person.authId}, ${person.userId}) returning id`
  await sql`update public.users set user_settings_fk = ${settings} where id = ${person.userId}`
  await sql`insert into public.user_roles (auth_user_fk, role) values (${person.authId}, 'region_user')`
  await sql`
    insert into public.push_subscriptions (auth_user_fk, user_fk, endpoint, p256dh, auth)
    values (${person.authId}, ${person.userId}, 'https://push.test/' || gen_random_uuid(), 'k', 'a')`

  // Shared: the person is a plain member, the other one its admin and owner, invited by the person.
  ;[{ id: shared }] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by) values (${PREFIX + 'shared'}, ${other.userId}) returning id`
  await sql`
    insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active, invited_by) values
      (${shared}, ${person.userId}, ${person.authId}, 'region_maintainer', true, null),
      (${shared}, ${other.userId}, ${other.authId}, 'region_admin', true, ${person.userId})`
  await sql`
    insert into public.region_invitations (region_fk, token, invited_by, email, expires_at)
    values (${shared}, gen_random_uuid(), ${person.userId}, 'later@grnyte.test', now() + interval '1 day')`

  const [{ id: area }] = await sql<{ id: number }[]>`
    insert into public.areas (name, created_by, region_fk, type) values ('Sektor', ${person.userId}, ${shared}, 'sector') returning id`
  const [{ id: block }] = await sql<{ id: number }[]>`
    insert into public.blocks (name, created_by, region_fk, area_fk, "order")
    values ('Block', ${person.userId}, ${shared}, ${area}, 0) returning id`
  const [{ id: route }] = await sql<{ id: number }[]>`
    insert into public.routes (name, created_by, region_fk, block_fk, grade_fk)
    values ('Route', ${person.userId}, ${shared}, ${block}, 10) returning id`
  Object.assign(ids, { area, block, route })

  const [{ id: photo }] = await sql<{ id: string }[]>`
    insert into public.files (id, region_fk, path, route_fk, created_by)
    values (gen_random_uuid()::text, ${shared}, '/route.jpg', ${route}, ${person.userId}) returning id`
  ids.photo = photo as unknown as number

  // The person's ascent votes a much harder grade; the other's agrees with the route.
  const [{ id: ascent }] = await sql<{ id: number }[]>`
    insert into public.ascents (region_fk, created_by, type, route_fk, grade_fk)
    values (${shared}, ${person.userId}, 'flash', ${route}, 20) returning id`
  await sql`
    insert into public.ascents (region_fk, created_by, type, route_fk, grade_fk) values (${shared}, ${other.userId}, 'redpoint', ${route}, 10)`
  const [{ id: video }] = await sql<{ id: string }[]>`
    insert into public.files (id, region_fk, path, ascent_fk, created_by)
    values (gen_random_uuid()::text, ${shared}, '', ${ascent}, ${person.userId}) returning id`
  await sql`insert into public.bunny_streams (id, region_fk, file_fk) values (${VIDEO}, ${shared}, ${video})`
  await sql`update public.files set bunny_stream_fk = ${VIDEO} where id = ${video}`
  await sql`update public.routes set user_grade_fk = 15 where id = ${route}`

  // A card by the other person, with the person's comment thread and emoji under it.
  const [{ id: card }] = await sql<{ id: number }[]>`
    insert into public.events (verb, actor_fk, region_fk, route_fk) values ('create', ${other.userId}, ${shared}, ${route}) returning id`
  const [{ id: root }] = await sql<{ id: number }[]>`
    insert into public.reactions (event_fk, body, type, region_fk, auth_user_fk, user_fk)
    values (${card}, 'Beta: left foot first', 'comment', ${shared}, ${person.authId}, ${person.userId}) returning id`
  const [{ id: reply }] = await sql<{ id: number }[]>`
    insert into public.reactions (event_fk, body, type, region_fk, auth_user_fk, user_fk, parent_fk)
    values (${card}, 'Thanks', 'comment', ${shared}, ${other.authId}, ${other.userId}, ${root}) returning id`
  const [{ id: emoji }] = await sql<{ id: number }[]>`
    insert into public.reactions (event_fk, body, type, region_fk, auth_user_fk, user_fk)
    values (${card}, '👍', 'emoji', ${shared}, ${person.authId}, ${person.userId}) returning id`
  // A comment they deleted earlier: hidden already, its words still stored.
  const [{ id: retracted }] = await sql<{ id: number }[]>`
    insert into public.reactions (event_fk, body, type, region_fk, auth_user_fk, user_fk, deleted_at)
    values (${card}, 'Something I took back', 'comment', ${shared}, ${person.authId}, ${person.userId}, now())
    returning id`
  Object.assign(ids, { card, emoji, reply, retracted, root })

  // Their ascent's card goes with the ascent.
  const [{ id: sent }] = await sql<{ id: number }[]>`
    insert into public.events (verb, actor_fk, region_fk, ascent_fk) values ('create', ${person.userId}, ${shared}, ${ascent}) returning id`
  ids.sent = sent

  // Their edit of a shared route stays, with the other's comment and the change history under it.
  const [{ id: edit }] = await sql<{ id: number }[]>`
    insert into public.events (verb, actor_fk, region_fk, route_fk) values ('update', ${person.userId}, ${shared}, ${route}) returning id`
  const [{ id: editComment }] = await sql<{ id: number }[]>`
    insert into public.reactions (event_fk, body, type, region_fk, auth_user_fk, user_fk)
    values (${edit}, 'Good catch', 'comment', ${shared}, ${other.authId}, ${other.userId}) returning id`
  const [{ id: editChange }] = await sql<{ id: number }[]>`
    insert into public.changes (event_fk, region_fk, column_name) values (${edit}, ${shared}, 'name') returning id`
  // Changing the other's role stays as that member's history. An invite names the inviter as its
  // subject (the invitee has no account), so it goes with them, as their join does.
  const [{ id: promoted }] = await sql<{ id: number }[]>`
    insert into public.events (verb, actor_fk, subject_fk, region_fk, metadata)
    values ('update', ${person.userId}, ${other.userId}, ${shared}, 'region_admin') returning id`
  const [{ id: invited }] = await sql<{ id: number }[]>`
    insert into public.events (verb, actor_fk, subject_fk, region_fk, metadata)
    values ('invite', ${person.userId}, ${person.userId}, ${shared}, 'friend@grnyte.test') returning id`
  const [{ id: joined }] = await sql<{ id: number }[]>`
    insert into public.events (verb, actor_fk, subject_fk, region_fk) values ('join', ${person.userId}, ${person.userId}, ${shared})
    returning id`
  // The other's inbox row about the person's comment stays.
  const [{ id: nudge }] = await sql<{ id: number }[]>`
    insert into public.notifications (region_fk, user_fk, auth_user_fk, actor_fk, event_fk, source_type)
    values (${shared}, ${other.userId}, ${other.authId}, ${person.userId}, ${card}, 'comment') returning id`
  Object.assign(ids, { edit, editChange, editComment, invited, joined, nudge, promoted })

  const [{ id: fa }] = await sql<{ id: number }[]>`
    insert into public.first_ascensionists (region_fk, name, user_fk) values (${shared}, 'Ada', ${person.userId}) returning id`
  await sql`update public.users set first_ascentionist_fk = ${fa} where id = ${person.userId}`
  ids.fa = fa

  await sql`
    insert into public.favorites (region_fk, auth_user_fk, user_fk, route_fk) values (${shared}, ${person.authId}, ${person.userId}, ${route})`
  const [{ id: report }] = await sql<{ id: number }[]>`
    insert into public.feedback (body, kind, created_by) values (${PREFIX + 'report'}, 'idea', ${person.userId}) returning id`
  ids.report = report

  // Sole: the other one is only an inactive member, so nobody is left to use it.
  ;[{ id: sole }] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by) values (${PREFIX + 'sole'}, ${person.userId}) returning id`
  await sql`
    insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active) values
      (${sole}, ${person.userId}, ${person.authId}, 'region_admin', true),
      (${sole}, ${other.userId}, ${other.authId}, 'region_user', false)`
  await sql`insert into public.areas (name, created_by, region_fk, type) values ('Allein', ${person.userId}, ${sole}, 'area')`
}

beforeAll(async () => {
  if (reachable) await seed()
})

beforeEach(() => {
  auth.deleteUser.mockClear()
  auth.password.mockReset().mockResolvedValue(true)
  storage.remove.mockClear()
})

afterAll(async () => {
  if (reachable) await removeFixtures()
  await sql.end()
})

describe.skipIf(!reachable)('deleteAccount', () => {
  it('changes nothing for a wrong password', async () => {
    auth.password.mockResolvedValue(false)

    expect(await deleteAccount(account(), 'wrong')).toEqual({ kind: 'wrongPassword' })
    expect(await references(person)).toContain('users')
    expect(auth.deleteUser).not.toHaveBeenCalled()
  })

  it('refuses while the person owns a region others still use, even beside a second admin, and names it', async () => {
    await sql`update public.region_members set role = 'region_admin' where region_fk = ${shared} and user_fk = ${person.userId}`
    await sql`update public.regions set created_by = ${person.userId} where id = ${shared}`

    const preview = await previewAccountDeletion(person.userId)
    const result = await deleteAccount(account(), 'pw')

    await sql`update public.regions set created_by = ${other.userId} where id = ${shared}`
    await sql`update public.region_members set role = 'region_maintainer' where region_fk = ${shared} and user_fk = ${person.userId}`
    expect(result).toEqual({ kind: 'blocked', regions: [PREFIX + 'shared'] })
    // The screen warns from the same rule, and names each region by id, since names repeat.
    expect(preview.blocks).toEqual([{ id: shared, name: PREFIX + 'shared' }])
    expect(preview.deletes).toEqual([{ id: sole, name: PREFIX + 'sole' }])
    expect(await references(person)).toContain('users')
  })

  it('lets an admin who is not the owner go, even as the only admin besides the owner', async () => {
    await sql`update public.region_members set role = 'region_admin' where region_fk = ${shared} and user_fk = ${person.userId}`
    await sql`update public.region_members set role = 'region_user' where region_fk = ${shared} and user_fk = ${other.userId}`

    const preview = await previewAccountDeletion(person.userId)

    await sql`update public.region_members set role = 'region_maintainer' where region_fk = ${shared} and user_fk = ${person.userId}`
    await sql`update public.region_members set role = 'region_admin' where region_fk = ${shared} and user_fk = ${other.userId}`
    expect(preview.blocks).toEqual([])
  })

  it('sees a handover to the person that commits while it waits for the region lock', async () => {
    const handover = db.transaction(async (tx) => {
      await lockRegionMembers(tx, shared)
      await tx.execute(drizzleSql`update public.regions set created_by = ${person.userId} where id = ${shared}`)
      await new Promise((resolve) => setTimeout(resolve, 300))
    })
    await new Promise((resolve) => setTimeout(resolve, 50))
    const preview = await previewAccountDeletion(person.userId)
    await handover

    await sql`update public.regions set created_by = ${other.userId} where id = ${shared}`
    expect(preview.blocks).toEqual([{ id: shared, name: PREFIX + 'shared' }])
  })

  it('removes every link to the person, keeps what the region relies on, and drops what was theirs alone', async () => {
    expect(await deleteAccount(account(), 'pw')).toEqual({ kind: 'deleted' })

    expect(await references(person)).toEqual([])
    expect(auth.deleteUser).toHaveBeenCalledWith(person.authId)

    // The guidebook stays, unattributed.
    for (const table of ['areas', 'blocks', 'routes', 'files'] as const) {
      const key = table === 'files' ? 'photo' : table.slice(0, -1)
      expect(await exists(table, ids[key]), table).toBe(true)
    }
    expect(await exists('regions', shared)).toBe(true)

    // The thread stays whole, and the emoji too; the ascent's card and the join about them go.
    for (const key of ['root', 'reply', 'emoji', 'editComment'] as const) {
      expect(await exists('reactions', ids[key]), key).toBe(true)
    }
    expect(await exists('events', ids.card)).toBe(true)
    expect(await exists('events', ids.sent)).toBe(false)
    expect(await exists('events', ids.joined)).toBe(false)
    expect(await exists('events', ids.invited)).toBe(false)
    expect(await exists('changes', ids.editChange)).toBe(true)

    // What they had deleted keeps no words; what they left standing keeps its own.
    const bodies = await sql<{ body: string; id: number }[]>`
      select id, body from public.reactions where id in (${ids.retracted}, ${ids.root}) order by id`
    expect(bodies).toEqual([
      { body: 'Beta: left foot first', id: ids.root },
      { body: ERASED_COMMENT, id: ids.retracted },
    ])

    // What they did stays, credited to nobody.
    const actors = await sql<{ actor_fk: null | number }[]>`
      select actor_fk from public.events where id in (${ids.edit}, ${ids.promoted})
      union all select actor_fk from public.notifications where id = ${ids.nudge}`
    expect(actors).toEqual([{ actor_fk: null }, { actor_fk: null }, { actor_fk: null }])

    expect(await exists('first_ascensionists', ids.fa)).toBe(true)
    expect(await exists('feedback', ids.report)).toBe(true)

    // The other member stays, with no inviter.
    const [member] = await sql<{ invited_by: null | number }[]>`
      select invited_by from public.region_members where region_fk = ${shared} and user_fk = ${other.userId}`
    expect(member.invited_by).toBeNull()

    // The region nobody else used is gone, with its files handed to storage removal.
    expect(await exists('regions', sole)).toBe(false)
    expect(storage.remove).toHaveBeenCalledWith(expect.arrayContaining([{ video: VIDEO }]))

    // The route's community grade no longer counts the person's vote.
    const [route] = await sql<
      { grade: null | number }[]
    >`select user_grade_fk as grade from public.routes where id = ${ids.route}`
    expect(route.grade).toBe(10)
  })
})

describe.skipIf(!reachable)('deleteAccountData', () => {
  it('lets two people who reacted to the same card delete their accounts in turn', async () => {
    const [reader, ada, ben] = await Promise.all(
      ['delete_account_reader', 'delete_account_ada', 'delete_account_ben'].map((label) => createThrowawayUser(label)),
    )
    const [{ id: region }] = await sql<{ id: number }[]>`
      insert into public.regions (name, created_by) values (${PREFIX + 'twins'}, ${reader.userId}) returning id`
    const [{ id: area }] = await sql<{ id: number }[]>`
      insert into public.areas (name, created_by, region_fk, type) values ('Wand', ${reader.userId}, ${region}, 'area') returning id`
    const [{ id: card }] = await sql<{ id: number }[]>`
      insert into public.events (verb, actor_fk, region_fk, area_fk) values ('create', ${reader.userId}, ${region}, ${area})
      returning id`
    // One inbox row per reactor; the unique key tells them apart only by the actor.
    await sql`
      insert into public.notifications (region_fk, user_fk, auth_user_fk, actor_fk, event_fk, source_type) values
        (${region}, ${reader.userId}, ${reader.authId}, ${ada.userId}, ${card}, 'reaction'),
        (${region}, ${reader.userId}, ${reader.authId}, ${ben.userId}, ${card}, 'reaction')`

    try {
      for (const user of [ada, ben]) {
        await db.transaction((tx) => deleteAccountData(tx, { authUserFk: user.authId, id: user.userId }, []))
      }
      const rows = await sql<{ actor_fk: null | number }[]>`
        select actor_fk from public.notifications where event_fk = ${card}`
      expect(rows).toEqual([{ actor_fk: null }])
    } finally {
      await db.transaction((tx) => deleteRegionRows(tx, region))
      await sql`delete from public.users where id in (${reader.userId}, ${ada.userId}, ${ben.userId})`
      await sql`delete from auth.users where id in (${reader.authId}, ${ada.authId}, ${ben.authId})`
    }
  })
})
