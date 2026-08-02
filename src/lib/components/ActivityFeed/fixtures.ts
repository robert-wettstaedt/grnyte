/**
 * Story data for the activity feed: the design's sample week, built from the same
 * `(entityType, type, columnName)` triples the mutation layer actually writes, then folded
 * by the real `groupActivities`. Storybook only — nothing in the app imports this.
 */
import { activityCard, type ActivityCardView, type ActivityChange } from '$lib/entities/activity/card'
import type { ActivityListItem } from '$lib/entities/activity/dto'
import {
  activityEntityKey,
  type ActivityEntity,
  type ActivityEntityMap,
  type ActivityEntityRef,
} from '$lib/entities/activity/entity'
import { groupActivities, type ActivityGroup } from '$lib/entities/activity/grouping'
import type { MediaFile } from '$lib/entities/file/dto'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** The signed-in climber, so one card in the week reads "You …". */
export const ME = 1

const PEOPLE: Record<number, string> = {
  2: 'Tomas Kessler',
  3: 'Sofia Brandt',
  4: 'Jonas Weber',
  5: 'Mara Lindqvist',
  [ME]: 'Ada Rossi',
}

let nextId = 1

/** Wall-clock base. Read once so every card in a story dates off the same moment. */
const base = Date.now()

export function activity(
  minutesAgo: number,
  partial: Partial<ActivityListItem> & Pick<ActivityListItem, 'userFk'>,
): ActivityListItem {
  return {
    columnName: undefined,
    createdAt: base - minutesAgo * MINUTE,
    entityId: '1',
    entityType: 'route',
    id: nextId++,
    metadata: undefined,
    newValue: undefined,
    oldValue: undefined,
    parentEntityId: undefined,
    parentEntityType: undefined,
    regionFk: 1,
    type: 'updated',
    userName: PEOPLE[partial.userFk] ?? '',
    ...partial,
  }
}

/**
 * The changes an expanded card would show, one activity at a time so a story can hand in a
 * set that grouping would otherwise split. Runs the real `activityCard`, so a story cannot
 * drift from what a card actually renders.
 */
export function changes(activities: ActivityListItem[]): ActivityChange[] {
  return activities.flatMap((activity) => view(groupActivities([activity])[0]).changes)
}

/** The map the feed hands cards: an absent key is still syncing, an explicit null is gone. */
export function entityMap(entries: [ActivityEntityRef, ActivityEntity | null][]): Map<string, ActivityEntity | null> {
  return new Map(entries.map(([ref, entity]) => [activityEntityKey(ref), entity]))
}

/** Groups a story's activities exactly as the feed page will. */
export function groups(activities: ActivityListItem[]): ActivityGroup[] {
  return groupActivities(activities)
}

export function photo(id: string): MediaFile {
  return {
    ascentCreatedBy: undefined,
    bunnyStreamFk: undefined,
    createdAt: base - HOUR,
    height: 900,
    id,
    path: 'topo-sample.svg',
    regionFk: 1,
    source: undefined,
    uploader: undefined,
    visibility: 'public',
    width: 1200,
  }
}

/** What a card says about a group, decided by the same function the feed calls. */
export function view(group: ActivityGroup, entities?: ActivityEntityMap, currentUserFk?: number): ActivityCardView {
  return activityCard(group, entities, currentUserFk)
}

/** An ascent's route row, plus whose ascent it is (so the headline can say). */
function ascent(name: string, gradeFk: number, climberFk: number, extra: Partial<ActivityEntity> = {}): ActivityEntity {
  return route(name, gradeFk, { climberFk, climberName: PEOPLE[climberFk], ...extra })
}

function route(name: string, gradeFk: number, extra: Partial<ActivityEntity> = {}): ActivityEntity {
  return {
    crumbs: ['Westwand', 'Nordblock'],
    href: '#',
    name,
    route: { description: '', gradeFk, name, rating: 2, tags: [] },
    row: 'route',
    ...extra,
  }
}

const NOTES = 'Cold and dry, the crux crimp finally felt sticky. Went second try after brushing the top.'

/**
 * The week from the design: a flash with photos, a four-ascent session, a twelve-edit
 * burst, a topo redraw, a new area, a grade change, a removed photo, a deleted route
 * (tombstone), a role grant and an ascent that has not hydrated yet (skeleton).
 */
export const sampleWeek: { activities: ActivityListItem[]; entities: Map<string, ActivityEntity | null> } = (() => {
  const activities: ActivityListItem[] = [
    // Flash, with the ascent's photos and notes.
    activity(12, { entityId: '9001', entityType: 'ascent', newValue: 'flash', type: 'created', userFk: 2 }),

    // One climber's session: four ascents logged in one sitting.
    ...['redpoint', 'redpoint', 'flash', 'attempt'].map((ascentType, index) =>
      activity(180 + index * 5, {
        entityId: String(9002 + index),
        entityType: 'ascent',
        newValue: ascentType,
        type: 'created',
        userFk: 3,
      }),
    ),

    // Five photos from one submit. Each is its own row pointing at its own file, and they
    // fold into one card because they agree on the block they landed on.
    ...Array.from({ length: 5 }, (_, index) =>
      activity(240 + index, {
        entityId: `f-up-${index}`,
        entityType: 'file',
        parentEntityId: '400',
        parentEntityType: 'block',
        type: 'uploaded',
        userFk: 3,
      }),
    ),

    // A twelve-edit burst across six routes of one block: two edits each, and never the
    // same value twice, so the expanded diff reads like a real afternoon of tidying up.
    ...Array.from({ length: 12 }, (_, index) =>
      activity(300 + index * 2, {
        columnName: ['name', 'gradeFk', 'rating', 'tags', 'firstAscensionists', 'description'][index % 6],
        entityId: String(500 + (index % 6)),
        newValue: [
          'Kante direkt',
          String(9 + index),
          String((index % 3) + 1),
          `SD,highball,line-${index}`,
          `Ada Rossi,Klimber ${index}`,
          `Sit start on crimps, then the ${index}th sloper.`,
        ][index % 6],
        oldValue: ['Kante', String(8 + index), String(index % 3), 'SD', 'Ada Rossi', 'Stand start.'][index % 6],
        parentEntityId: '400',
        parentEntityType: 'block',
        userFk: 4,
      }),
    ),

    activity(360, {
      columnName: 'topo',
      entityId: '400',
      entityType: 'block',
      parentEntityId: '300',
      parentEntityType: 'area',
      userFk: 5,
    }),

    // Yesterday.
    activity(26 * 60, { entityId: '300', entityType: 'area', newValue: 'Steinbruch', type: 'created', userFk: 3 }),
    activity(28 * 60, {
      columnName: 'gradeFk',
      entityId: '501',
      newValue: '15',
      oldValue: '11',
      parentEntityId: '401',
      parentEntityType: 'block',
      userFk: ME,
    }),
    activity(30 * 60, { columnName: 'file', entityId: '502', type: 'deleted', userFk: 5 }),
    activity(32 * 60, {
      entityId: '599',
      oldValue: 'Altweg',
      parentEntityId: '401',
      parentEntityType: 'block',
      type: 'deleted',
      userFk: 4,
    }),

    // Two days back.
    activity(50 * 60, {
      columnName: 'role',
      entityId: '5',
      entityType: 'user',
      newValue: 'maintainer',
      oldValue: 'user',
      userFk: 3,
    }),
    // Not hydrated: renders as a skeleton row while its ascent syncs.
    activity(52 * 60, { entityId: '9099', entityType: 'ascent', newValue: 'redpoint', type: 'created', userFk: 2 }),
  ]

  const entities = entityMap([
    [
      { id: '9001', type: 'ascent' },
      ascent('Rampe', 12, 2, { ascentType: 'flash', files: [photo('f1'), photo('f2')], note: NOTES }),
    ],
    [{ id: '9002', type: 'ascent' }, ascent('Kante', 9, 3, { ascentType: 'redpoint' })],
    [{ id: '9003', type: 'ascent' }, ascent('Verschneidung', 11, 3, { ascentType: 'redpoint' })],
    [{ id: '9004', type: 'ascent' }, ascent('Traverse', 6, 3, { ascentType: 'flash' })],
    [{ id: '9005', type: 'ascent' }, ascent('Sitzstart', 16, 3, { ascentType: 'attempt' })],
    ...Array.from({ length: 6 }, (_, index): [ActivityEntityRef, ActivityEntity] => [
      { id: String(500 + index), type: 'route' },
      route(['Kante direkt', 'Riss', 'Dach', 'Platte', 'Schuppe', 'Nase'][index], 8 + index),
    ]),
    [
      { id: '400', type: 'block' },
      { crumbs: ['Westwand'], href: '#', name: 'Nordblock', row: 'block' },
    ],
    // A hydrated upload: the card names the block it landed on, renders the photo in the
    // media strip, and shows no row of its own, since a file has nothing to link to.
    ...Array.from({ length: 5 }, (_, index): [ActivityEntityRef, ActivityEntity] => [
      { id: `f-up-${index}`, type: 'file' },
      { files: [photo(`up-${index}`)], name: 'Nordblock', row: 'none' },
    ]),
    [
      { id: '300', type: 'area' },
      { description: 'Old quarry, shady until noon.', href: '#', name: 'Steinbruch', row: 'area' },
    ],
    [{ id: '501', type: 'route' }, route('Riss', 15)],
    [{ id: '502', type: 'route' }, route('Dach', 14)],
    // Hydration finished without it: the route is gone.
    [{ id: '599', type: 'route' }, null],
    [
      { id: '5', type: 'user' },
      { href: '#', name: 'Mara Lindqvist', row: 'user' },
    ],
  ])

  return { activities, entities }
})()
