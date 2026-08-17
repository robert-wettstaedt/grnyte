import type { CardGroup } from '$lib/entities/event/cardGroup'
import { cardView, type CardRow, type CardView } from '$lib/entities/event/cardView'
import type { EventEntity, EventEntityMap, EventEntityRef } from '$lib/entities/event/entity'
import type { CommentListItem, ReactionChip } from '$lib/entities/reaction/dto'
import { reactionChips } from '$lib/entities/reaction/mapper'
import type { TopoView } from '$lib/entities/topo/dto'
import type { EventGroup } from './grouping'
import { legacyRows } from './legacy'
import type { EventListItem } from './mapper'

/**
 * A card, plus where its reactions go.
 *
 * One bar per EVENT, not per card. That is what per-ascent granularity buys: a session of five
 * ascents is five events, so a reader can congratulate the one send they mean rather than the
 * afternoon. A bar rides the row its event named; anything left over (a card whose row was omitted
 * on the entity's own page, an event whose row collapsed into a sibling's) falls to the footer, so
 * a reaction that exists is always somewhere a reader can see and take back.
 */
export interface EventCardView extends CardView {
  /**
   * Bars with no row of their own. Empty for most cards.
   *
   * Optional so a plain `CardView` still is one of these: the catalogue stories build
   * their cards straight out of fixtures with no events behind them, and a story has nothing to
   * react to.
   */
  bars?: EventReactionBar[]
  rows: (CardRow & { bar?: EventReactionBar })[]
}

/** One event's reactions and its thread, plus the handle both post back. */
export interface EventReactionBar {
  chips: ReactionChip[]
  /** The thread under this event, oldest first. */
  comments: CommentListItem[]
  eventId: number
  /**
   * The reader's own event, so the bar lists its chips and offers nothing to add.
   * `toggleReaction` refuses the same case; this is what stops the button being there to press.
   */
  readonly: boolean
}

/**
 * A card, built from events.
 *
 * Deliberately an adapter over `cardView` rather than a second implementation. That function
 * is 450 lines of decisions nobody wants made twice (which name a headline puts in its slot, when
 * a climber is named, how a removal picks its media word, what a merged create-plus-media card
 * says), and `cases.ts` pins them with fixtures measured in six figures. Reimplementing it against
 * the new shape would mean reproducing all of that from scratch and re-deriving the tests, with
 * every difference showing up as a wrong sentence on a card rather than as a failure.
 *
 * What events actually change is the INPUT, not the reasoning: an event knows its own entity, so
 * the hydration map that used to arrive separately is built here from what the rows already
 * carried. Everything downstream is unchanged, which is the point.
 *
 * ponytail: this and `legacy.ts` retire together when the catalogue is rekeyed on the verb during
 * the rename. Until then the feed runs the card code it has always run, so switching it over
 * cannot regress a sentence.
 */
export function eventCard(
  group: EventGroup,
  currentUserFk: number | undefined,
  topos?: ReadonlyMap<number, TopoView>,
  omit?: EventEntityRef,
): EventCardView {
  const view = cardView(toActivityGroup(group), entityMap(group), currentUserFk, topos, omit)

  // Each row claims the event it is about; what is left at the end is what no row speaks for.
  const unclaimed = new Map(group.events.map((event) => [event.id, event]))

  const rows = view.rows.map((row) => {
    const claimed = claim(unclaimed, row.ref)

    return {
      ...row,
      bar: claimed == null ? undefined : bar(claimed, currentUserFk),
      // Never pending. The entity arrives with its event, so there is no second wave to wait for
      // and no skeleton state to render.
      state: row.state === 'skeleton' ? ('tombstone' as const) : row.state,
    }
  })

  const leftover = [...unclaimed.values()].map((event) => bar(event, currentUserFk))

  return {
    ...view,
    // What no row spoke for: every leftover that already carries something, so a reaction or a
    // comment taken on one card cannot go invisible when the window regroups it, PLUS the first
    // one on a card with no rows at all. That second half is what the entity's own page needs: it
    // drops the row that would link back to the page the reader is already on, and without it
    // there would be nothing there to react to or comment under.
    //
    // ponytail: an event past `MAX_ROWS` (the fifth ascent of a session, behind "1 more") gets no
    // bar of its own. Upgrade = render the overflow rows rather than counting them.
    bars: leftover.filter(
      (left, index) => left.chips.length > 0 || left.comments.length > 0 || (rows.length === 0 && index === 0),
    ),
    // Same reason as `state` above: a name that is missing is missing for good, where the old pass
    // had to keep the slot pulsing until every fetch had answered.
    entityUnnamed: view.entityName == null,
    rows,
  }
}

/**
 * One event's bar.
 *
 * Always one, your own card included. `readonly` takes the reaction half away there, since nobody
 * applauds their own event, but the comment button stays: being the person a card is about is the
 * most likely reason to have something to say under it, and answering somebody is the other. An
 * earlier version dropped the bar for that case, which left a card of yours with no way into its
 * own thread until somebody else had started one.
 */
function bar(event: EventListItem, currentUserFk: number | undefined): EventReactionBar {
  return {
    chips: reactionChips(event.reactions, currentUserFk),
    comments: event.comments.map((comment) => ({ ...comment, mine: comment.authorFk === currentUserFk })),
    eventId: event.id,
    readonly: event.actorFk === currentUserFk,
  }
}

/**
 * Take the event a row is about out of the pool, or nothing if none is left.
 *
 * The event whose OBJECT is that entity, else the one whose parent is: an upload's object is the
 * file, and the row it draws is the thing the photos landed on. Oldest of the candidates rather
 * than newest, which is what keeps a bar still: log an ascent and edit it a minute later and both
 * are one card with one row, and the reader means to congratulate the send rather than the
 * correction. It also stops a bar moving when a sixth photo joins a five-photo card.
 */
function claim(
  unclaimed: Map<number, EventListItem>,
  ref: { id: number | string; type: string },
): EventListItem | undefined {
  const key = `${ref.type}:${ref.id}`
  const candidates = [...unclaimed.values()]
  const matches = (event: EventListItem, part: undefined | { id: number | string; type: string }) =>
    part != null && `${part.type}:${part.id}` === key && event != null

  const byObject = candidates.filter((event) => matches(event, { id: event.objectId, type: event.objectType }))
  const pool = byObject.length > 0 ? byObject : candidates.filter((event) => matches(event, event.parent))

  const oldest = pool.reduce<EventListItem | undefined>(
    (lowest, event) =>
      lowest == null ||
      event.createdAt < lowest.createdAt ||
      (event.createdAt === lowest.createdAt && event.id < lowest.id)
        ? event
        : lowest,
    undefined,
  )

  if (oldest != null) {
    unclaimed.delete(oldest.id)
  }

  return oldest
}

/**
 * What the hydration pass used to fetch, assembled from what the rows already carried.
 *
 * Keyed the way `eventEntityKey` keys it, because that is what the card looks rows up by. An
 * event whose object contributes no entity (a file with no parent) is left absent rather than
 * stored as `null`: absent used to mean "still syncing", and nothing syncs any more, so the card's
 * two remaining states collapse onto the one it can still render.
 */
function entityMap(group: EventGroup): EventEntityMap {
  const entities = new Map<string, EventEntity | null>()

  for (const event of group.events) {
    if (event.entity == null) {
      continue
    }

    entities.set(`${event.objectType}:${event.objectId}`, event.entity)

    // The parent too. "Made 12 edits in Nordblock" names the block, and none of those twelve
    // events is about it; the old pass fetched parents for exactly this reason. An upload's entity
    // IS its parent's (the mapper borrows it), so a file stores it under both keys, which is what
    // lets the headline find it whichever way it looks.
    //
    // Never over an entry already there: an event ABOUT the parent carries the full entity, and
    // `parentEntity` is only the name and the link.
    if (event.parent != null) {
      const key = `${event.parent.type}:${event.parent.id}`
      const parent = event.objectType === 'file' ? event.entity : event.parentEntity
      if (!entities.has(key) && parent != null) {
        entities.set(key, parent)
      }
    }
  }

  return entities
}

/**
 * The group as the card reads it: every event expanded into the legacy rows it stands for.
 *
 * An `update` expands to one row per changed column, which is exactly what the old table stored,
 * so a card that used to hold twelve rows still holds twelve.
 */
function toActivityGroup(group: EventGroup): CardGroup {
  return {
    createdAt: group.createdAt,
    id: group.id,
    kind: group.kind,
    rows: group.events.flatMap(legacyRows),
    userFk: group.actorFk,
  }
}
