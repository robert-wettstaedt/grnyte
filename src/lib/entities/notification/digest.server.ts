import { db as baseDb } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import { areas, ascents, blocks, routes, users } from '$lib/db/schema'
import { blockName } from '$lib/entities/block/mapper'
import { headlineEntityName } from '$lib/entities/event/cardView'
import { objectOf, type EventObjectType } from '$lib/entities/event/dto'
import { eventEntityKey, eventRefs, type EventEntityRef } from '$lib/entities/event/entity'
import { groupEvents } from '$lib/entities/event/grouping'
import { eventLines } from '$lib/entities/event/line'
import type { EventListItem } from '$lib/entities/event/mapper'
import { parseDeletedAscent, verbKey } from '$lib/entities/event/verbs'
import { resolveMessage } from '$lib/i18n/message'
import { m } from '$lib/paraglide/messages'
import { baseLocale, type Locale } from '$lib/paraglide/runtime'
import { eq, inArray } from 'drizzle-orm'

/**
 * The digest sentence, rendered from the same catalogue the feed card renders.
 *
 * No hydration layer, because two of the three ingredients are already free: `groupEvents` is pure
 * and takes plain rows, and the catalogue lookup is pure on one row. Only the entity NAME is
 * missing, and that is one flat `select id, name` for the single entity the headline names.
 *
 * Deliberately no region name and no grades. Naming the region only pays off for multi-region
 * members, and for exactly those a batch can span several regions, which is where the phrasing
 * falls apart. Grade labels are per-user (FB against V), which is what dragged 1.0 into template
 * strings substituted at send time; not reintroducing that.
 */

export interface DigestCopy {
  body: string | undefined
  title: string
}

/**
 * What the digest needs off an `events` row, which a row straight from the table satisfies.
 *
 * The six object columns rather than the polymorphic pair, so `objectOf` reads the object here the
 * same way the feed's mapper reads it off a synced row.
 *
 * `ascentType` is not a column of `events`: the catalogue keys a logged ascent on the type
 * (`ascent:created:flash`), which used to live in `activities.new_value` and is now a column of
 * the ascent itself. The caller joins it, because without it every send in the digest degrades to
 * the generic sentence.
 */
export type DigestEvent = Pick<
  schema.Event,
  | 'actorFk'
  | 'areaFk'
  | 'ascentFk'
  | 'blockFk'
  | 'fileFk'
  | 'id'
  | 'metadata'
  | 'regionFk'
  | 'routeFk'
  | 'subjectFk'
  | 'verb'
> & {
  /**
   * When the ascent was climbed (`ascents.date_time`), which is not when it was logged.
   *
   * Here for grouping alone: a session is one climb day, so without this the digest folds two days
   * at the crag into one card where the feed shows two, and the "and N more" it reports is a count
   * of a card the reader will not find. Nothing in a push sentence renders it.
   */
  ascentClimbedAt?: Date | null | string
  ascentType?: null | string
  /** The first column an update moved, which is what the catalogue keys its sentence on. */
  changedColumn?: null | string
  createdAt: Date
  parentId?: null | number | string
  parentType?: null | string
}

/**
 * Render a batch of events as one headline plus a count of the rest.
 *
 * The headline is the newest group's, which is what a reader would see at the top of the feed if
 * they opened it now; everything else is a number, because a push that lists things is a push
 * nobody finishes reading.
 */
export async function digestCopy(
  events: readonly DigestEvent[],
  actorNames: ReadonlyMap<number, string>,
  locale: Locale,
): Promise<DigestCopy | undefined> {
  if (events.length === 0) {
    return undefined
  }

  const groups = groupEvents(events.map(toEventItem))
  const [newest] = groups

  if (newest == null) {
    return undefined
  }

  // Through the catalogue adapter, exactly as the card does: an update expands to one row per
  // changed column, everything else to one. What the digest reads off them (the refs, the verb,
  // the stored name) is what the card reads.
  const lines = newest.events.flatMap(eventLines)
  const refs = eventRefs(lines)
  // What the card would put a row under, falling back to what the events are about: an upload
  // names the thing it landed on rather than the file, which has no name worth reading.
  const subject = refs.rows[0] ?? refs.subjects[0]
  const names = await entityNames(subject == null ? [] : [subject], locale)

  const lead = lines[0]
  const climber = parseDeletedAscent(lead.metadata ?? undefined)

  // Through the same precedence the feed card uses, not the database alone. A deleted area is
  // gone from `areas` and its name survives only in `oldValue`; an invitation deliberately has no
  // hydrated subject at all. Looking only at what `entityNames` found would announce both of
  // those with `common_unnamed`.
  const hydrated = subject == null ? undefined : names.get(eventEntityKey(subject))
  const name = headlineEntityName(lead, hydrated == null ? null : { name: hydrated, row: 'none' })

  const title = resolveMessage(
    verbKey(lead),
    {
      actor: actorNames.get(lead.actorFk) ?? '',
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

  const rest = events.length - newest.events.length

  return { body: rest > 0 ? m.push_digestMore({ count: rest }, { locale }) : undefined, title }
}

/**
 * The display name of each ref, by {@link eventEntityKey}.
 *
 * One query per entity kind actually present, with known ids. An ascent borrows its route's name,
 * the same substitution the feed makes, because "an ascent" is not a thing anybody can picture.
 */
export async function entityNames(
  refs: readonly EventEntityRef[],
  locale: Locale = baseLocale,
): Promise<Map<string, string>> {
  const names = new Map<string, string>()

  const idsOf = (type: EventObjectType): number[] => [
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

/** A stored event in the shape the pure grouping and catalogue functions read. */
function toEventItem(event: DigestEvent): EventListItem {
  const object = objectOf(event)

  return {
    actorFk: event.actorFk,
    // No actor name: the digest passes actors in separately, keyed by id, because one batch spans
    // several of them and only the headline's is ever read.
    actorName: '',
    // No change rows. The digest renders one headline, which reads the event's own verb; a card's
    // change LINES are the one thing a push deliberately does not list.
    changes:
      event.changedColumn == null
        ? []
        : [
            {
              columnName: event.changedColumn,
              newValue: undefined,
              objectId: undefined,
              objectType: undefined,
              oldValue: undefined,
            },
          ],
    // Neither reaches a push: a digest is region activity, and what people said about it is the
    // directed half's business.
    commentCount: 0,
    createdAt: event.createdAt.getTime(),
    // What the catalogue reads off an entity (the ascent type) plus what the GROUPING reads off it
    // (the climb day, which decides where one session card ends). Everything else it needs is
    // resolved by name, further up.
    entity:
      event.ascentType == null
        ? undefined
        : {
            ascentType: event.ascentType as never,
            climbedAt: event.ascentClimbedAt == null ? undefined : new Date(event.ascentClimbedAt).getTime(),
            name: '',
            row: 'none',
          },
    id: event.id,
    metadata: event.metadata ?? undefined,
    objectId: object?.id ?? 0,
    objectType: object?.type ?? 'area',
    // What a burst groups on, joined by the caller. Without it every edit under one block is its
    // own group, which only ever inflates the "and 12 more" count.
    parent:
      event.parentId == null || event.parentType == null
        ? undefined
        : { id: event.parentId, type: event.parentType as never },
    parentEntity: undefined,
    // A push never says the community turned up: a digest is region activity, and what people made
    // of it is the directed half's business, same as the reactions and comments above.
    promoted: false,
    reactions: [],
    regionFk: event.regionFk,
    verb: event.verb,
  }
}
