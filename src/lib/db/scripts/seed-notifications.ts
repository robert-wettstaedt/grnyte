/**
 * Fill one account's inbox with one notification per source type, so `/notifications`, the bell
 * count, the tab dot and the OS badge can be looked at without waiting for somebody else to
 * mention you.
 *
 * Every row points at a real entity in a region both accounts belong to, so the rows hydrate the
 * way they will in production.
 *
 * Writes directly rather than going through `notify()`: the fan-out is what production exercises,
 * and driving it from here would need a request context it does not have. The trade is that this
 * script has to spell out the recipient itself, which is fine because it is told who.
 *
 * Dev DB only. Idempotent: it clears the recipient's existing rows first, so re-running gives the
 * same inbox rather than a longer one.
 *
 *   npx tsx src/lib/db/scripts/seed-notifications.ts
 *   TO=user@grnyte.rocks FROM=admin@grnyte.rocks npx tsx src/lib/db/scripts/seed-notifications.ts
 */
import postgres from 'postgres'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) throw new Error('seed-notifications: DATABASE_URL is required')

/** Whose inbox to fill, and who appears to have caused it. Never the same account: a fan-out
 *  drops the actor from its own recipients, so a self-notification cannot occur in the wild. */
const TO = process.env.TO ?? 'admin@grnyte.rocks'
const FROM = process.env.FROM ?? 'maintainer@grnyte.rocks'

if (TO === FROM) throw new Error('seed-notifications: TO and FROM must be different accounts')

const sql = postgres(DATABASE_URL, { prepare: false })

interface SeedUser {
  authUserFk: string
  email: string
  id: number
}

const people = await sql<SeedUser[]>`
  select au.email, u.id, u.auth_user_fk as "authUserFk"
  from auth.users au
  join public.users u on u.auth_user_fk = au.id
  where au.email = any(${[TO, FROM]})`

const recipient = people.find((person) => person.email === TO)
const actor = people.find((person) => person.email === FROM)
if (recipient == null) throw new Error(`seed-notifications: ${TO} not found - log in once first`)
if (actor == null) throw new Error(`seed-notifications: ${FROM} not found - log in once first`)

/**
 * A region both accounts can read.
 *
 * Not only "a region they are both in": the inbox is region-gated on the client and the SELECT
 * policy checks `region.read`, so a region whose role does not grant it would produce rows that
 * exist and are invisible, which looks exactly like a bug.
 */
const [region] = await sql<{ id: number; name: string }[]>`
  select r.id, r.name
  from public.regions r
  join public.region_members a
    on a.region_fk = r.id and a.user_fk = ${recipient.id} and a.is_active
  join public.role_permissions ap on ap.role = a.role and ap.permission = 'region.read'
  join public.region_members b
    on b.region_fk = r.id and b.user_fk = ${actor.id} and b.is_active
  join public.role_permissions bp on bp.role = b.role and bp.permission = 'region.read'
  order by r.id
  limit 1`

if (region == null) {
  throw new Error(`seed-notifications: ${TO} and ${FROM} share no readable region`)
}

/** Real subjects, so the rows render as entity rows rather than a wall of tombstones. */
const [route] = await sql<{ id: number; name: string }[]>`
  select id, name from public.routes
  where region_fk = ${region.id} and deleted_at is null
  order by id limit 1`
const [otherRoute] = await sql<{ id: number; name: string }[]>`
  select id, name from public.routes
  where region_fk = ${region.id} and deleted_at is null and id <> ${route?.id ?? 0}
  order by id limit 1`
const [ascent] = await sql<{ id: number }[]>`
  select id from public.ascents where region_fk = ${region.id} order by id limit 1`

if (route == null) throw new Error(`seed-notifications: region "${region.name}" has no routes to point at`)

/** One seed row. Typed explicitly because the literal array below does not use all five object
 *  kinds, and the `ascent_edited` row spliced in further down does: without this, TS would infer
 *  `object.type` from only the kinds present up front and reject the splice. */
interface SeedRow {
  label: string
  metadata: null | string
  minutesAgo: number
  object: { id: number; type: 'area' | 'ascent' | 'block' | 'route' | 'user' }
  read: boolean
  sourceType: string
}

/**
 * One row per source type, newest last.
 *
 * `readAt` is mixed on purpose: the unread ones carry the accent on `/notifications` and drive the
 * bell, the tab dot and the badge, and a read one proves those surfaces ignore it.
 */
const rows: SeedRow[] = [
  {
    label: `mention on route "${route.name}"`,
    metadata: null,
    minutesAgo: 8,
    object: { id: route.id, type: 'route' as const },
    read: false,
    sourceType: 'mention',
  },
  // The subject is the reader, so the inbox renders no entity row for this one, only the region.
  {
    label: 'role changed to maintainer',
    metadata: 'region_maintainer',
    minutesAgo: 26,
    object: { id: recipient.id, type: 'user' as const },
    read: false,
    sourceType: 'role_changed',
  },
  // Points at the ROUTE, not the ascent: by the time this renders the ascent is gone, and a
  // tombstone is a worse answer than the route it was on.
  {
    label: `ascent deleted, on route "${(otherRoute ?? route).name}"`,
    metadata: null,
    minutesAgo: 95,
    object: { id: (otherRoute ?? route).id, type: 'route' as const },
    read: false,
    sourceType: 'ascent_deleted',
  },
  {
    label: 'invitation accepted',
    metadata: null,
    minutesAgo: 260,
    object: { id: actor.id, type: 'user' as const },
    read: true,
    sourceType: 'invite_accepted',
  },
]

if (ascent != null) {
  rows.splice(1, 0, {
    label: `ascent #${ascent.id} edited`,
    metadata: null,
    minutesAgo: 15,
    object: { id: ascent.id, type: 'ascent' as const },
    read: false,
    sourceType: 'ascent_edited',
  })
} else {
  console.log(`note: region "${region.name}" has no ascents, so ascent_edited is skipped`)
}

// Scoped to the recipient, because that is what this script owns.
const cleared = await sql`delete from public.notifications where user_fk = ${recipient.id} returning id`

for (const row of rows) {
  // At most one of these five may be set (the sixth, `file_fk`, is never used here: a
  // notification about an upload already points at the parent it landed on). Five plain locals
  // rather than a lookup table, because the CHECK constraint is what enforces "at most
  // one" and a computed object would only restate it.
  const areaFk = row.object.type === 'area' ? row.object.id : null
  const ascentFk = row.object.type === 'ascent' ? row.object.id : null
  const blockFk = row.object.type === 'block' ? row.object.id : null
  const routeFk = row.object.type === 'route' ? row.object.id : null
  const subjectFk = row.object.type === 'user' ? row.object.id : null

  await sql`
    insert into public.notifications
      (region_fk, actor_fk, auth_user_fk, area_fk, ascent_fk, block_fk, route_fk, subject_fk,
       metadata, source_type, user_fk, created_at, read_at)
    values (
      ${region.id}, ${actor.id}, ${recipient.authUserFk}, ${areaFk}, ${ascentFk}, ${blockFk}, ${routeFk}, ${subjectFk},
      ${row.metadata}, ${row.sourceType}, ${recipient.id},
      now() - (${row.minutesAgo} || ' minutes')::interval,
      ${row.read ? sql`now() - interval '2 minutes'` : null}
    )`
  console.log(`  ${row.read ? 'read  ' : 'unread'}  ${row.sourceType.padEnd(16)} ${row.label}`)
}

const unread = rows.filter((row) => !row.read).length

await sql.end()
console.log(
  `\ncleared ${cleared.length}, seeded ${rows.length} notifications for ${TO} in "${region.name}" (${unread} unread).` +
    `\nOpen /feed for the bell and the tab dot, then /notifications - which marks them all read.`,
)
