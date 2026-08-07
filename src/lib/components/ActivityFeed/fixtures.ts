import type { ActivityListItem } from '$lib/entities/activity/dto'
import type { ActivityEntity, ActivityEntityMap, ActivityEntityRef } from '$lib/entities/activity/entity'
import {
  activityAgo as activity,
  entityMap,
  ME,
  PEOPLE,
  photo,
  topoLines,
  topoMetadata,
  topos,
  video,
} from '$lib/entities/activity/fixture'
import type { TopoView } from '$lib/entities/topo/dto'

/**
 * The design's sample week, built from the same `(entityType, type, columnName)` triples the
 * mutation layer actually writes and folded by the real `groupActivities`.
 *
 * The builders themselves live in `$lib/entities/activity/fixture`, beside the module they
 * describe, and are re-exported here so a story needs one import. What is left in this file is
 * only the week: story material, and the one thing the tests have no use for.
 */
export {
  activityAgo as activity,
  changes,
  entityMap,
  groups,
  ME,
  photo,
  topoLines,
  topoMetadata,
  topos,
  video,
  view,
} from '$lib/entities/activity/fixture'

const NOTES = 'Cold and dry, the crux crimp finally felt sticky. Went second try after brushing the top.'

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

/**
 * The week from the design: a flash with photos, a four-ascent session, a twelve-edit
 * burst, a topo redraw, a new area, a grade change, a removed photo, a deleted route
 * (tombstone), a role grant and an ascent that has not hydrated yet (skeleton).
 */
export const sampleWeek: {
  activities: ActivityListItem[]
  entities: ActivityEntityMap
  topos: ReadonlyMap<number, TopoView>
} = (() => {
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
      metadata: topoMetadata('lines', 700),
      newValue: topoLines([
        { name: 'Kante direkt', routeFk: 501 },
        { name: 'Rampe', routeFk: 502 },
      ]),
      oldValue: topoLines([{ name: 'Kante direkt', routeFk: 501 }]),
      parentEntityId: '300',
      parentEntityType: 'area',
      userFk: 5,
    }),

    // A reposted beta clip credited to the wrong site, fixed after the fact. Points at the
    // file (so the card draws the clip) and names the route it hangs on as its parent, the
    // way an upload does, but stays its own card rather than joining one.
    activity(400, {
      columnName: 'source',
      entityId: 'f-vid-1',
      entityType: 'file',
      newValue: 'https://vimeo.com/912345',
      oldValue: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      parentEntityId: '501',
      parentEntityType: 'route',
      userFk: 2,
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
    // The clip whose credit was fixed. Like an upload it contributes the media and no row of
    // its own; the headline names the route, hydrated as its parent.
    [
      { id: 'f-vid-1', type: 'file' },
      { files: [video('vid-1', 'https://vimeo.com/912345')], name: 'Riss', row: 'none' },
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

  return { activities, entities, topos: topos() }
})()
