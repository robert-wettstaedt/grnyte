import { db as baseDb } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import { areas, ascents, blocks, routes, users } from '$lib/db/schema'
import { headlineEntityName } from '$lib/entities/activity/card'
import { toActivityListItem, type ActivityEntityType, type ActivityListItem } from '$lib/entities/activity/dto'
import { activityEntityKey, activityRefs, type ActivityEntityRef } from '$lib/entities/activity/entity'
import { groupActivities } from '$lib/entities/activity/grouping'
import { activityVerb, parseDeletedAscent } from '$lib/entities/activity/verbs'
import { blockName } from '$lib/entities/block/mapper'
import { resolveMessage } from '$lib/i18n/message'
import { m } from '$lib/paraglide/messages'
import { baseLocale, type Locale } from '$lib/paraglide/runtime'
import { eq, inArray } from 'drizzle-orm'

/**
 * The digest sentence, rendered from the same catalogue the feed card renders.
 *
 * No hydration layer, because two of the three ingredients are already free: `groupActivities` is
 * pure and takes plain rows, and `activityVerb` is a pure lookup on one row. Only the entity NAME
 * is missing, and that is one flat `select id, name` for the single entity the headline names.
 *
 * Deliberately no region name and no grades. Naming the region only pays off for multi-region
 * members, and for exactly those a batch can span several regions, which is where the phrasing
 * falls apart. Grade labels are per-user (FB against V), which is what dragged 1.0 into template
 * strings substituted at send time; not reintroducing that.
 */

/** What the digest needs off an `activities` row. A row from the table satisfies it. */
export type DigestActivity = Pick<
  schema.Activity,
  | 'columnName'
  | 'entityId'
  | 'entityType'
  | 'id'
  | 'metadata'
  | 'newValue'
  | 'oldValue'
  | 'parentEntityId'
  | 'parentEntityType'
  | 'regionFk'
  | 'type'
  | 'userFk'
> & { createdAt: Date }

export interface DigestCopy {
  body: string | undefined
  title: string
}

/**
 * Render a batch of activities as one headline plus a count of the rest.
 *
 * The headline is the newest group's, which is what a reader would see at the top of the feed if
 * they opened it now; everything else is a number, because a push that lists things is a push
 * nobody finishes reading.
 */
export async function digestCopy(
  activities: readonly DigestActivity[],
  actorNames: ReadonlyMap<number, string>,
  locale: Locale,
): Promise<DigestCopy | undefined> {
  if (activities.length === 0) {
    return undefined
  }

  const rows = activities.map(toListItem)
  const groups = groupActivities(rows)
  const [newest] = groups

  if (newest == null) {
    return undefined
  }

  const refs = activityRefs(newest.activities)
  // What the card would put a row under, falling back to what the activities are about: an upload
  // names the thing it landed on rather than the file, which has no name worth reading.
  const subject = refs.rows[0] ?? refs.subjects[0]
  const names = await entityNames(subject == null ? [] : [subject], locale)

  const lead = newest.activities[0]
  const climber = parseDeletedAscent(lead.metadata ?? undefined)

  // Through the same precedence the feed card uses, not the database alone. A deleted area is
  // gone from `areas` and its name survives only in `oldValue`; an invitation deliberately has no
  // hydrated subject at all. Looking only at what `entityNames` found would announce both of
  // those with `common_unnamed`.
  const hydrated = subject == null ? undefined : names.get(activityEntityKey(subject))
  const name = headlineEntityName(lead, hydrated == null ? null : { name: hydrated, row: 'none' })

  const title = resolveMessage(
    activityVerb(lead),
    {
      actor: actorNames.get(lead.userFk) ?? '',
      climber: climber?.climberName ?? '',
      media: 'none',
      name: name ?? m.common_unnamed({}, { locale }),
      owner: climber == null ? 'none' : 'other',
      // Always the third person: a digest is never about something the reader did, because their
      // own activity is filtered out of the query before it ever gets here.
      person: 'other',
    },
    // Explicit, because this runs on the server once per recipient: without it every push would
    // come out in whatever locale the cron's request happened to resolve to, which is nobody's.
    { locale },
  )

  const rest = activities.length - newest.activities.length

  return { body: rest > 0 ? m.push_digestMore({ count: rest }, { locale }) : undefined, title }
}

/**
 * The display name of each ref, by {@link activityEntityKey}.
 *
 * One query per entity kind actually present, with known ids. An ascent borrows its route's name,
 * the same substitution the feed makes, because "an ascent" is not a thing anybody can picture.
 */
export async function entityNames(
  refs: readonly ActivityEntityRef[],
  locale: Locale = baseLocale,
): Promise<Map<string, string>> {
  const names = new Map<string, string>()

  const idsOf = (type: ActivityEntityType): number[] => [
    ...new Set(refs.flatMap((ref) => (ref.type === type ? [Number(ref.id)] : [])).filter(Number.isInteger)),
  ]

  const areaIds = idsOf('area')
  const ascentIds = idsOf('ascent')
  const blockIds = idsOf('block')
  const routeIds = idsOf('route')
  const userIds = idsOf('user')

  if (areaIds.length > 0) {
    for (const row of await baseDb
      .select({ id: areas.id, name: areas.name })
      .from(areas)
      .where(inArray(areas.id, areaIds))) {
      names.set(`area:${row.id}`, row.name)
    }
  }

  if (blockIds.length > 0) {
    for (const row of await baseDb
      .select({ id: blocks.id, name: blocks.name, order: blocks.order })
      .from(blocks)
      .where(inArray(blocks.id, blockIds))) {
      // The same fallback the app's block mapper applies, so a push about a nameless block
      // reads "Block 3" like the screen it links to, not the generic `common_unnamed`.
      names.set(`block:${row.id}`, blockName(row.name, row.order, locale))
    }
  }

  if (routeIds.length > 0) {
    for (const row of await baseDb
      .select({ id: routes.id, name: routes.name })
      .from(routes)
      .where(inArray(routes.id, routeIds))) {
      names.set(`route:${row.id}`, row.name)
    }
  }

  if (userIds.length > 0) {
    for (const row of await baseDb
      .select({ id: users.id, name: users.username })
      .from(users)
      .where(inArray(users.id, userIds))) {
      names.set(`user:${row.id}`, row.name)
    }
  }

  if (ascentIds.length > 0) {
    for (const row of await baseDb
      .select({ id: ascents.id, name: routes.name })
      .from(ascents)
      .innerJoin(routes, eq(routes.id, ascents.routeFk))
      .where(inArray(ascents.id, ascentIds))) {
      names.set(`ascent:${row.id}`, row.name)
    }
  }

  return names
}

/** An `activities` row in the shape the pure grouping and catalogue functions read. */
function toListItem(activity: DigestActivity): ActivityListItem {
  // No actor name: the digest passes actors in separately, keyed by id, because one batch spans
  // several of them and only the headline's is ever read.
  return toActivityListItem({ ...activity, createdAt: activity.createdAt.getTime(), userName: '' })
}
