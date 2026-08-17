import { activityCard, type ActivityCardView } from '$lib/entities/activity/card'
import type { ActivityEntity, ActivityEntityMap, ActivityEntityRef } from '$lib/entities/activity/entity'
import type { ActivityGroup } from '$lib/entities/activity/grouping'
import type { TopoView } from '$lib/entities/topo/dto'
import type { EventGroup } from './grouping'
import { legacyRows } from './legacy'

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
): ActivityCardView {
  const view = activityCard(toActivityGroup(group), entityMap(group), currentUserFk, topos, omit)

  return {
    ...view,
    // Never pending. The entity arrives with its event, so a name that is missing is missing for
    // good, where the old pass had to keep the slot pulsing until every fetch had answered.
    entityUnnamed: view.entityName == null,
    // For the same reason there is no skeleton state to render.
    rows: view.rows.map((row) => (row.state === 'skeleton' ? { ...row, state: 'tombstone' as const } : row)),
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
    // events is about it; the old pass fetched parents for exactly this reason. An upload's
    // entity IS its parent's (the mapper borrows it), so this stores it under both keys, which is
    // what lets the headline find it whichever way it looks.
    if (event.parent != null) {
      const key = `${event.parent.type}:${event.parent.id}`
      if (!entities.has(key) && event.objectType === 'file') {
        entities.set(key, event.entity)
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
