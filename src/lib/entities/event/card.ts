import { activityCard, type ActivityCardRow, type ActivityCardView } from '$lib/entities/activity/card'
import type { ActivityEntity, ActivityEntityMap, ActivityEntityRef } from '$lib/entities/activity/entity'
import type { ActivityGroup } from '$lib/entities/activity/grouping'
import type { ReactionChip } from '$lib/entities/reaction/dto'
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
export interface EventCardView extends ActivityCardView {
  /**
   * Bars with no row of their own. Empty for most cards.
   *
   * Optional so a plain `ActivityCardView` still is one of these: the catalogue stories build
   * their cards straight out of fixtures with no events behind them, and a story has nothing to
   * react to.
   */
  bars?: EventReactionBar[]
  rows: (ActivityCardRow & { bar?: EventReactionBar })[]
}

/** One event's reactions, and the handle the toggle posts back. */
export interface EventReactionBar {
  chips: ReactionChip[]
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
 * Deliberately an adapter over `activityCard` rather than a second implementation. That function
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
  omit?: ActivityEntityRef,
): EventCardView {
  const view = activityCard(toActivityGroup(group), entityMap(group), currentUserFk, topos, omit)

  // Keyed by event id, and taken as each row claims one: what is left at the end is what no row
  // speaks for. `sourceId` is the id of the row that named the entity, which in the legacy shape
  // an event expands into, so it is the event's own id.
  const unclaimed = new Map(group.events.map((event) => [event.id, bar(event, currentUserFk)]))

  const rows = view.rows.map((row) => {
    const claimed = row.sourceId == null ? undefined : unclaimed.get(row.sourceId)
    if (claimed != null) {
      unclaimed.delete(claimed.eventId)
    }

    return {
      ...row,
      bar: claimed,
      // Never pending. The entity arrives with its event, so there is no second wave to wait for
      // and no skeleton state to render.
      state: row.state === 'skeleton' ? ('tombstone' as const) : row.state,
    }
  })

  return {
    ...view,
    // A card with one event always offers somewhere to react, even when its row was dropped (the
    // entity's own log omits the row that would link back to the page the reader is on). A leftover
    // on a card with several only appears when it already carries chips, because a bar nobody can
    // see is a bar nobody can add to: what it exists for is that a reaction taken on one card
    // cannot become invisible when the window regroups.
    bars: [...unclaimed.values()].filter((left) => left.chips.length > 0 || group.events.length === 1),
    // Same reason as `state` above: a name that is missing is missing for good, where the old pass
    // had to keep the slot pulsing until every fetch had answered.
    entityUnnamed: view.entityName == null,
    rows,
  }
}

function bar(event: EventListItem, currentUserFk: number | undefined): EventReactionBar {
  return {
    chips: reactionChips(event.reactions, currentUserFk),
    eventId: event.id,
    readonly: event.actorFk === currentUserFk,
  }
}

/**
 * What the hydration pass used to fetch, assembled from what the rows already carried.
 *
 * Keyed the way `activityEntityKey` keys it, because that is what the card looks rows up by. An
 * event whose object contributes no entity (a file with no parent) is left absent rather than
 * stored as `null`: absent used to mean "still syncing", and nothing syncs any more, so the card's
 * two remaining states collapse onto the one it can still render.
 */
function entityMap(group: EventGroup): ActivityEntityMap {
  const entities = new Map<string, ActivityEntity | null>()

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
function toActivityGroup(group: EventGroup): ActivityGroup {
  return {
    activities: group.events.flatMap(legacyRows),
    createdAt: group.createdAt,
    id: group.id,
    kind: group.kind,
    userFk: group.actorFk,
  }
}
