import type { AscentType } from '$lib/entities/ascent/dto'
import type { MediaFile } from '$lib/entities/file/dto'
import type { Geolocation } from '$lib/entities/geolocation/dto'
import type { RouteListItem } from '$lib/entities/route/dto'
import type { Coords } from '$lib/map/map'
import type { ActivityEntityType, ActivityListItem } from './dto'
import { activityEntry } from './verbs'

/**
 * The hydration contract: what the feed has to fetch, and the shape it hands back.
 *
 * `activities.entityId` is `text` and `entityType` is polymorphic, so Zero cannot join a
 * row to the entity it describes. The ids are collected here, fetched through the
 * per-entity list resources, and joined in memory. What a card then *says* about those
 * entities lives in `card.ts`.
 */

/**
 * One hydrated entity, flattened into exactly what a card renders. Deliberately one
 * flat shape rather than a union per entity kind: the card picks a row component from
 * `row` and every other field is optional, so the feed's hydration pass maps four
 * different list resources into it without four different mappers.
 */
export interface ActivityEntity {
  /**
   * The climber's own grade opinion (`ascents.gradeFk`), which is NOT the community grade the
   * route row beside it renders. A card that logged one shows it in its own labelled strip,
   * because two grades side by side with nothing to tell them apart reads as a bug.
   */
  ascentGradeFk?: number
  /** The climber's own rating, in the same strip and for the same reason. */
  ascentRating?: number
  /** Ascent type when the row stands for an ascent, so its route row shows the status glyph. */
  ascentType?: AscentType
  /**
   * When the ascent was climbed (`ascents.dateTime`), which is not when it was logged. The
   * card's clock is the log time, so a session logged the morning after says so in its sub line.
   */
  climbedAt?: number
  /**
   * Whose ascent it is (`ascents.createdBy`). A region maintainer may edit anyone's, so the
   * headline has to say whether the actor edited their own or somebody else's; without
   * this it can only say "an ascent", which is what nobody could read.
   */
  climberFk?: number
  /** That climber's username, for the headline slot. */
  climberName?: string
  /** Breadcrumb path for the row, e.g. the parent area and block. */
  crumbs?: string[]
  /** Secondary line for area rows. */
  description?: string
  /** Media the card renders full width above the rows. */
  files?: MediaFile[]
  /** Already-resolved row link. */
  href?: string
  /** The ascent's humidity, half of the conditions pill in the same strip as the grade. */
  humidity?: number
  /** Display name; the card's headline interpolates it. */
  name: string
  /** An ascent's notes, quoted under the rows. */
  note?: string
  /**
   * The area's approach paths (`areas.geoPaths`, already decoded), drawn on the thumbnail of a
   * parking change. Only areas carry any, which is what keeps a block's location line pathless.
   */
  paths?: Coords[][]
  /**
   * The block's pin, drawn as a map thumbnail on the card that created it. The create row
   * carries no coordinates of its own, so this is the pin as it stands today.
   */
  pin?: Geolocation
  /** The route the row renders, for `route` rows. */
  route?: ActivityRoute
  /** Which entity row the card renders. `none` renders the name alone. */
  row: 'area' | 'block' | 'none' | 'route' | 'user'
  /** The ascent's temperature, the other half of the conditions pill. */
  temperature?: number
  /** Thumbnail for block rows. */
  topoImagePath?: string
}

/**
 * Hydration result, keyed by {@link activityEntityKey}. A missing key means the entity
 * has not synced yet (the card renders a skeleton); an explicit `null` means hydration
 * finished without it, so it is gone (the card renders a tombstone).
 */
export type ActivityEntityMap = ReadonlyMap<string, ActivityEntity | null>

/** The polymorphic `(entityType, entityId)` pair an activity points at. */
export interface ActivityEntityRef {
  id: string
  type: ActivityEntityType
}

/** The slice of a route an activity card's row renders. A `RouteListItem` satisfies it. */
export type ActivityRoute = Pick<
  RouteListItem,
  'description' | 'gradeFk' | 'name' | 'rating' | 'tags' | 'topoImagePath' | 'topoPoints'
>

export function activityEntityKey(ref: ActivityEntityRef): string {
  return `${ref.type}:${ref.id}`
}

/**
 * The entities a card renders as rows, newest first, each listed once.
 *
 * A row whose entry declares `names: 'stored'` contributes nothing: its `entityId` does not
 * point at what the card is about. An invitation points at the inviter, so fetching it put
 * the inviter's row under a headline naming the invitee.
 */
export function activityEntityRefs(activities: readonly ActivityListItem[]): ActivityEntityRef[] {
  return dedupe(
    activities.flatMap((activity) =>
      activityEntry(activity)?.names === 'stored' ? [] : [{ id: activity.entityId, type: activity.entityType }],
    ),
  )
}

/**
 * Everything a window of activities has to fetch: the entities the cards point at, plus
 * the parents a headline names. "Made 12 edits in Nordblock" needs the block, and none of
 * those twelve rows is *about* the block, so the parents have to be collected separately.
 */
export function activityHydrationRefs(activities: readonly ActivityListItem[]): ActivityEntityRef[] {
  return dedupe(
    activities.flatMap((activity) => [
      ...activityEntityRefs([activity]),
      ...(activity.parentEntityId == null || activity.parentEntityType == null
        ? []
        : [{ id: activity.parentEntityId, type: activity.parentEntityType }]),
    ]),
  )
}

/**
 * The entities a card renders as ROWS, which is not always what its activities point at.
 *
 * An upload points at a file, whose name is a cuid and whose only page is the media viewer, so
 * the row worth showing under the headline is the thing it was attached to. That is exactly
 * what the row already names as its parent, which is why the same entries that borrow the
 * parent's name also borrow its row.
 *
 * An entry that declares `row: 'none'` renders none at all: a removed member is out of the
 * region, so the row would be a dead end even when the person still hydrates.
 */
export function activityRowRefs(activities: readonly ActivityListItem[]): ActivityEntityRef[] {
  return dedupe(
    activities.flatMap((activity) => {
      const entry = activityEntry(activity)

      if (entry?.row === 'none' || entry?.names === 'stored') {
        return []
      }

      if (entry?.names !== 'parent') {
        return [{ id: activity.entityId, type: activity.entityType }]
      }

      return activity.parentEntityId == null || activity.parentEntityType == null
        ? []
        : [{ id: activity.parentEntityId, type: activity.parentEntityType }]
    }),
  )
}

function dedupe(refs: readonly ActivityEntityRef[]): ActivityEntityRef[] {
  const seen = new Set<string>()

  return refs.reduce<ActivityEntityRef[]>((unique, ref) => {
    const key = activityEntityKey(ref)

    if (!seen.has(key)) {
      seen.add(key)
      unique.push(ref)
    }

    return unique
  }, [])
}
