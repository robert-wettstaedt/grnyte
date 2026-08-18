/**
 * Every action the app can perform that the feed has an opinion about, as the rows the mutation
 * layer writes.
 *
 * Each case's `expected` was derived by reading the code, so it says what the feed DOES, not what
 * it SHOULD say. That is the point of this file: it feeds the catalogue story, which renders the
 * cases through the real `groupActivities` and `activityCard`, so the cards can be judged by eye
 * in one sitting instead of by clicking 252 flows through the app. Once the mismatches are
 * settled, the same list becomes the snapshot fixture for the unit tests.
 *
 * Storybook and tests only. Nothing in the app imports this.
 */
import { routeDisplayName } from '$lib/entities/route/mapper'
import type { TopoView } from '$lib/entities/topo/dto'
import type { ActivityListItem } from './dto'
import type { ActivityEntity, ActivityEntityMap, ActivityEntityRef } from './entity'
import { activityAgo, entityMap, ME, photo, topoLines, topoMetadata, topos, video } from './fixture'
import { stringifyDeletedAscent } from './verbs'

/** One action the app can perform, and the cards the feed answers with. */
export interface ActivityCase {
  /** The UI path that produces it. */
  action: string
  /** The rows the mutation writes, newest first. Empty means the action writes nothing at all,
   *  which is a case worth seeing: it is where a reader most often expects a card. */
  activities: ActivityListItem[]
  domain: ActivityCaseDomain
  /** Hydration for this case. Defaults to {@link world}. */
  entities?: ActivityEntityMap
  /** What the card is expected to render. Code-derived, so this is the claim under review,
   *  never the oracle. Disagreeing with it is the whole exercise. */
  expected: string
  /** Stable id, e.g. `AREA-02f`: what a snapshot diff and a review comment point at. */
  id: string
  /** Only for topo cases, whose change lines draw the photo. */
  topos?: ReadonlyMap<number, TopoView>
}

export type ActivityCaseDomain = 'area' | 'ascent' | 'block' | 'file' | 'region' | 'route' | 'topo' | 'user'

/**
 * One crag every case points at, so a reader is not relearning names card to card.
 *
 * | id     | what                                    |
 * | ------ | --------------------------------------- |
 * | 300    | area "Steinbruch" (top level)           |
 * | 301    | area "Westwand" (child of 300)          |
 * | 400    | block "Nordblock" (in 301)              |
 * | 500-503| routes "Kante direkt", "Riss", "Dach", "Platte" |
 * | 9001   | ascent of "Rampe", mine                 |
 * | 9002   | ascent of "Kante", somebody else's      |
 * | 599    | a route that hydration reports GONE (tombstone) |
 * | 9999   | an id no entity map holds, so it stays a SKELETON |
 * | 5      | user "Mara Lindqvist"                   |
 */
const CRAG: [ActivityEntityRef, ActivityEntity | null][] = [
  [
    { id: '300', type: 'area' },
    { description: 'Old quarry, shady until noon.', href: '#', name: 'Steinbruch', row: 'area' },
  ],
  [
    { id: '301', type: 'area' },
    { crumbs: ['Steinbruch'], href: '#', name: 'Westwand', row: 'area' },
  ],
  [
    { id: '400', type: 'block' },
    { crumbs: ['Steinbruch', 'Westwand'], href: '#', name: 'Nordblock', row: 'block' },
  ],
  [{ id: '500', type: 'route' }, routeEntity('Kante direkt', 11)],
  [{ id: '501', type: 'route' }, routeEntity('Riss', 15)],
  [{ id: '502', type: 'route' }, routeEntity('Dach', 14)],
  [{ id: '503', type: 'route' }, routeEntity('Platte', 8)],
  [{ id: '9001', type: 'ascent' }, ascentEntity('Rampe', 12, ME, 'flash')],
  [{ id: '9002', type: 'ascent' }, ascentEntity('Kante', 9, 3, 'redpoint')],
  // Hydration finished without it: the card falls back to the name on the row itself.
  [{ id: '599', type: 'route' }, null],
  [
    { id: '5', type: 'user' },
    { href: '#', name: 'Mara Lindqvist', row: 'user' },
  ],
]

export const world: ActivityEntityMap = entityMap(CRAG)

/** The coordinates every pinned fixture uses, so two cases are never comparing two places. */
const PIN = { lat: 47.123456, long: 8.56789 }

/** A file's hydrated shape: it contributes media and a borrowed name, never a row of its own. */
export function fileEntity(name: string, files: ReturnType<typeof photo>[]): ActivityEntity {
  return { files, name, row: 'none' }
}

/** The crag with a few entries swapped, for the cases that need a tombstone or extra media. */
export function worldWith(entries: [ActivityEntityRef, ActivityEntity | null][]): ActivityEntityMap {
  return entityMap([...CRAG, ...entries])
}

function ascentEntity(
  name: string,
  gradeFk: number,
  climberFk: number,
  ascentType: 'attempt' | 'flash' | 'redpoint' | 'repeat',
): ActivityEntity {
  return {
    ...routeEntity(name, gradeFk),
    ascentType,
    climberFk,
    climberName: climberFk === ME ? 'Ada Rossi' : 'Sofia Brandt',
  }
}

/** What `deleteAscent` writes down about whose ascent it took, since nothing can be asked
 *  afterwards. Built through the writer so a fixture cannot drift from the stored shape. */
function deletedAscent(climberFk: number, climberName: string): string {
  return stringifyDeletedAscent({ climberFk, climberName })
}

/** Nordblock, hydrated with the pin it was placed with, which only a create card draws. One
 *  pin for every case, so no two of them can read as two different places; `estimated` is the
 *  only thing a caller ever varies. */
function pinnedBlock(estimated = false): ActivityEntity {
  return {
    crumbs: ['Steinbruch', 'Westwand'],
    href: '#',
    name: 'Nordblock',
    pin: { estimated, id: 1, ...PIN },
    row: 'block',
  }
}

/**
 * A hydrated route, named the way the feed really gets one.
 *
 * `hydrate.svelte.ts` builds its route entity from a `RouteListItem`, and `toRouteListItem`
 * has already swapped a blank name for `common_unnamed`. So a nameless route reaches the card
 * carrying the placeholder as its name, not as an empty string, and a fixture that passes `''`
 * is testing a state the app cannot produce.
 */
function routeEntity(rawName: string, gradeFk: number): ActivityEntity {
  // Through the mapper's own helper, so a fixture cannot describe a nameless route differently
  // from the way hydration hands one out.
  const name = routeDisplayName(rawName)
  return {
    crumbs: ['Steinbruch', 'Westwand', 'Nordblock'],
    href: '#',
    name,
    route: { description: '', gradeFk, name, rating: 2, tags: [] },
    row: 'route',
  }
}

/** A calendar date `daysAgo` back, as Zero hands one back from a pg `date`: UTC midnight. */
function utcDay(daysAgo: number): number {
  const date = new Date(Date.now() - daysAgo * 86_400_000)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

// Re-exported so a case chunk, and the catalogue story, need one import.
export { activityAgo, ME, photo, topoLines, topoMetadata, topos, video }

export const CASES: ActivityCase[] = [
  // ==== AREA ====
  {
    action: '/explore -> + FAB -> Add to the region -> New area in {Region} -> /areas/add -> Area name -> Create area',
    activities: [
      activityAgo(5, { entityId: '300', entityType: 'area', newValue: 'Steinbruch', type: 'created', userFk: ME }),
    ],
    domain: 'area',
    expected: 'single card, "You added Steinbruch". No change line: create verbs declare no field.',
    id: 'AREA-01a',
  },
  {
    action: '/areas/300 -> More -> Add -> Add area -> /areas/300/add -> Area name -> Create area',
    activities: [
      activityAgo(5, {
        entityId: '301',
        entityType: 'area',
        newValue: 'Westwand',
        parentEntityId: '300',
        parentEntityType: 'area',
        type: 'created',
        userFk: ME,
      }),
    ],
    domain: 'area',
    expected:
      'One row, so a single card, "You added Westwand". It would fold under burst:{user}:area:300 if a second create followed. No change line.',
    id: 'AREA-01b',
  },
  {
    action: '/areas/300 -> More -> Add -> Add area -> fill Area name AND Description -> Create area',
    activities: [
      activityAgo(5, {
        entityId: '301',
        entityType: 'area',
        newValue: 'Westwand',
        parentEntityId: '300',
        parentEntityType: 'area',
        type: 'created',
        userFk: ME,
      }),
    ],
    domain: 'area',
    expected:
      'Identical to AREA-01b: single card, "You added Westwand". The description never reaches the create row, so nothing hints it was filled in.',
    id: 'AREA-01c',
  },
  {
    action:
      '/areas/300 -> More -> Add -> Add area -> reuse a name that already exists under that parent -> Create area',
    activities: [],
    domain: 'area',
    expected: 'No card at all. invalid(areas_nameExists) fires before the insert, so nothing is ever logged.',
    id: 'AREA-01d',
  },
  {
    action: 'Create an area, then within 15 min More -> Manage -> Edit -> change the name -> Save',
    activities: [
      activityAgo(5, {
        entityId: '301',
        entityType: 'area',
        newValue: 'Westwand',
        parentEntityId: '300',
        parentEntityType: 'area',
        type: 'created',
        userFk: ME,
      }),
    ],
    domain: 'area',
    expected:
      'Only the create card, "You added Westwand", still naming the pre-edit name. createUpdateActivity early-returns on the created row, so the rename writes nothing.',
    id: 'AREA-01e',
  },
  {
    action: '/areas/301 -> More -> Manage -> Edit -> change Area name -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'name',
        entityId: '301',
        entityType: 'area',
        newValue: 'Westwand Nord',
        oldValue: 'Westwand',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'area',
    expected: 'single card, "You renamed Westwand". text renderer, two neutral chips with an arrow, old to new.',
    id: 'AREA-02a',
  },
  {
    action: '/areas/301 -> More -> Manage -> Edit -> change only the Description MarkdownEditor -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'description',
        entityId: '301',
        entityType: 'area',
        newValue: 'Steep west face, dry in the afternoon. Approach from the upper path.',
        oldValue: 'Old quarry, shady until noon.',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'area',
    expected:
      'single card, description edit. prose renderer, a collapsed details reading "Compare, {n} characters" that expands to one merged text: what the edit took struck through, what it added marked, the rest standing.',
    id: 'AREA-02b',
  },
  {
    action: '/areas/301 -> More -> Manage -> Edit -> change Area name AND Description -> one Save',
    activities: [
      activityAgo(5, {
        columnName: 'name',
        entityId: '301',
        entityType: 'area',
        newValue: 'Westwand Nord',
        oldValue: 'Westwand',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
      activityAgo(5, {
        columnName: 'description',
        entityId: '301',
        entityType: 'area',
        newValue: 'Steep west face, dry in the afternoon.',
        oldValue: 'Old quarry, shady until noon.',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'area',
    expected:
      'One burst card reading "2 edits" (never single, both rows share one createdAt). Two change lines, text for the name and prose for the description.',
    id: 'AREA-02c',
  },
  {
    action: '/areas/301 -> More -> Manage -> Edit -> touch nothing -> Save',
    activities: [],
    domain: 'area',
    expected: 'No card. The diff is empty, so createUpdateActivity writes nothing.',
    id: 'AREA-02d',
  },
  {
    action: '/areas/301 -> More -> Manage -> Edit -> clear the Description entirely -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'description',
        entityId: '301',
        entityType: 'area',
        newValue: '',
        oldValue: 'Old quarry, shady until noon.',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'area',
    expected:
      'single card, description edit. No diff to draw when one side is empty, so this keeps the two-sided shape: the old text struck through over the literal "Not set" (the stored value is an empty string, not null).',
    id: 'AREA-02e',
  },
  {
    action:
      'On an area whose stored description is SQL NULL (v1 import), open /areas/301/edit and press Save without touching anything',
    activities: [
      activityAgo(5, {
        columnName: 'description',
        entityId: '301',
        entityType: 'area',
        newValue: '',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'area',
    expected:
      'A spurious single card: the form prefills the description with an empty string and the diff compares "null" against "", so prose renders "Not set" to "Not set".',
    id: 'AREA-02f',
  },
  {
    action: '/areas/{id} -> More -> Manage -> Edit -> change Area name -> Save, then rename again within 15 min',
    activities: [
      activityAgo(5, {
        columnName: 'name',
        entityId: '300',
        entityType: 'area',
        newValue: 'Steinbruch Nord',
        oldValue: 'Steinbruch',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'area',
    expected: 'One folded row, A -> C. The intermediate B is gone. text renderer, two neutral chips with an arrow.',
    id: 'AREA-02g',
  },
  {
    action: 'Edit form, change the name A -> B, then rename back to A within 15 min',
    activities: [],
    domain: 'area',
    expected: 'No card at all. createUpdateActivity deletes the row it folded back to its start.',
    id: 'AREA-02h',
  },
  {
    action: '/areas/301 -> More -> Manage -> Edit -> rename -> Save, wait more than 15 min, rename again -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'name',
        entityId: '301',
        entityType: 'area',
        newValue: 'Westwand Nord',
        oldValue: 'Westwand Mitte',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
      activityAgo(25, {
        columnName: 'name',
        entityId: '301',
        entityType: 'area',
        newValue: 'Westwand Mitte',
        oldValue: 'Westwand',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'area',
    expected:
      'Two rows past the 15 min fold window, 20 min apart, so one burst card of 2 edits. Two text change lines. Beyond 30 min apart they would be two cards instead.',
    id: 'AREA-02i',
  },
  {
    action: '/areas/301 -> Edit -> rename -> Save as user X, then within 15 min the same rename by user Y',
    activities: [
      activityAgo(5, {
        columnName: 'name',
        entityId: '301',
        entityType: 'area',
        newValue: 'Westwand Nord',
        oldValue: 'Westwand Mitte',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: 3,
      }),
      activityAgo(8, {
        columnName: 'name',
        entityId: '301',
        entityType: 'area',
        newValue: 'Westwand Mitte',
        oldValue: 'Westwand',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'area',
    expected:
      'Two rows (the fold filters on userFk) and two single cards, because the burst key carries userFk. One text change line each.',
    id: 'AREA-02j',
  },
  {
    action: '/areas/300 -> More -> Manage -> Edit on a top-level area -> change the Region select -> Save',
    activities: [],
    domain: 'area',
    expected: 'No card. regionFk and parentFk are written but never diffed, so the move is invisible in the feed.',
    id: 'AREA-02k',
  },
  {
    action: '/areas/301 on a bare leaf area -> More -> Manage -> Delete area (no confirm)',
    activities: [
      activityAgo(5, {
        entityId: '301',
        entityType: 'area',
        oldValue: 'Westwand',
        parentEntityId: '300',
        parentEntityType: 'area',
        type: 'deleted',
        userFk: ME,
      }),
    ],
    domain: 'area',
    entities: worldWith([[{ id: '301', type: 'area' }, null]]),
    expected:
      'removal kind, one row so a single card. The area is gone, so the row renders as a tombstone borrowing the name off oldValue. No change line.',
    id: 'AREA-03a',
  },
  {
    action: '/areas/301 on a crag holding 12 blocks and 200 routes -> More -> Manage -> Delete area',
    activities: [
      activityAgo(5, {
        entityId: '301',
        entityType: 'area',
        metadata: '{"blocks":12,"routes":200}',
        oldValue: 'Westwand',
        parentEntityId: '300',
        parentEntityType: 'area',
        type: 'deleted',
        userFk: ME,
      }),
    ],
    domain: 'area',
    entities: worldWith([[{ id: '301', type: 'area' }, null]]),
    expected:
      'Exactly one removal row, so a single tombstone card. The cascade logs nothing of its own, but the delete row recorded what went with it, so the card carries a "12 blocks, 200 routes" sub line.',
    id: 'AREA-03b',
  },
  {
    action: '/areas/300 on a top-level area -> More -> Manage -> Delete area',
    activities: [
      activityAgo(5, { entityId: '300', entityType: 'area', oldValue: 'Steinbruch', type: 'deleted', userFk: ME }),
    ],
    domain: 'area',
    entities: worldWith([[{ id: '300', type: 'area' }, null]]),
    expected:
      'removal kind, single card, tombstone named off oldValue. parentEntityId is null so locality falls back to area:300, which makes every top-level delete its own card.',
    id: 'AREA-03c',
  },
  {
    action: 'Delete a bare leaf area, then tap Undo on the Area deleted snackbar (hard restore)',
    activities: [],
    domain: 'area',
    expected:
      'No card: deleteActivity erases the area/deleted row (the filter pins columnName null) and writes nothing. The area returns with a new id, and reassignActivityEntity moves its history onto that id, so its old created and updated cards stay live.',
    id: 'AREA-04a',
  },
  {
    action: 'Delete a crag holding blocks and routes, then tap Undo on the Area deleted snackbar (soft restore)',
    activities: [],
    domain: 'area',
    expected:
      'No card: the same removal row is erased. The id survives, so the whole prior timeline of that area stays live.',
    id: 'AREA-04b',
  },
  {
    action: '/areas/301 -> More -> Add -> Add parking -> step Place parking -> Next -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'parking location',
        entityId: '301',
        entityType: 'area',
        newValue: '47.123456,8.567890',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'area',
    expected:
      'single card. location renderer: a 200x120 OSM thumbnail with one primary pin, caption "Pin added", no Approximate chip (the value is never tilde-prefixed).',
    id: 'AREA-05a',
  },
  {
    action:
      '/explore -> + FAB -> Place on the map -> Add parking -> pan -> confirm Add parking -> /areas/301/parking/edit?lat&long -> Next -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'parking location',
        entityId: '301',
        entityType: 'area',
        newValue: '47.123456,8.567890',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'area',
    expected:
      'Identical row and identical single card to AREA-05a: location renderer, thumbnail with one pin, caption "Pin added". The map entry point leaves no trace of itself.',
    id: 'AREA-05b',
  },
  {
    action: '/areas/301 -> More -> Add -> Add parking -> place the pin -> draw an approach path on step 2 -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'parking location',
        entityId: '301',
        entityType: 'area',
        newValue: '47.123456,8.567890',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'area',
    entities: worldWith([
      [
        { id: '301', type: 'area' },
        {
          crumbs: ['Steinbruch'],
          href: '#',
          name: 'Westwand',
          paths: [
            [
              { lat: 47.1235, long: 8.5679 },
              { lat: 47.1244, long: 8.5691 },
              { lat: 47.1251, long: 8.5688 },
              { lat: 47.1258, long: 8.5702 },
            ],
          ],
          row: 'area',
        },
      ],
    ]),
    expected:
      'Identical row again, single card with the location line. geoPaths is still never logged, but the area hydrates with its approach, so the thumbnail draws the path in the same blue the real map uses and zooms out to fit it. What is drawn is the path as it stands today, not as it was when the pin went down.',
    id: 'AREA-05c',
  },
  {
    action: '/areas/301 -> More -> Add -> Add parking -> Save, then repeat at different coordinates',
    activities: [
      activityAgo(5, {
        columnName: 'parking location',
        entityId: '301',
        entityType: 'area',
        newValue: '47.130000,8.572000',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
      activityAgo(15, {
        columnName: 'parking location',
        entityId: '301',
        entityType: 'area',
        newValue: '47.123456,8.567890',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'area',
    expected:
      'Two rows and no fold (this is insertActivity, and the newValues differ), so one burst card of 2 edits with two location lines.',
    id: 'AREA-05d',
  },
  {
    action: '/areas/301 -> Add parking at P -> Save, delete the parking, then add parking again at exactly P',
    activities: [
      activityAgo(5, {
        columnName: 'parking location',
        entityId: '301',
        entityType: 'area',
        newValue: '47.123456,8.567890',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
      activityAgo(20, {
        columnName: 'parking location',
        entityId: '301',
        entityType: 'area',
        oldValue: '47.123456,8.567890',
        parentEntityId: '300',
        parentEntityType: 'area',
        type: 'deleted',
        userFk: ME,
      }),
    ],
    domain: 'area',
    expected:
      'The re-add matches the first row on its identity tuple, so insertActivity deletes that first row: the end state is one updated row plus one deleted row. Both are burst with the same locality, 15 min apart, so they fold into one card of 2 with a location line and a locationRemoved line.',
    id: 'AREA-05e',
  },
  {
    action: '/explore -> tap the blue parking marker -> /parking/{geolocationId} -> More -> Manage -> Delete parking',
    activities: [
      activityAgo(5, {
        columnName: 'parking location',
        entityId: '301',
        entityType: 'area',
        oldValue: '47.123456,8.567890',
        parentEntityId: '300',
        parentEntityType: 'area',
        type: 'deleted',
        userFk: ME,
      }),
    ],
    domain: 'area',
    expected:
      'burst kind, not removal, because the row carries a columnName, and one row so a single card. locationRemoved renderer: the same thumbnail with the old pin in the gone variant, caption forced to "Location removed".',
    id: 'AREA-06a',
  },
  {
    action: 'Delete parking where the areas row cannot be read (RLS or a dangling areaFk)',
    activities: [],
    domain: 'area',
    expected:
      'No card. The whole insertActivity sits inside if (area != null), so the geolocation is deleted with nothing logged.',
    id: 'AREA-06b',
  },
  {
    action: 'Delete parking, then tap Undo on the Parking deleted snackbar',
    activities: [],
    domain: 'area',
    expected:
      'No card. deleteActivity erases the one area/deleted/parking location row for these coordinates by this actor, and recreating the pin logs nothing.',
    id: 'AREA-07',
  },
  {
    action:
      'Not reachable from the UI: hand-insert a files row with area_fk set, then /f/{fileId} -> trash (aria-label Delete) -> Delete media -> Delete',
    activities: [
      activityAgo(5, {
        columnName: 'file',
        entityId: '301',
        entityType: 'area',
        oldValue: 'photo',
        type: 'deleted',
        userFk: ME,
      }),
    ],
    domain: 'area',
    expected:
      'burst kind keyed burst:{user}:area:301 (the row has a columnName, so not removal), one row so a single card. file renderer: one muted line "Photo removed" under the row label "Photo".',
    id: 'AREA-08a',
  },
  {
    action: 'As AREA-08a with a Bunny video: /f/{fileId} -> trash -> Delete media -> Delete',
    activities: [
      activityAgo(5, {
        columnName: 'file',
        entityId: '301',
        entityType: 'area',
        oldValue: 'video',
        type: 'deleted',
        userFk: ME,
      }),
    ],
    domain: 'area',
    expected:
      'Same shape as AREA-08a, single card. file renderer reads the word off oldValue, so the line is "Video removed" under the row label "Video".',
    id: 'AREA-08b',
  },

  // ==== BLOCK ====
  {
    action:
      '/areas/{cragId} -> More -> Add -> Add block -> /areas/{cragId}/blocks/add -> Block name -> Use current location -> Done -> Add',
    activities: [
      activityAgo(5, {
        entityId: '400',
        entityType: 'block',
        newValue: 'Nordblock',
        parentEntityId: '300',
        parentEntityType: 'area',
        type: 'created',
        userFk: ME,
      }),
    ],
    domain: 'block',
    entities: worldWith([[{ id: '400', type: 'block' }, pinnedBlock()]]),
    expected:
      'single card, "You added Nordblock". burst kind with one member. No change line: create verbs declare no field, but the block hydrates with a pin and a create card draws it, so a 200x120 OSM thumbnail sits above the row.',
    id: 'BLOCK-01a',
  },
  {
    action: '/areas/{cragId}/blocks/add -> leave Block name blank -> place the pin -> Add',
    activities: [
      activityAgo(5, {
        entityId: '400',
        entityType: 'block',
        newValue: '',
        parentEntityId: '300',
        parentEntityType: 'area',
        type: 'created',
        userFk: ME,
      }),
    ],
    domain: 'block',
    entities: worldWith([
      [
        { id: '400', type: 'block' },
        { ...pinnedBlock(), name: 'Block 3' },
      ],
    ]),
    expected:
      'single card. named() treats the empty newValue as absent, so the headline falls back to the hydrated "Block 3". No change line, and the placed pin draws the same thumbnail BLOCK-01a gets.',
    id: 'BLOCK-01b',
  },
  {
    action: '/areas/{cragId}/blocks/add with no location -> dialog Add without a location? -> Add without location',
    activities: [
      activityAgo(5, {
        entityId: '400',
        entityType: 'block',
        newValue: 'Nordblock',
        parentEntityId: '300',
        parentEntityType: 'area',
        type: 'created',
        userFk: ME,
      }),
    ],
    domain: 'block',
    expected:
      'single card, BLOCK-01a without the map. The skipped geolocation logs nothing, so there is no location change line, and the block hydrates without a pin, so there is nothing to draw either.',
    id: 'BLOCK-01c',
  },
  {
    action:
      "/explore -> + FAB -> Place on the map -> Add block -> pan -> confirm -> /areas/{cragId}/blocks/add?lat&long -> leave I'm not sure about the exact spot on -> Add",
    activities: [
      activityAgo(5, {
        entityId: '400',
        entityType: 'block',
        newValue: 'Nordblock',
        parentEntityId: '300',
        parentEntityType: 'area',
        type: 'created',
        userFk: ME,
      }),
    ],
    domain: 'block',
    entities: worldWith([[{ id: '400', type: 'block' }, pinnedBlock(true)]]),
    expected:
      'single card, the same row the in-area form writes: the pre-located entry point changes nothing about the row. The pin is flagged approximate, so the thumbnail draws it dashed with the "?" marker, the same way the interactive map does.',
    id: 'BLOCK-01d',
  },
  {
    action: '/areas/{cragId}/blocks/add with a Block name already used in that area -> Add',
    activities: [],
    domain: 'block',
    expected: 'No card at all. invalid(blocks_nameExists) fires before the insert.',
    id: 'BLOCK-01e',
  },
  {
    action: '/blocks/{id} -> More -> Manage -> Edit -> change only the name -> Save',
    activities: [],
    domain: 'block',
    expected:
      'No location card. The form resubmits the same coordinates and stringifyCoords matches, so the location diff is empty.',
    id: 'BLOCK-02a',
  },
  {
    action: '/blocks/{id}/edit on a pinless block -> Choose on map -> Done -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'location',
        entityId: '400',
        entityType: 'block',
        newValue: '47.123456,8.567890',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'block',
    expected: 'single card, burst kind. location renderer: one primary pin on the OSM thumbnail, caption "Pin added".',
    id: 'BLOCK-02b',
  },
  {
    action: '/blocks/{id}/edit -> Adjust -> move the pin -> Done -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'location',
        entityId: '400',
        entityType: 'block',
        newValue: '47.123456,8.567890',
        oldValue: '47.120000,8.560000',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'block',
    expected:
      'single card, burst kind. location renderer: grey from pin, primary pin, dashed connector, caption "Moved {distance}".',
    id: 'BLOCK-02c',
  },
  {
    action:
      "/blocks/{id}/edit on an estimated pin -> flip I'm not sure about the exact spot off -> Save without moving the pin",
    activities: [
      activityAgo(5, {
        columnName: 'location',
        entityId: '400',
        entityType: 'block',
        newValue: '47.100000,8.500000',
        oldValue: '~47.100000,8.500000',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'block',
    expected:
      'single card. location renderer, caption "Approximate pin confirmed" and no Approximate chip (the chip keys on the new side).',
    id: 'BLOCK-02d',
  },
  {
    action: "/blocks/{id}/edit -> flip I'm not sure about the exact spot on -> Save without moving the pin",
    activities: [
      activityAgo(5, {
        columnName: 'location',
        entityId: '400',
        entityType: 'block',
        newValue: '~47.100000,8.500000',
        oldValue: '47.100000,8.500000',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'block',
    expected: 'single card. location renderer, caption "Approximate pin confirmed" plus the grey Approximate chip.',
    id: 'BLOCK-02e',
  },
  {
    action: '/blocks/{id}/edit -> Adjust -> move the pin -> Save, then move it again within 15 min',
    activities: [
      activityAgo(5, {
        columnName: 'location',
        entityId: '400',
        entityType: 'block',
        newValue: '47.130000,8.575000',
        oldValue: '47.120000,8.560000',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'block',
    expected:
      'One folded row, original coordinates to the latest ones. Three nudges read as one move. location renderer, single card.',
    id: 'BLOCK-02f',
  },
  {
    action: '/blocks/{id}/edit -> move the pin -> Save, then within 15 min move it back to the starting coordinates',
    activities: [],
    domain: 'block',
    expected: 'No card at all. createUpdateActivity deletes the row it folded back to its start.',
    id: 'BLOCK-02g',
  },
  {
    action: 'Create a block (BLOCK-01a), then within 15 min /blocks/{id}/edit -> move the pin -> Save',
    activities: [],
    domain: 'block',
    expected: 'No location card. The created row inside 15 min suppresses the update, and it keeps the pre-edit value.',
    id: 'BLOCK-02h',
  },
  {
    action: '/blocks/{id}/edit -> Remove location -> Save -> dialog Save without a location? -> Save without location',
    activities: [
      activityAgo(5, {
        columnName: 'location',
        entityId: '400',
        entityType: 'block',
        oldValue: '47.123456,8.567890',
        parentEntityId: '300',
        parentEntityType: 'area',
        type: 'deleted',
        userFk: ME,
      }),
    ],
    domain: 'block',
    expected:
      'single card, burst kind (the column-scoped delete is not a removal). locationRemoved renderer: one gone pin, caption "Location removed".',
    id: 'BLOCK-03a',
  },
  {
    action: '/blocks/{id}/edit -> Remove location -> Save on a block that already had no pin',
    activities: [],
    domain: 'block',
    expected: 'No card. The branch is skipped because geolocationFk is null.',
    id: 'BLOCK-03b',
  },
  {
    action: '/blocks/{id}/edit -> Choose on map -> Save, then within 15 min Remove location -> Save without location',
    activities: [
      activityAgo(5, {
        columnName: 'location',
        entityId: '400',
        entityType: 'block',
        oldValue: '47.123456,8.567890',
        parentEntityId: '300',
        parentEntityType: 'area',
        type: 'deleted',
        userFk: ME,
      }),
      activityAgo(8, {
        columnName: 'location',
        entityId: '400',
        entityType: 'block',
        newValue: '47.123456,8.567890',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'block',
    expected:
      'One burst card reading "2 edits". The delete is a hand-rolled insertActivity, so it never folds into the update: a location line plus a locationRemoved line.',
    id: 'BLOCK-03c',
  },
  {
    action:
      '/blocks/{id}/edit -> Remove location -> Save -> dismiss the dialog with Pin location now, backdrop or Escape',
    activities: [],
    domain: 'block',
    expected: 'No card. The submit is cancelled before anything is written.',
    id: 'BLOCK-03d',
  },
  {
    action: '/blocks/{id}/edit -> change Block name A to B -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'name',
        entityId: '400',
        entityType: 'block',
        newValue: 'Nordblock Links',
        oldValue: 'Nordblock',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'block',
    expected: 'single card, burst kind. text renderer, two neutral chips with an arrow.',
    id: 'BLOCK-04a',
  },
  {
    action: '/blocks/{id}/edit -> clear the Block name field -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'name',
        entityId: '400',
        entityType: 'block',
        newValue: '',
        oldValue: 'Nordblock',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'block',
    expected: 'single card. text renderer, the new side is the italic "Not set" (empty string, not null).',
    id: 'BLOCK-04b',
  },
  {
    action:
      '/blocks/{id}/edit on a previously unnamed block (the field prefills from rawName, so it starts empty) -> type a name -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'name',
        entityId: '400',
        entityType: 'block',
        newValue: 'Nordblock',
        oldValue: '',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'block',
    expected: 'single card. text renderer, italic "Not set" on the old side and a chip on the new.',
    id: 'BLOCK-04c',
  },
  {
    action: '/blocks/{id}/edit -> Save without touching the name',
    activities: [],
    domain: 'block',
    expected: 'No card. The block.name !== value.name guard short-circuits before any write.',
    id: 'BLOCK-04d',
  },
  {
    action: '/blocks/{id}/edit -> Adjust the pin and change Block name -> one Save',
    activities: [
      activityAgo(5, {
        columnName: 'location',
        entityId: '400',
        entityType: 'block',
        newValue: '47.123456,8.567890',
        oldValue: '47.120000,8.560000',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
      activityAgo(5, {
        columnName: 'name',
        entityId: '400',
        entityType: 'block',
        newValue: 'Nordblock Links',
        oldValue: 'Nordblock',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'block',
    expected: 'One burst card reading "2 edits", never single. Two change lines, location first then text.',
    id: 'BLOCK-04e',
  },
  {
    action: '/blocks/{id}/edit -> change Block name to one already used in that area -> Save',
    activities: [],
    domain: 'block',
    expected: 'No card at all, not even a location one. The duplicate check runs before the location sync.',
    id: 'BLOCK-04f',
  },
  {
    action:
      '/blocks/{id} -> More -> Manage -> Move on the map (or the amber Add location button) -> /blocks/{id}/move -> place the pin -> Done',
    activities: [
      activityAgo(5, {
        columnName: 'location',
        entityId: '400',
        entityType: 'block',
        newValue: '47.123456,8.567890',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'block',
    expected:
      'single card, burst kind. location renderer, caption "Pin added" and no tilde, since estimated defaults to false.',
    id: 'BLOCK-05a',
  },
  {
    action: '/blocks/{id}/move on a block whose pin is estimated -> place the pin -> Done',
    activities: [
      activityAgo(5, {
        columnName: 'location',
        entityId: '400',
        entityType: 'block',
        newValue: '~47.123456,8.567890',
        oldValue: '~47.120000,8.560000',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'block',
    expected:
      'single card. location renderer, caption "Moved {distance}" plus the Approximate chip: the move deliberately does not confirm the pin.',
    id: 'BLOCK-05b',
  },
  {
    action: '/blocks/{id}/move -> drop the pin on exactly the current coordinates -> Done',
    activities: [],
    domain: 'block',
    expected: 'No card. The diff is empty.',
    id: 'BLOCK-05c',
  },
  {
    action: '/blocks/{id}/move -> Done, then /blocks/{id}/edit -> Adjust -> move the pin -> Save within 15 min',
    activities: [
      activityAgo(5, {
        columnName: 'location',
        entityId: '400',
        entityType: 'block',
        newValue: '47.130000,8.575000',
        oldValue: '47.120000,8.560000',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'block',
    expected:
      'One folded row, first old to latest new. Both writers share the fold key (same entity, user, column, metadata null), so the two screens produce one card.',
    id: 'BLOCK-05d',
  },
  {
    action: '/blocks/{id}/topos/edit on a pinless block -> Add photo -> pick a phone JPEG carrying GPS EXIF',
    activities: [
      activityAgo(5, {
        columnName: 'location',
        entityId: '400',
        entityType: 'block',
        newValue: '~47.123456,8.567890',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'block',
    expected:
      'single card. location renderer, caption "Pin added" plus the Approximate chip, since the EXIF fix is always written with a tilde.',
    id: 'BLOCK-06a',
  },
  {
    action: '/blocks/{id}/topos/edit -> Add photo with GPS EXIF on a block that already has any geolocation',
    activities: [],
    domain: 'block',
    expected: 'No card. The guard returns before any write, which is what makes it safe to fire on every topo upload.',
    id: 'BLOCK-06b',
  },
  {
    action: '/blocks/{id}/topos/edit -> Add photo with no GPS EXIF',
    activities: [],
    domain: 'block',
    expected: 'No card. Silent by design.',
    id: 'BLOCK-06c',
  },
  {
    action: '/blocks/{id}/topos/edit -> Add photo -> multi-select 5 GPS photos',
    activities: [
      activityAgo(5, {
        columnName: 'location',
        entityId: '400',
        entityType: 'block',
        newValue: '~47.123456,8.567890',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'block',
    expected: 'One card at most, never five. The loop returns after the first readable fix. location renderer.',
    id: 'BLOCK-06d',
  },
  {
    action:
      '/blocks/{id}/topos/edit on a pinless block -> Add photo -> pick one GPS JPEG (the same upload that writes TOPO-01a)',
    activities: [
      activityAgo(5, {
        columnName: 'topo',
        entityId: '400',
        entityType: 'block',
        metadata: topoMetadata('photoAdded', 700),
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
      activityAgo(5, {
        columnName: 'location',
        entityId: '400',
        entityType: 'block',
        newValue: '~47.123456,8.567890',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'block',
    expected:
      'One burst card reading "2 edits": the two rows differ in columnName, so both survive. A location line plus a topo line drawing the photo with caption "Photo added".',
    id: 'BLOCK-06e',
    topos: topos(),
  },
  {
    action: '/blocks/{id} -> More -> Manage -> Delete block (no confirm) on a bare block',
    activities: [
      activityAgo(5, {
        entityId: '400',
        entityType: 'block',
        oldValue: 'Nordblock',
        parentEntityId: '300',
        parentEntityType: 'area',
        type: 'deleted',
        userFk: ME,
      }),
    ],
    domain: 'block',
    entities: worldWith([[{ id: '400', type: 'block' }, null]]),
    expected:
      'single card of the removal kind (predicate 1 fires: a delete with no columnName). No change line: delete verbs declare no field.',
    id: 'BLOCK-07a',
  },
  {
    action: '/blocks/{id} -> More -> Manage -> Delete block on a block holding routes, topos and files',
    activities: [
      activityAgo(5, {
        entityId: '400',
        entityType: 'block',
        metadata: '{"routes":9}',
        oldValue: 'Nordblock',
        parentEntityId: '300',
        parentEntityType: 'area',
        type: 'deleted',
        userFk: ME,
      }),
    ],
    domain: 'block',
    entities: worldWith([[{ id: '400', type: 'block' }, null]]),
    expected:
      'One removal card. The soft-delete cascade writes no route:deleted rows, but the delete row recorded how many routes went with the block, so the card carries a "9 routes" sub line.',
    id: 'BLOCK-07b',
  },
  {
    action: '/blocks/{id} -> More -> Manage -> Delete block on an unnamed block',
    activities: [
      activityAgo(5, {
        entityId: '400',
        entityType: 'block',
        oldValue: '',
        parentEntityId: '300',
        parentEntityType: 'area',
        type: 'deleted',
        userFk: ME,
      }),
    ],
    domain: 'block',
    entities: worldWith([[{ id: '400', type: 'block' }, null]]),
    expected:
      'Removal card whose tombstone has no name to borrow: named() rejects the empty oldValue, so the card renders the missing-name state. No change line.',
    id: 'BLOCK-07c',
  },
  {
    action: 'BLOCK-07a, then tap Undo on the Block deleted snackbar (hard restore)',
    activities: [],
    domain: 'block',
    expected:
      'No card. The delete row is erased, and the columnName: null filter spares deleted:location, deleted:topo and deleted:file. The block returns with a new id, and reassignActivityEntity moves its history onto that id, so its old rows stay live.',
    id: 'BLOCK-08a',
  },
  {
    action: 'BLOCK-07b, then tap Undo on the Block deleted snackbar (soft restore)',
    activities: [],
    domain: 'block',
    expected:
      'No card. The same row is erased, and the id survives, so the whole prior timeline of the block stays live.',
    id: 'BLOCK-08b',
  },
  {
    action:
      'Read a files.id where block_fk = {blockId} out of psql, sign in with region DELETE, /f/{fileId} -> trash -> Delete media -> Delete',
    activities: [
      activityAgo(5, {
        columnName: 'file',
        entityId: '400',
        entityType: 'block',
        oldValue: 'photo',
        userFk: ME,
      }),
    ],
    domain: 'block',
    expected:
      'single card, burst kind keyed on block:{blockId} because the row carries no parent. file renderer: one muted line "Photo removed" under the label "Photo".',
    id: 'BLOCK-09',
  },

  // ==== ROUTE ====
  {
    action:
      '/blocks/400 -> More -> Manage -> Add route -> /blocks/400/routes/add -> fill Route name, Grade, Rating, Tags, Description, Year, First ascensionists -> Add',
    activities: [
      activityAgo(5, {
        entityId: '500',
        entityType: 'route',
        newValue: 'Kante direkt',
        parentEntityId: '400',
        parentEntityType: 'block',
        type: 'created',
        userFk: ME,
      }),
    ],
    domain: 'route',
    expected: 'single card, "You added Kante direkt". No change line: create verbs declare no field.',
    id: 'ROUTE-01a',
  },
  {
    action: 'Same add form, submit with Route name left blank',
    activities: [
      activityAgo(5, {
        entityId: '503',
        entityType: 'route',
        newValue: '',
        parentEntityId: '400',
        parentEntityType: 'block',
        type: 'created',
        userFk: ME,
      }),
    ],
    domain: 'route',
    entities: worldWith([[{ id: '503', type: 'route' }, routeEntity('', 8)]]),
    expected:
      'single card. toRouteListItem already swapped the blank name for the placeholder, so both the headline and the row carry it as an ordinary name and render it in the same weight. No change line.',
    id: 'ROUTE-01b',
  },
  {
    action: 'Same add form, drop two files on the Photos & videos tile before Add',
    activities: [
      activityAgo(5, {
        entityId: '501',
        entityType: 'route',
        newValue: 'Riss',
        parentEntityId: '400',
        parentEntityType: 'block',
        type: 'created',
        userFk: ME,
      }),
      activityAgo(4, {
        entityId: 'f-r1c-0',
        entityType: 'file',
        parentEntityId: '501',
        parentEntityType: 'route',
        type: 'uploaded',
        userFk: ME,
      }),
      activityAgo(3, {
        entityId: 'f-r1c-1',
        entityType: 'file',
        parentEntityId: '501',
        parentEntityType: 'route',
        type: 'uploaded',
        userFk: ME,
      }),
    ],
    domain: 'route',
    entities: worldWith([
      [{ id: 'f-r1c-0', type: 'file' }, fileEntity('Riss', [photo('r1c-0')])],
      [{ id: 'f-r1c-1', type: 'file' }, fileEntity('Riss', [photo('r1c-1')])],
    ]),
    expected:
      'Two cards: a burst or single card for the create, and a separate upload card for the two files (different key prefixes). Neither has a change line, and the upload card names the route it hangs on, never the file.',
    id: 'ROUTE-01c',
  },
  {
    action: 'Same add form, pick Me in First ascensionists on a first ever self-claim in the region',
    activities: [
      activityAgo(5, {
        entityId: '502',
        entityType: 'route',
        newValue: 'Dach',
        parentEntityId: '400',
        parentEntityType: 'block',
        type: 'created',
        userFk: 5,
      }),
      activityAgo(4, {
        columnName: 'first ascensionist',
        entityId: '5',
        entityType: 'user',
        newValue: 'Mara Lindqvist',
        userFk: 5,
      }),
    ],
    domain: 'route',
    expected:
      'Two cards: the burst or single create card, plus a separate entity card keyed entity:user:5. No change line on the create, a text chip pair on the user row.',
    id: 'ROUTE-01d',
  },
  {
    action: 'Same add form, reuse a route name that already exists on that block',
    activities: [],
    domain: 'route',
    expected: 'No card at all. invalid() fires before any insert, and blank names are exempt from the check.',
    id: 'ROUTE-01e',
  },
  {
    action: '/blocks/400/topos/edit -> Routes -> Add route to this photo -> Or create new -> Quick line',
    activities: [
      activityAgo(5, {
        entityId: '503',
        entityType: 'route',
        newValue: '',
        parentEntityId: '400',
        parentEntityType: 'block',
        type: 'created',
        userFk: ME,
      }),
    ],
    domain: 'route',
    entities: worldWith([[{ id: '503', type: 'route' }, routeEntity('', 8)]]),
    expected:
      'single card for a nameless quick line: same shape as ROUTE-01b, the placeholder arriving as the mapped name. No change line.',
    id: 'ROUTE-01f',
  },
  {
    action:
      '/blocks/400/topos/edit -> Routes -> New route -> fill Route name, Grade, Tags -> header check button (aria-label Add)',
    activities: [
      activityAgo(5, {
        entityId: '502',
        entityType: 'route',
        newValue: 'Dach',
        parentEntityId: '400',
        parentEntityType: 'block',
        type: 'created',
        userFk: ME,
      }),
    ],
    domain: 'route',
    expected:
      'single card, identical to ROUTE-01a. This form has no FA field, so the ROUTE-14 user row is unreachable here. No change line.',
    id: 'ROUTE-01g',
  },
  {
    action: '/routes/500 -> More -> Manage -> Edit -> change Route name -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'name',
        entityId: '500',
        entityType: 'route',
        newValue: 'Kante direkt',
        oldValue: 'Kante',
        parentEntityId: '400',
        parentEntityType: 'block',
        userFk: ME,
      }),
    ],
    domain: 'route',
    expected: 'single card. text renderer, two neutral chips with an arrow.',
    id: 'ROUTE-02a',
  },
  {
    action: '/routes/500/edit -> clear the Route name field -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'name',
        entityId: '500',
        entityType: 'route',
        newValue: '',
        oldValue: 'Kante direkt',
        parentEntityId: '400',
        parentEntityType: 'block',
        userFk: ME,
      }),
    ],
    domain: 'route',
    // The name was just cleared, so the route is still there and has none. Hydrating it under
    // its old name is what made this read as "renders the old name" next to ROUTE-02a.
    entities: worldWith([[{ id: '500', type: 'route' }, routeEntity('', 11)]]),
    expected:
      'single card. The headline slot has no name to show, so it falls to the unnamed placeholder. text renderer, the new chip is the italic Not set (the zod field defaults to empty string, never null).',
    id: 'ROUTE-02b',
  },
  {
    action: '/routes/500/edit -> Save without touching the name',
    activities: [],
    domain: 'route',
    expected: 'No card at all. The diff is empty, so nothing is written.',
    id: 'ROUTE-02c',
  },
  {
    action: '/routes/503/edit -> drag Grade on an ungraded route -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'gradeFk',
        entityId: '503',
        entityType: 'route',
        newValue: '8',
        parentEntityId: '400',
        parentEntityType: 'block',
        userFk: ME,
      }),
    ],
    domain: 'route',
    expected:
      "single card. grade renderer, italic Not set chip to a coloured RouteGrade pill in the viewer's grading scale.",
    id: 'ROUTE-03a',
  },
  {
    action: '/routes/501/edit -> move Grade from one value to another -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'gradeFk',
        entityId: '501',
        entityType: 'route',
        newValue: '15',
        oldValue: '11',
        parentEntityId: '400',
        parentEntityType: 'block',
        userFk: ME,
      }),
    ],
    domain: 'route',
    expected: 'single card. grade renderer, two coloured pills with an arrow.',
    id: 'ROUTE-03b',
  },
  {
    action: '/routes/501/edit -> clear the Grade -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'gradeFk',
        entityId: '501',
        entityType: 'route',
        oldValue: '15',
        parentEntityId: '400',
        parentEntityType: 'block',
        userFk: ME,
      }),
    ],
    domain: 'route',
    expected: 'single card. grade renderer, pill to Not set. newValue is null here, not the empty string.',
    id: 'ROUTE-03c',
  },
  {
    action: '/routes/502/edit -> tap 2 stars under Rating -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'rating',
        entityId: '502',
        entityType: 'route',
        newValue: '2',
        parentEntityId: '400',
        parentEntityType: 'block',
        userFk: ME,
      }),
    ],
    domain: 'route',
    expected:
      'single card. rating renderer, 3 empty stars to 2 filled. There is no Not set branch, null coerces to 0 stars.',
    id: 'ROUTE-04a',
  },
  {
    action: '/routes/502/edit -> tap the selected star again to clear the Rating -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'rating',
        entityId: '502',
        entityType: 'route',
        oldValue: '2',
        parentEntityId: '400',
        parentEntityType: 'block',
        userFk: ME,
      }),
    ],
    domain: 'route',
    expected: 'single card. rating renderer, filled stars to empty (newValue null).',
    id: 'ROUTE-04b',
  },
  {
    action: 'Forge a rating outside 1..3 into the edit form and Save',
    activities: [],
    domain: 'route',
    expected: 'No card at all. zod rejects the whole form, so none of the seven columns is written.',
    id: 'ROUTE-04c',
  },
  {
    action: '/routes/500/edit -> toggle a tag chip on -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'tags',
        entityId: '500',
        entityType: 'route',
        newValue: 'SD,highball',
        oldValue: 'SD',
        parentEntityId: '400',
        parentEntityType: 'block',
        userFk: ME,
      }),
    ],
    domain: 'route',
    expected: 'single card. tags renderer, a green Added highball chip only, no arrow and no Not set.',
    id: 'ROUTE-05a',
  },
  {
    action: '/routes/500/edit -> deselect every tag -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'tags',
        entityId: '500',
        entityType: 'route',
        newValue: '',
        oldValue: 'SD,highball',
        parentEntityId: '400',
        parentEntityType: 'block',
        userFk: ME,
      }),
    ],
    domain: 'route',
    expected: 'single card. tags renderer, red Removed chips for both tags. newValue is the empty string, not null.',
    id: 'ROUTE-05b',
  },
  {
    action: '/routes/500/edit -> reselect the same tags in a different order -> Save',
    activities: [],
    domain: 'route',
    expected: 'No card at all. Both sides are sorted before joining, so the diff is empty.',
    id: 'ROUTE-05c',
  },
  {
    action: '/routes/500/edit on a route carrying a tag the region has retired -> Save without touching Tags',
    activities: [],
    domain: 'route',
    expected: 'No card at all. oldTags always join the allowlist, so the retired tag is not silently stripped.',
    id: 'ROUTE-05d',
  },
  {
    action: 'Legacy row: a tags row written even though the tag set did not change',
    activities: [
      activityAgo(5, {
        columnName: 'tags',
        entityId: '500',
        entityType: 'route',
        newValue: 'SD,highball',
        oldValue: 'SD,highball',
        parentEntityId: '400',
        parentEntityType: 'block',
        userFk: ME,
      }),
    ],
    domain: 'route',
    expected:
      'single card. tags renderer draws an empty value cell: icon plus the Tags label and nothing else. Worth eyeballing.',
    id: 'ROUTE-05e',
  },
  {
    action: '/routes/501/edit -> First ascensionists -> Add "Jane Doe" -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'firstAscensionists',
        entityId: '501',
        entityType: 'route',
        newValue: 'Ada Rossi,Jane Doe',
        oldValue: 'Ada Rossi',
        parentEntityId: '400',
        parentEntityType: 'block',
        userFk: ME,
      }),
    ],
    domain: 'route',
    expected:
      'single card. chips renderer, one chip per name on each side of the arrow. Values are sorted comma joined names, not ids.',
    id: 'ROUTE-06a',
  },
  {
    action: '/routes/501/edit -> First ascensionists -> pick the Me row on a first ever self-claim -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'firstAscensionists',
        entityId: '501',
        entityType: 'route',
        newValue: 'Ada Rossi,Mara Lindqvist',
        oldValue: 'Ada Rossi',
        parentEntityId: '400',
        parentEntityType: 'block',
        userFk: 5,
      }),
      activityAgo(4, {
        columnName: 'first ascensionist',
        entityId: '5',
        entityType: 'user',
        newValue: 'Mara Lindqvist',
        userFk: 5,
      }),
    ],
    domain: 'route',
    expected:
      'Two cards: the route edit (burst or single) with a chips line, and a separate entity card keyed entity:user:5 with a text line.',
    id: 'ROUTE-06b',
  },
  {
    action: '/routes/501/edit -> remove every First ascensionists chip -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'firstAscensionists',
        entityId: '501',
        entityType: 'route',
        newValue: '',
        oldValue: 'Ada Rossi,Jane Doe',
        parentEntityId: '400',
        parentEntityType: 'block',
        userFk: ME,
      }),
    ],
    domain: 'route',
    expected: 'single card. chips renderer, the new side collapses to a single italic Not set.',
    id: 'ROUTE-06c',
  },
  {
    action: '/routes/501/edit -> only reorder the First ascensionists chips -> Save',
    activities: [],
    domain: 'route',
    expected: 'No card at all. The names are sorted before joining, so the diff is empty.',
    id: 'ROUTE-06d',
  },
  {
    action: '/routes/502/edit -> pick a Year on a route with none -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'firstAscentYear',
        entityId: '502',
        entityType: 'route',
        newValue: '1998',
        parentEntityId: '400',
        parentEntityType: 'block',
        userFk: ME,
      }),
    ],
    domain: 'route',
    expected: 'single card. text renderer, Not set to 1998.',
    id: 'ROUTE-07a',
  },
  {
    action: '/routes/502/edit -> change the Year -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'firstAscentYear',
        entityId: '502',
        entityType: 'route',
        newValue: '2004',
        oldValue: '1998',
        parentEntityId: '400',
        parentEntityType: 'block',
        userFk: ME,
      }),
    ],
    domain: 'route',
    expected: 'single card. text renderer, two neutral chips with an arrow.',
    id: 'ROUTE-07b',
  },
  {
    action: '/routes/502/edit -> pick the empty first Year option (a bare dash) -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'firstAscentYear',
        entityId: '502',
        entityType: 'route',
        oldValue: '1998',
        parentEntityId: '400',
        parentEntityType: 'block',
        userFk: ME,
      }),
    ],
    domain: 'route',
    expected: 'single card. text renderer, 1998 to Not set. newValue is null here, not the empty string.',
    id: 'ROUTE-07c',
  },
  {
    action: 'Forge a Year outside 1900..2100 into the edit form and Save',
    activities: [],
    domain: 'route',
    expected: 'No card at all. form_numInvalid fails the whole save, including the other six columns.',
    id: 'ROUTE-07d',
  },
  {
    action: '/routes/503/edit -> type into Description on a route with none -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'description',
        entityId: '503',
        entityType: 'route',
        newValue: 'Sit start on crimps, then the long move to the sloper.',
        oldValue: '',
        parentEntityId: '400',
        parentEntityType: 'block',
        userFk: ME,
      }),
    ],
    domain: 'route',
    expected:
      'single card. prose renderer, collapsed Compare details. No diff when one side is empty: the old side is the empty-string "Not set" over the new text.',
    id: 'ROUTE-08a',
  },
  {
    action: '/routes/503/edit -> edit the existing Description prose -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'description',
        entityId: '503',
        entityType: 'route',
        newValue: 'Sit start on crimps, then the long move to the sloper. Top out left.',
        oldValue: 'Sit start on crimps, then the long move to the sloper.',
        parentEntityId: '400',
        parentEntityType: 'block',
        userFk: ME,
      }),
    ],
    domain: 'route',
    expected:
      'single card. prose renderer: one merged text with the appended sentence marked as added, the rest of the description standing unchanged.',
    id: 'ROUTE-08b',
  },
  {
    action: '/routes/503/edit -> change a clause in the middle of the Description -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'description',
        entityId: '503',
        entityType: 'route',
        newValue: 'Sit start on crimps, then the long move to the sloper. Top out friendlier from the right.',
        oldValue: 'Sit start on crimps, then the long move to the sloper. Top out easier from the left.',
        parentEntityId: '400',
        parentEntityType: 'block',
        userFk: ME,
      }),
    ],
    domain: 'route',
    expected:
      'single card. The case the word diff exists for: "easier" struck through against "friendlier" marked, then "left" against "right", with the sentence around them shown once. Rendered as two whole texts this edit was the reader\'s to find.',
    id: 'ROUTE-08e',
  },
  {
    action: '/routes/503/edit -> replace the Description with an entirely different text -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'description',
        entityId: '503',
        entityType: 'route',
        newValue: 'Start matched on the low rail and trend right along the arete to a jug finish.',
        oldValue: 'Sit start on crimps, then the long move to the sloper.',
        parentEntityId: '400',
        parentEntityType: 'block',
        userFk: ME,
      }),
    ],
    domain: 'route',
    expected:
      'single card, and the noisiest shape this renderer produces. A rewrite still shares its connectors ("on", "the", the full stop), so the diff interleaves around them instead of showing one block struck through followed by one block marked. Honest, and still only a handful of segments, but this is the case to look at if the word diff ever needs a fall back to plain before-and-after.',
    id: 'ROUTE-08f',
  },
  {
    action: '/routes/503/edit -> edit the second paragraph of a three-paragraph Description -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'description',
        entityId: '503',
        entityType: 'route',
        newValue:
          'Stand start on the obvious flake.\n\nMove left into the scoop, then a long pull to the sloper. The topout is friendlier from the right since the block shifted.\n\nShares a landing with !route:501!, so bring a second pad.',
        oldValue:
          'Stand start on the obvious flake.\n\nMove left into the scoop, then a long pull to the sloper. The topout is easier from the left.\n\nShares a landing with !route:501!, so bring a second pad.',
        parentEntityId: '400',
        parentEntityType: 'block',
        userFk: ME,
      }),
    ],
    domain: 'route',
    expected:
      'single card. Paragraph breaks survive, and the two untouched paragraphs read normally while the middle one carries the marks. The `!route:501!` mention shows raw: the diff renders source rather than markdown, because the markdown pipeline drops raw HTML and highlights cannot be put inside a rendered document.',
    id: 'ROUTE-08g',
  },
  {
    action: '/routes/503/edit -> clear the Description editor -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'description',
        entityId: '503',
        entityType: 'route',
        newValue: '',
        oldValue: 'Sit start on crimps, then the long move to the sloper.',
        parentEntityId: '400',
        parentEntityType: 'block',
        userFk: ME,
      }),
    ],
    domain: 'route',
    expected:
      'single card. prose renderer, no diff with one side empty: the old text struck through over the literal "Not set", while the DB column goes null.',
    id: 'ROUTE-08c',
  },
  {
    action: '/routes/503/edit -> open and Save so the editor reserialises the same markdown without a real edit',
    activities: [
      activityAgo(5, {
        columnName: 'description',
        entityId: '503',
        entityType: 'route',
        newValue: 'Sit start on crimps, then the long move to the sloper.\n',
        oldValue: 'Sit start on crimps, then the long move to the sloper.',
        parentEntityId: '400',
        parentEntityType: 'block',
        userFk: ME,
      }),
    ],
    domain: 'route',
    expected:
      'No card. The editor reserialises with a trailing newline, which the diff now trims off both sides before comparing, so an untouched save writes nothing. Only the ends are trimmed: two trailing spaces on a markdown line are a hard break, so whitespace inside a value still counts as a change.',
    id: 'ROUTE-08d',
  },
  {
    action: '/routes/500/edit -> change Route name and Grade -> one Save',
    activities: [
      activityAgo(5, {
        columnName: 'name',
        entityId: '500',
        entityType: 'route',
        newValue: 'Kante direkt',
        oldValue: 'Kante',
        parentEntityId: '400',
        parentEntityType: 'block',
        userFk: ME,
      }),
      activityAgo(5, {
        columnName: 'gradeFk',
        entityId: '500',
        entityType: 'route',
        newValue: '14',
        oldValue: '11',
        parentEntityId: '400',
        parentEntityType: 'block',
        userFk: ME,
      }),
    ],
    domain: 'route',
    expected:
      'One burst card, "2 edits", both rows from one insert sharing a createdAt. Two change lines, text plus grade.',
    id: 'ROUTE-09a',
  },
  {
    action: 'Any ROUTE-02..08 edit, then a second Save of the same column within 15 min',
    activities: [
      activityAgo(5, {
        columnName: 'name',
        entityId: '500',
        entityType: 'route',
        newValue: 'Kante ganz direkt',
        oldValue: 'Kante',
        parentEntityId: '400',
        parentEntityType: 'block',
        userFk: ME,
      }),
    ],
    domain: 'route',
    expected:
      "One folded row, A to C. The intermediate B is erased and the card jumps back to the top of the feed. That column's renderer, here text.",
    id: 'ROUTE-10a',
  },
  {
    action: 'Any ROUTE-02..08 edit, then within 15 min a Save returning the column to its original value',
    activities: [],
    domain: 'route',
    expected: 'No card at all. createUpdateActivity deletes the row it folded back to its start.',
    id: 'ROUTE-10b',
  },
  {
    action: 'Any ROUTE-02..08 edit, then a second Save of the same column more than 15 min later',
    activities: [
      activityAgo(5, {
        columnName: 'name',
        entityId: '500',
        entityType: 'route',
        newValue: 'Kante ganz direkt',
        oldValue: 'Kante direkt',
        parentEntityId: '400',
        parentEntityType: 'block',
        userFk: ME,
      }),
      activityAgo(95, {
        columnName: 'name',
        entityId: '500',
        entityType: 'route',
        newValue: 'Kante direkt',
        oldValue: 'Kante',
        parentEntityId: '400',
        parentEntityType: 'block',
        userFk: ME,
      }),
    ],
    domain: 'route',
    expected:
      'Two rows, no fold. More than 30 min apart they are two single cards with one text line each; inside 30 min the same pair would be one burst card of 2.',
    id: 'ROUTE-10c',
  },
  {
    action: 'ROUTE-01a, then any /routes/{id}/edit Save within 15 min by the creator',
    activities: [],
    domain: 'route',
    expected:
      'No update card at all. createUpdateActivity early-returns on the created row, so the DB columns change silently and the create row keeps the pre-edit values.',
    id: 'ROUTE-10d',
  },
  {
    action: '/routes/500 -> More -> Manage -> Delete route (no confirm) on a bare route',
    activities: [
      activityAgo(5, {
        entityId: '500',
        entityType: 'route',
        oldValue: 'Kante direkt',
        parentEntityId: '400',
        parentEntityType: 'block',
        type: 'deleted',
        userFk: ME,
      }),
    ],
    domain: 'route',
    entities: worldWith([[{ id: '500', type: 'route' }, null]]),
    expected:
      'single card in the removal family, "You removed Kante direkt", the name read off oldValue. No change line: whole-entity delete verbs declare no field.',
    id: 'ROUTE-11a',
  },
  {
    action: '/routes/501 -> More -> Manage -> Delete route on a route with ascents, files and topo lines (soft delete)',
    activities: [
      activityAgo(5, {
        entityId: '501',
        entityType: 'route',
        oldValue: 'Riss',
        parentEntityId: '400',
        parentEntityType: 'block',
        type: 'deleted',
        userFk: ME,
      }),
    ],
    domain: 'route',
    entities: worldWith([[{ id: '501', type: 'route' }, null]]),
    expected:
      'single card, identical to ROUTE-11a. The feed cannot tell a hard delete from a soft one. No change line.',
    id: 'ROUTE-11b',
  },
  {
    action: "/blocks/400/topos/edit -> select the route's line -> Delete route everywhere",
    activities: [
      activityAgo(5, {
        entityId: '502',
        entityType: 'route',
        oldValue: 'Dach',
        parentEntityId: '400',
        parentEntityType: 'block',
        type: 'deleted',
        userFk: ME,
      }),
    ],
    domain: 'route',
    entities: worldWith([[{ id: '502', type: 'route' }, null]]),
    expected:
      'single card, identical row to ROUTE-11a. The editor stays on the page (redirectTo is not applied here). No change line.',
    id: 'ROUTE-11c',
  },
  {
    action: '/routes/503 -> More -> Manage -> Delete route on a route whose name is blank',
    activities: [
      activityAgo(5, {
        entityId: '503',
        entityType: 'route',
        oldValue: '',
        parentEntityId: '400',
        parentEntityType: 'block',
        type: 'deleted',
        userFk: ME,
      }),
    ],
    domain: 'route',
    entities: worldWith([[{ id: '503', type: 'route' }, null]]),
    expected:
      'single removal card. The route is gone and the stored oldValue is empty, so no name is coming from anywhere and the headline shows the unnamed fallback. No change line.',
    id: 'ROUTE-11d',
  },
  {
    action: 'ROUTE-11a, then tap Undo on the Route deleted snackbar (hard restore, new route id)',
    activities: [],
    domain: 'route',
    expected:
      'No card. deleteActivity erases the route/deleted row and the restore writes none of its own, so the undo adds nothing. The route returns with a new id and reassignActivityEntity moves its history onto that id, so whatever timeline it already had stays live, exactly as in the soft case.',
    id: 'ROUTE-12a',
  },
  {
    action: 'ROUTE-11b, then Undo on the Route deleted snackbar (soft restore, same id)',
    activities: [],
    domain: 'route',
    expected:
      "No card at all. deleteActivity erases the route/deleted row, the id survives, and the route's entire prior timeline stays live.",
    id: 'ROUTE-12b',
  },
  {
    action: '/routes/500 -> tap a photo thumb (?media={fileId}) -> trash (aria-label Delete) -> Delete media -> Delete',
    activities: [
      activityAgo(5, {
        columnName: 'file',
        entityId: '500',
        entityType: 'route',
        oldValue: 'photo',
        type: 'deleted',
        userFk: ME,
      }),
    ],
    domain: 'route',
    expected:
      'single card keyed burst:{user}:route:500 (column-scoped, so not a removal). file renderer, one muted line Photo removed under the Photo label.',
    id: 'ROUTE-13a',
  },
  {
    action: 'Same trash flow on a Bunny video attached to the route',
    activities: [
      activityAgo(5, {
        columnName: 'file',
        entityId: '500',
        entityType: 'route',
        oldValue: 'video',
        type: 'deleted',
        userFk: ME,
      }),
    ],
    domain: 'route',
    expected:
      'single card. file renderer, Video removed under the Video label. The word comes off the stored oldValue, since the file itself is gone.',
    id: 'ROUTE-13b',
  },
  {
    action: 'ROUTE-13a twice (or three times) on the same route as the same user',
    activities: [
      activityAgo(5, {
        columnName: 'file',
        entityId: '500',
        entityType: 'route',
        oldValue: 'photo',
        type: 'deleted',
        userFk: ME,
      }),
    ],
    domain: 'route',
    expected:
      'One single card, not two. Every identity column matches, so insertActivity deletes the earlier row and three photo deletions leave exactly one. file renderer.',
    id: 'ROUTE-13c',
  },
  {
    action: 'ROUTE-13a then ROUTE-13b on the same route',
    activities: [
      activityAgo(5, {
        columnName: 'file',
        entityId: '500',
        entityType: 'route',
        oldValue: 'video',
        type: 'deleted',
        userFk: ME,
      }),
      activityAgo(8, {
        columnName: 'file',
        entityId: '500',
        entityType: 'route',
        oldValue: 'photo',
        type: 'deleted',
        userFk: ME,
      }),
    ],
    domain: 'route',
    expected:
      'One burst card, "2 files": oldValue differs, so neither row collapses the other. Both rows are the same kind of change, so the headline speaks that verb rather than "edited", and the two rows disagree on the media word, so it reads "removed media from" and the count says "files" rather than "photos". Two file lines, labelled Video and Photo.',
    id: 'ROUTE-13d',
  },
  {
    action: 'Delete a file whose four parent FKs are all null via /f/{fileId} -> trash -> Delete media -> Delete',
    activities: [],
    domain: 'route',
    expected:
      'No card at all. fileParent() returns undefined, so nothing is logged, while the file row and its bytes still go.',
    id: 'ROUTE-13e',
  },
  {
    action:
      '/blocks/400/routes/add or /routes/501/edit -> First ascensionists -> Me -> submit, first ever claim in that region',
    activities: [
      activityAgo(5, {
        columnName: 'first ascensionist',
        entityId: '5',
        entityType: 'user',
        newValue: 'Mara Lindqvist',
        userFk: 5,
      }),
    ],
    domain: 'route',
    expected:
      'single card in the entity family (entity:user:5), pointing at the caller, not the route. text renderer, two chips.',
    id: 'ROUTE-14a',
  },
  {
    action: 'Repeat the Me self-claim on another route in the same region',
    activities: [],
    domain: 'route',
    expected: 'No card at all. The lookup matches on userFk, so the claim is logged only once per region.',
    id: 'ROUTE-14b',
  },
  {
    action: 'Me self-claim where a firstAscensionists row already carries your username but is unlinked',
    activities: [],
    domain: 'route',
    expected: 'No card at all. The match is by name, so the link is never made and your profile stays unlinked.',
    id: 'ROUTE-14c',
  },
  {
    action: "Me self-claim with someone else's userFk forged into the hidden input",
    activities: [],
    domain: 'route',
    expected: 'No card at all. The climber row is created unlinked, so nothing is logged.',
    id: 'ROUTE-14d',
  },
  {
    action: 'Me self-claim repeated in a second region',
    activities: [
      activityAgo(5, {
        columnName: 'first ascensionist',
        entityId: '5',
        entityType: 'user',
        newValue: 'Mara Lindqvist',
        regionFk: 2,
        userFk: 5,
      }),
      activityAgo(95, {
        columnName: 'first ascensionist',
        entityId: '5',
        entityType: 'user',
        newValue: 'Mara Lindqvist',
        userFk: 5,
      }),
    ],
    domain: 'route',
    expected:
      'One row per region, the lookup being region-scoped. Two entity cards here only because of the time gap: the entity key carries no region, so two claims inside 30 min would share one card.',
    id: 'ROUTE-14e',
  },
  {
    action: "Me self-claim inside 15 min of the route's own creation",
    activities: [
      activityAgo(5, {
        columnName: 'first ascensionist',
        entityId: '5',
        entityType: 'user',
        newValue: 'Mara Lindqvist',
        userFk: 5,
      }),
    ],
    domain: 'route',
    expected:
      'single entity card. The route update row is suppressed by the created-row guard but this one is still written (insertActivity has no such guard), so the claim shows with no route card next to it. text renderer.',
    id: 'ROUTE-14f',
  },

  // ==== ASCENT ====
  {
    action: '/routes/{id} -> Log ascent -> /routes/{id}/ascents/add -> How did it go? card 1 Attempt -> Save',
    activities: [
      activityAgo(5, {
        entityId: '9001',
        entityType: 'ascent',
        newValue: 'attempt',
        parentEntityId: '500',
        parentEntityType: 'route',
        type: 'created',
        userFk: ME,
      }),
    ],
    domain: 'ascent',
    expected:
      'session kind, one row so it renders single, "You tried Rampe". No change line, and the status glyph is the dotted project circle.',
    id: 'ASC-01a',
  },
  {
    action: '/routes/{id}/ascents/add -> How did it go? card 2 Flash -> Save',
    activities: [
      activityAgo(5, {
        entityId: '9001',
        entityType: 'ascent',
        newValue: 'flash',
        parentEntityId: '500',
        parentEntityType: 'route',
        type: 'created',
        userFk: ME,
      }),
    ],
    domain: 'ascent',
    expected: 'session kind, single card, value-scoped to the flash sentence. No change line, filled lightning glyph.',
    id: 'ASC-01b',
  },
  {
    action: '/routes/{id}/ascents/add -> How did it go? card 3 Redpoint -> Save',
    activities: [
      activityAgo(5, {
        entityId: '9001',
        entityType: 'ascent',
        newValue: 'redpoint',
        parentEntityId: '500',
        parentEntityType: 'route',
        type: 'created',
        userFk: ME,
      }),
    ],
    domain: 'ascent',
    expected: 'session kind, single card, redpoint sentence picked off newValue. No change line, check stroke glyph.',
    id: 'ASC-01c',
  },
  {
    action: '/routes/{id}/ascents/add -> How did it go? card 4 Repeat -> Save',
    activities: [
      activityAgo(5, {
        entityId: '9001',
        entityType: 'ascent',
        newValue: 'repeat',
        parentEntityId: '500',
        parentEntityType: 'route',
        type: 'created',
        userFk: ME,
      }),
    ],
    domain: 'ascent',
    expected: 'session kind, single card, repeat sentence. No change line, circular arrows glyph.',
    id: 'ASC-01d',
  },
  {
    action: '/routes/{id}/ascents/add -> Flash -> drop 3 photos on the Add tile -> Save',
    activities: [
      activityAgo(2, {
        entityId: 'f-asc-1',
        entityType: 'file',
        parentEntityId: '9001',
        parentEntityType: 'ascent',
        type: 'uploaded',
        userFk: ME,
      }),
      activityAgo(3, {
        entityId: 'f-asc-2',
        entityType: 'file',
        parentEntityId: '9001',
        parentEntityType: 'ascent',
        type: 'uploaded',
        userFk: ME,
      }),
      activityAgo(4, {
        entityId: 'f-asc-3',
        entityType: 'file',
        parentEntityId: '9001',
        parentEntityType: 'ascent',
        type: 'uploaded',
        userFk: ME,
      }),
      activityAgo(5, {
        entityId: '9001',
        entityType: 'ascent',
        newValue: 'flash',
        parentEntityId: '500',
        parentEntityType: 'route',
        type: 'created',
        userFk: ME,
      }),
    ],
    domain: 'ascent',
    entities: worldWith([
      [{ id: 'f-asc-1', type: 'file' }, fileEntity('Rampe', [photo('asc-1')])],
      [{ id: 'f-asc-2', type: 'file' }, fileEntity('Rampe', [photo('asc-2')])],
      [{ id: 'f-asc-3', type: 'file' }, fileEntity('Rampe', [photo('asc-3')])],
    ]),
    expected:
      'Two cards: an upload card of 3 keyed on the ascent (media reads photo, all three files agree) and a single session card for the flash. No change lines on either.',
    id: 'ASC-01e',
  },
  {
    action: '/routes/{id}/ascents/add -> Flash -> drop one photo and one video on the Add tile -> Save',
    activities: [
      activityAgo(2, {
        entityId: 'f-asc-4',
        entityType: 'file',
        parentEntityId: '9001',
        parentEntityType: 'ascent',
        type: 'uploaded',
        userFk: ME,
      }),
      activityAgo(3, {
        entityId: 'f-asc-5',
        entityType: 'file',
        parentEntityId: '9001',
        parentEntityType: 'ascent',
        type: 'uploaded',
        userFk: ME,
      }),
      activityAgo(5, {
        entityId: '9001',
        entityType: 'ascent',
        newValue: 'flash',
        parentEntityId: '500',
        parentEntityType: 'route',
        type: 'created',
        userFk: ME,
      }),
    ],
    domain: 'ascent',
    entities: worldWith([
      [{ id: 'f-asc-4', type: 'file' }, fileEntity('Rampe', [photo('asc-4')])],
      [{ id: 'f-asc-5', type: 'file' }, fileEntity('Rampe', [video('asc-5')])],
    ]),
    expected:
      'An upload card of 2 whose media param falls to none (the two kinds disagree), so it reads "added media to your ascent of Rampe", plus the single session card. No change lines.',
    id: 'ASC-01f',
  },
  {
    action: '/routes/{id}/ascents/add -> Flash -> fill Notes -> Save',
    activities: [
      activityAgo(5, {
        entityId: '9001',
        entityType: 'ascent',
        newValue: 'flash',
        parentEntityId: '500',
        parentEntityType: 'route',
        type: 'created',
        userFk: ME,
      }),
    ],
    domain: 'ascent',
    entities: worldWith([
      [
        { id: '9001', type: 'ascent' },
        {
          ascentType: 'flash',
          climberFk: ME,
          climberName: 'Ada Rossi',
          crumbs: ['Steinbruch', 'Westwand', 'Nordblock'],
          href: '#',
          name: 'Rampe',
          note: 'Cold and dry, the crux crimp finally felt sticky.',
          route: { description: '', gradeFk: 12, name: 'Rampe', rating: 2, tags: [] },
          row: 'route',
        },
      ],
    ]),
    expected:
      'Identical single session card (notes never reach the ascent row), no change line, but the hydrated note renders as a blockquote under the row.',
    id: 'ASC-01g',
  },
  {
    action:
      '/routes/{id}/ascents/add -> Attempt -> back-date with the third When segment -> set Your grade and Your rating -> expand Conditions -> Save',
    activities: [
      activityAgo(5, {
        entityId: '9001',
        entityType: 'ascent',
        newValue: 'attempt',
        parentEntityId: '500',
        parentEntityType: 'route',
        type: 'created',
        userFk: ME,
      }),
    ],
    domain: 'ascent',
    entities: worldWith([
      [
        { id: '9001', type: 'ascent' },
        {
          ...routeEntity('Rampe', 12),
          ascentGradeFk: 14,
          ascentRating: 3,
          ascentType: 'attempt',
          climbedAt: utcDay(3),
          climberFk: ME,
          climberName: 'Ada Rossi',
          humidity: 45,
          temperature: 18,
        },
      ],
    ]),
    expected:
      'Identical single session card, still dated by activities.createdAt (today) so it sorts to the top, but the sub line now reads "Climbed on ..." because the climb date is a different calendar day than the log date. Under the row, a "This ascent" strip with the climber\'s own grade pill, their stars and a conditions pill, none of which the route row beside it shows. Still no change line.',
    id: 'ASC-01h',
  },
  {
    action:
      '/routes/{id}/ascents/add -> Attempt -> leave Your grade and Your rating alone -> expand Conditions -> set the temperature -> Save',
    activities: [
      activityAgo(5, {
        entityId: '9001',
        entityType: 'ascent',
        newValue: 'attempt',
        parentEntityId: '500',
        parentEntityType: 'route',
        type: 'created',
        userFk: ME,
      }),
    ],
    domain: 'ascent',
    entities: worldWith([
      [
        { id: '9001', type: 'ascent' },
        {
          ...routeEntity('Rampe', 12),
          ascentType: 'attempt',
          climberFk: ME,
          climberName: 'Ada Rossi',
          temperature: 18,
        },
      ],
    ]),
    expected:
      'Identical single session card. The "This ascent" strip carries the conditions pill alone: no grade chip, no stars. The climber said neither, and a placeholder grade beside three empty stars would put an opinion in their mouth.',
    id: 'ASC-01i',
  },
  {
    action:
      '/routes/{id}/ascents -> Details -> Edit -> /ascents/{id}/edit -> pick another type card -> Save, more than 15 min after logging',
    activities: [
      activityAgo(5, {
        columnName: 'type',
        entityId: '9001',
        entityType: 'ascent',
        newValue: 'redpoint',
        oldValue: 'attempt',
        userFk: ME,
      }),
    ],
    domain: 'ascent',
    expected:
      'session kind, single card, the shared "edited the ascent" sentence. text renderer, label Type with the pickaxe icon, two chips.',
    id: 'ASC-02a',
  },
  {
    action: '/ascents/{id}/edit -> Save without changing the type',
    activities: [],
    domain: 'ascent',
    expected: 'No card. The column diff finds nothing, so no row is written.',
    id: 'ASC-02b',
  },
  {
    action: '/ascents/{id}/edit -> try to clear the type (no tap-again-to-clear, schema marks it required)',
    activities: [],
    domain: 'ascent',
    expected: 'No card, and no way to produce one. Clearing the type is unreachable through the UI.',
    id: 'ASC-02c',
  },
  {
    action: '/ascents/{id}/edit -> drag Your grade on an ascent with none -> Save',
    activities: [
      activityAgo(5, { columnName: 'gradeFk', entityId: '9001', entityType: 'ascent', newValue: '15', userFk: ME }),
    ],
    domain: 'ascent',
    expected:
      'session kind, single card. grade renderer, label Grade, italic Not set to a coloured pill in the viewer scale.',
    id: 'ASC-03a',
  },
  {
    action: '/ascents/{id}/edit -> Clear next to the grade pill -> Save',
    activities: [
      activityAgo(5, { columnName: 'gradeFk', entityId: '9001', entityType: 'ascent', oldValue: '15', userFk: ME }),
    ],
    domain: 'ascent',
    expected:
      'session kind, single card. grade renderer, coloured pill to Not set (newValue is null, not empty string).',
    id: 'ASC-03b',
  },
  {
    action: '/ascents/{id}/edit -> tap a star under Your rating -> Save',
    activities: [
      activityAgo(5, { columnName: 'rating', entityId: '9001', entityType: 'ascent', newValue: '2', userFk: ME }),
    ],
    domain: 'ascent',
    expected: 'session kind, single card. rating renderer, label Rating, empty stars to two filled.',
    id: 'ASC-04a',
  },
  {
    action: '/ascents/{id}/edit -> tap the selected star again to clear -> Save',
    activities: [
      activityAgo(5, { columnName: 'rating', entityId: '9001', entityType: 'ascent', oldValue: '2', userFk: ME }),
    ],
    domain: 'ascent',
    expected:
      'session kind, single card. rating renderer, filled to empty stars. Null coerces to zero stars, never Not set.',
    id: 'ASC-04b',
  },
  {
    action: '/ascents/{id}/edit -> When -> Yesterday or a picked date -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'dateTime',
        entityId: '9001',
        entityType: 'ascent',
        newValue: '2026-08-02',
        oldValue: '2026-08-03',
        userFk: ME,
      }),
    ],
    domain: 'ascent',
    expected:
      'session kind, single card. date renderer, label Date with the history icon, both chips localised off the stored YYYY-MM-DD.',
    id: 'ASC-05a',
  },
  {
    action: '/ascents/{id}/edit -> When -> Today on an ascent already dated today -> Save',
    activities: [],
    domain: 'ascent',
    expected: 'No card. The date string is unchanged, so the diff writes nothing.',
    id: 'ASC-05b',
  },
  {
    action: '/ascents/{id}/edit -> Save untouched on a machine whose locale is far from UTC',
    activities: [
      activityAgo(5, {
        columnName: 'dateTime',
        entityId: '9001',
        entityType: 'ascent',
        newValue: '2026-08-04',
        oldValue: '2026-08-03',
        userFk: ME,
      }),
    ],
    domain: 'ascent',
    expected:
      'A spurious session card nobody asked for: the form seeds from the UTC slice while today is the local calendar day. date renderer, two localised date chips.',
    id: 'ASC-05c',
  },
  {
    action: '/ascents/{id}/edit -> expand Conditions -> drag Temperature -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'temperature',
        entityId: '9001',
        entityType: 'ascent',
        newValue: '12',
        oldValue: '8',
        userFk: ME,
      }),
    ],
    domain: 'ascent',
    expected:
      'session kind, single card. temperature renderer, label Temperature, both chips through formatCelsius so they follow the unit preference of whoever is reading.',
    id: 'ASC-06a',
  },
  {
    action: '/ascents/{id}/edit -> Conditions -> Clear on the Temperature header row -> Save',
    activities: [
      activityAgo(5, { columnName: 'temperature', entityId: '9001', entityType: 'ascent', oldValue: '12', userFk: ME }),
    ],
    domain: 'ascent',
    expected: 'session kind, single card. temperature renderer, chip to Not set.',
    id: 'ASC-06b',
  },
  {
    action: '/ascents/{id}/edit -> Conditions -> drag Humidity -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'humidity',
        entityId: '9001',
        entityType: 'ascent',
        newValue: '55',
        oldValue: '40',
        userFk: ME,
      }),
    ],
    domain: 'ascent',
    expected:
      'session kind, single card. humidity renderer, label Humidity, both chips carrying the percent sign like the ascent row does.',
    id: 'ASC-07a',
  },
  {
    action: '/ascents/{id}/edit -> Conditions -> Clear on the Humidity header row -> Save',
    activities: [
      activityAgo(5, { columnName: 'humidity', entityId: '9001', entityType: 'ascent', oldValue: '55', userFk: ME }),
    ],
    domain: 'ascent',
    expected: 'session kind, single card. humidity renderer, chip to Not set.',
    id: 'ASC-07b',
  },
  {
    action: '/ascents/{id}/edit -> type into Notes on an ascent with none -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'notes',
        entityId: '9001',
        entityType: 'ascent',
        newValue: 'Went second try after brushing the top.',
        oldValue: '',
        userFk: ME,
      }),
    ],
    domain: 'ascent',
    expected:
      'session kind, single card. prose renderer, label Notes, empty old side (the handler coerces to an empty string).',
    id: 'ASC-08a',
  },
  {
    action: '/ascents/{id}/edit -> empty the Notes editor -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'notes',
        entityId: '9001',
        entityType: 'ascent',
        newValue: '',
        oldValue: 'Went second try after brushing the top.',
        userFk: ME,
      }),
    ],
    domain: 'ascent',
    expected:
      'session kind, single card. prose renderer, new side falls back to Not set. The only ascent column whose cleared state is an empty string rather than null.',
    id: 'ASC-08b',
  },
  {
    action: '/ascents/{id}/edit -> insert an @mention into Notes -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'notes',
        entityId: '9001',
        entityType: 'ascent',
        newValue: 'Belayed by !user:5! all afternoon.',
        oldValue: 'Belayed all afternoon.',
        userFk: ME,
      }),
    ],
    domain: 'ascent',
    expected:
      'session kind, single card. prose renderer renders both sides as markdown, links disabled, the way the card blockquote renders the note itself.',
    id: 'ASC-08c',
  },
  {
    action: '/ascents/{id}/edit -> change type, grade and notes in one Save',
    activities: [
      activityAgo(5, {
        columnName: 'type',
        entityId: '9001',
        entityType: 'ascent',
        newValue: 'redpoint',
        oldValue: 'attempt',
        userFk: ME,
      }),
      activityAgo(5, {
        columnName: 'gradeFk',
        entityId: '9001',
        entityType: 'ascent',
        newValue: '15',
        oldValue: '12',
        userFk: ME,
      }),
      activityAgo(5, {
        columnName: 'notes',
        entityId: '9001',
        entityType: 'ascent',
        newValue: 'Felt easier the second time.',
        oldValue: '',
        userFk: ME,
      }),
    ],
    domain: 'ascent',
    expected:
      'One card of 3 rows sharing a createdAt. One actor, one ascent and one kind of change, so the headline speaks that change rather than "logged a session", and the summary counts edits. Three change lines: text, grade, prose.',
    id: 'ASC-09a',
  },
  {
    action: '/ascents/{id}/edit -> change a column -> Save, then change the same column again within 15 min',
    activities: [
      activityAgo(5, {
        columnName: 'gradeFk',
        entityId: '9001',
        entityType: 'ascent',
        newValue: '17',
        oldValue: '12',
        userFk: ME,
      }),
    ],
    domain: 'ascent',
    expected:
      'One folded row, A to C, so a single session card. The intermediate value is erased. grade renderer, two pills.',
    id: 'ASC-09b',
  },
  {
    action: '/ascents/{id}/edit -> change a column, then set it back to its original value within 15 min',
    activities: [],
    domain: 'ascent',
    expected: 'No card at all. createUpdateActivity deletes the row it folded back to its starting value.',
    id: 'ASC-09c',
  },
  {
    action: '/routes/{id}/ascents/add -> Save, then /ascents/{id}/edit any field within 15 min',
    activities: [],
    domain: 'ascent',
    expected:
      'No update card. A create row inside 15 minutes makes the function return before inserting, and the create row keeps the pre-edit value.',
    id: 'ASC-09d',
  },
  {
    action: "As a region admin, /ascents/{id}/edit on somebody else's ascent -> change the grade -> Save",
    activities: [
      activityAgo(5, {
        columnName: 'gradeFk',
        entityId: '9002',
        entityType: 'ascent',
        newValue: '13',
        oldValue: '9',
        userFk: ME,
      }),
    ],
    domain: 'ascent',
    expected:
      'Byte-identical row to ASC-03a, session keyed on the admin, single card. Only the owner param flips to other, so the headline names Sofia Brandt. grade renderer.',
    id: 'ASC-09e',
  },
  {
    action: 'Two people edit the same ascent from /ascents/{id}/edit within 15 min of each other',
    activities: [
      activityAgo(5, {
        columnName: 'rating',
        entityId: '9002',
        entityType: 'ascent',
        newValue: '3',
        oldValue: '2',
        userFk: 5,
      }),
      activityAgo(8, {
        columnName: 'notes',
        entityId: '9002',
        entityType: 'ascent',
        newValue: 'Chalked the start holds.',
        oldValue: '',
        userFk: 3,
      }),
    ],
    domain: 'ascent',
    expected:
      'Two rows (the fold filters on userFk) and two single session cards, because the session key carries the actor. One change line each, rating and prose.',
    id: 'ASC-09f',
  },
  {
    action: '/routes/{id}/ascents -> expand the ascent row -> Delete -> confirm Delete ascent',
    activities: [
      activityAgo(5, {
        entityId: '9001',
        entityType: 'ascent',
        metadata: deletedAscent(ME, 'Ada Rossi'),
        oldValue: 'flash',
        parentEntityId: '500',
        parentEntityType: 'route',
        type: 'deleted',
        userFk: ME,
      }),
    ],
    domain: 'ascent',
    entities: worldWith([[{ id: '9001', type: 'ascent' }, null]]),
    expected:
      'removal kind (predicate 1 fires before the ascent predicate), one row so it renders single. "your ascent": the deleted row recorded whose it was, since hydration cannot answer for a row that no longer exists. No change line.',
    id: 'ASC-10a',
  },
  {
    action: "As an admin, expand somebody else's ascent row -> Delete -> confirm Delete ascent",
    activities: [
      activityAgo(5, {
        entityId: '9002',
        entityType: 'ascent',
        metadata: deletedAscent(3, 'Jonas Weber'),
        oldValue: 'redpoint',
        parentEntityId: '501',
        parentEntityType: 'route',
        type: 'deleted',
        userFk: ME,
      }),
    ],
    domain: 'ascent',
    entities: worldWith([[{ id: '9002', type: 'ascent' }, null]]),
    expected:
      'Identical removal row, single card. The ascent is gone, so hydration cannot resolve climberFk and the card reads the climber off what the delete wrote down: "Jonas Weber\'s ascent", the moderation case that would otherwise name nobody. The entity name falls back to the parent route. No change line.',
    id: 'ASC-10b',
  },
  {
    action: 'Delete an ascent that carries photos and videos, via expand -> Delete -> Delete ascent',
    activities: [
      activityAgo(5, {
        entityId: '9001',
        entityType: 'ascent',
        metadata: deletedAscent(ME, 'Ada Rossi'),
        oldValue: 'flash',
        parentEntityId: '500',
        parentEntityType: 'route',
        type: 'deleted',
        userFk: ME,
      }),
    ],
    domain: 'ascent',
    entities: worldWith([[{ id: '9001', type: 'ascent' }, null]]),
    expected:
      'One removal row total, single card. The files and their bytes go silently, and earlier upload cards stay but lose their thumbnails. No change line.',
    id: 'ASC-10c',
  },
  {
    action:
      'Tap an ascent photo thumb (route page, ascent list, /ascents/{id}/edit or /profile) -> trash -> Delete media -> Delete',
    activities: [
      activityAgo(5, {
        columnName: 'file',
        entityId: '9001',
        entityType: 'ascent',
        oldValue: 'photo',
        type: 'deleted',
        userFk: ME,
      }),
    ],
    domain: 'ascent',
    expected:
      'entity kind keyed entity:ascent:9001 (the columnName guard keeps it out of session), one row so it renders single. file renderer, Photo removed, label Photo.',
    id: 'ASC-11a',
  },
  {
    action: 'Tap an ascent video thumb -> trash -> Delete media -> Delete',
    activities: [
      activityAgo(5, {
        columnName: 'file',
        entityId: '9001',
        entityType: 'ascent',
        oldValue: 'video',
        type: 'deleted',
        userFk: ME,
      }),
    ],
    domain: 'ascent',
    expected:
      'entity kind, single card. file renderer, Video removed, label Video, read off the stored word rather than the file (which is gone).',
    id: 'ASC-11b',
  },
  {
    action: 'A media removal row written before the media word was stored (legacy data, no UI path today)',
    activities: [
      activityAgo(5, { columnName: 'file', entityId: '9001', entityType: 'ascent', type: 'deleted', userFk: ME }),
    ],
    domain: 'ascent',
    expected:
      'entity kind, single card. oldValue is null so storedMedia returns none: file renderer says Media removed with the label Media.',
    id: 'ASC-11c',
  },
  {
    action: '/ascents/{id}/edit -> Photos & videos -> + Add tile -> pick an image (no submit needed)',
    activities: [
      activityAgo(5, {
        entityId: 'f-asc-6',
        entityType: 'file',
        parentEntityId: '9001',
        parentEntityType: 'ascent',
        type: 'uploaded',
        userFk: ME,
      }),
    ],
    domain: 'ascent',
    entities: worldWith([[{ id: 'f-asc-6', type: 'file' }, fileEntity('Rampe', [photo('asc-6')])]]),
    expected:
      'upload kind keyed on the ascent, one row so it renders single. The headline borrows the ascent name (a file id is a cuid) and media reads photo off the hydrated file. No change line.',
    id: 'ASC-12a',
  },
  {
    action: '/ascents/{id}/edit -> Photos & videos -> + Add tile -> pick an .mp4 (TUS straight to Bunny)',
    activities: [
      activityAgo(5, {
        entityId: 'f-asc-7',
        entityType: 'file',
        parentEntityId: '9001',
        parentEntityType: 'ascent',
        type: 'uploaded',
        userFk: ME,
      }),
    ],
    domain: 'ascent',
    entities: worldWith([[{ id: 'f-asc-7', type: 'file' }, fileEntity('Rampe', [video('asc-7')])]]),
    expected:
      'Identical row shape to ASC-12a, upload kind, single card. Only the hydrated bunnyStreamFk makes the sentence say video. No change line.',
    id: 'ASC-12b',
  },
  {
    action: '/ascents/{id}/edit -> Photos & videos -> + Add tile -> pick a photo and a video in one submit',
    activities: [
      activityAgo(4, {
        entityId: 'f-asc-8',
        entityType: 'file',
        parentEntityId: '9001',
        parentEntityType: 'ascent',
        type: 'uploaded',
        userFk: ME,
      }),
      activityAgo(5, {
        entityId: 'f-asc-9',
        entityType: 'file',
        parentEntityId: '9001',
        parentEntityType: 'ascent',
        type: 'uploaded',
        userFk: ME,
      }),
    ],
    domain: 'ascent',
    entities: worldWith([
      [{ id: 'f-asc-8', type: 'file' }, fileEntity('Rampe', [photo('asc-8')])],
      [{ id: 'f-asc-9', type: 'file' }, fileEntity('Rampe', [video('asc-9')])],
    ]),
    expected:
      'One upload card of 2. The two kinds disagree so media falls to none and the headline reads "added media", with a "2 files" summary. No change lines.',
    id: 'ASC-12c',
  },
  {
    action: '/ascents/{id}/edit -> Photos & videos -> remove the tile before it finalizes, or close the tab mid-upload',
    activities: [],
    domain: 'ascent',
    expected: 'No card. The upload row is written by finalize, which never runs.',
    id: 'ASC-12d',
  },
  {
    action: '/ascents/{id}/edit -> Photos & videos -> a failed finalize retried via the toast Retry',
    activities: [
      activityAgo(5, {
        entityId: 'f-asc-10',
        entityType: 'file',
        parentEntityId: '9001',
        parentEntityType: 'ascent',
        type: 'uploaded',
        userFk: ME,
      }),
    ],
    domain: 'ascent',
    entities: worldWith([[{ id: 'f-asc-10', type: 'file' }, fileEntity('Rampe', [photo('asc-10')])]]),
    expected:
      'Exactly one row, so one single upload card: the finalize promise is deduped and a done upload short-circuits. No change line.',
    id: 'ASC-12e',
  },

  // ==== FILE ====
  {
    action:
      '/routes/{id} -> Photos & videos -> Add tile -> sheet Add photos or videos -> Upload photos -> pick 1 JPG (no submit step)',
    activities: [
      activityAgo(5, {
        entityId: 'f-01a',
        entityType: 'file',
        parentEntityId: '500',
        parentEntityType: 'route',
        type: 'uploaded',
        userFk: ME,
      }),
    ],
    domain: 'file',
    entities: worldWith([[{ id: 'f-01a', type: 'file' }, fileEntity('Kante direkt', [photo('01a')])]]),
    expected:
      'upload kind with one member, so a single card: "You added a photo to Kante direkt". The headline borrows the parent route name (names: parent), the photo fills the media strip, no change line.',
    id: 'FILE-01a',
  },
  {
    action: '/blocks/{id}/routes/add -> fill Route name -> drop photos on Photos & videos -> Add',
    activities: [
      activityAgo(5, {
        entityId: 'f-01b-0',
        entityType: 'file',
        parentEntityId: '500',
        parentEntityType: 'route',
        type: 'uploaded',
        userFk: ME,
      }),
      activityAgo(6, {
        entityId: 'f-01b-1',
        entityType: 'file',
        parentEntityId: '500',
        parentEntityType: 'route',
        type: 'uploaded',
        userFk: ME,
      }),
      activityAgo(7, {
        entityId: '500',
        entityType: 'route',
        newValue: 'Kante direkt',
        parentEntityId: '400',
        parentEntityType: 'block',
        type: 'created',
        userFk: ME,
      }),
    ],
    domain: 'file',
    entities: worldWith([
      [{ id: 'f-01b-0', type: 'file' }, fileEntity('Kante direkt', [photo('01b-0')])],
      [{ id: 'f-01b-1', type: 'file' }, fileEntity('Kante direkt', [photo('01b-1')])],
    ]),
    expected:
      'Two cards even though one submit wrote all three rows: an upload card of 2 for the files (finalized after createRoute returns) and a separate burst card for the route create. Different key prefixes, so they never merge. No change line on either.',
    id: 'FILE-01b',
  },
  {
    action: '/routes/{id}/ascents/add -> drop photos on Photos & videos -> Save',
    activities: [
      activityAgo(5, {
        entityId: 'f-01c',
        entityType: 'file',
        parentEntityId: '9001',
        parentEntityType: 'ascent',
        type: 'uploaded',
        userFk: ME,
      }),
    ],
    domain: 'file',
    entities: worldWith([[{ id: 'f-01c', type: 'file' }, fileEntity('Rampe', [photo('01c')])]]),
    expected:
      'upload kind, single card. The parent is the ascent, so the headline reads "You added a photo to your ascent of Rampe" (owner=self off the hydrated ascent). No change line.',
    id: 'FILE-01c',
  },
  {
    action: '/ascents/{id}/edit -> + Add -> pick a photo (finalizes on pick, no Save needed)',
    activities: [
      activityAgo(5, {
        entityId: 'f-01d',
        entityType: 'file',
        parentEntityId: '9001',
        parentEntityType: 'ascent',
        type: 'uploaded',
        userFk: ME,
      }),
    ],
    domain: 'file',
    entities: worldWith([[{ id: 'f-01d', type: 'file' }, fileEntity('Rampe', [photo('01d')])]]),
    expected:
      'Same shape as FILE-01c, written on pick rather than on submit: upload kind, single card, ascent parent, no change line.',
    id: 'FILE-01d',
  },
  {
    action: '/blocks/{id}/topos/edit -> Add photo -> pick an image',
    activities: [],
    domain: 'file',
    expected:
      'No file card at all. insertUploadActivity returns undefined for a block target, because the block:updated:topo row (TOPO-01a) says strictly more than "added a photo".',
    id: 'FILE-01e',
  },
  {
    action: 'Any area-targeted upload (finalizeImage accepts entityType area, no component passes it)',
    activities: [],
    domain: 'file',
    expected:
      'Unreachable from the UI, so nothing renders. Listed to keep the area branch of insertUploadActivity visibly untested rather than silently assumed.',
    id: 'FILE-01f',
  },
  {
    action: '/routes/{id} -> Add tile -> Upload photos -> pick 1 HEIC/HEIF',
    activities: [
      activityAgo(5, {
        entityId: 'f-01g',
        entityType: 'file',
        parentEntityId: '500',
        parentEntityType: 'route',
        type: 'uploaded',
        userFk: ME,
      }),
    ],
    domain: 'file',
    entities: worldWith([[{ id: 'f-01g', type: 'file' }, fileEntity('Kante direkt', [photo('01g')])]]),
    expected:
      'Identical to FILE-01a: upload kind, single card, "photo" read off the hydrated file. The server side conversion to JPEG and the .orig.heic sibling change nothing about the row or the card.',
    id: 'FILE-01g',
  },
  {
    action: '/routes/{id} -> Add tile -> Upload photos -> multi-select 5 JPGs (cap is 10 per pick)',
    activities: [
      activityAgo(5, {
        entityId: 'f-01h-0',
        entityType: 'file',
        parentEntityId: '500',
        parentEntityType: 'route',
        type: 'uploaded',
        userFk: ME,
      }),
      activityAgo(6, {
        entityId: 'f-01h-1',
        entityType: 'file',
        parentEntityId: '500',
        parentEntityType: 'route',
        type: 'uploaded',
        userFk: ME,
      }),
      activityAgo(7, {
        entityId: 'f-01h-2',
        entityType: 'file',
        parentEntityId: '500',
        parentEntityType: 'route',
        type: 'uploaded',
        userFk: ME,
      }),
      activityAgo(8, {
        entityId: 'f-01h-3',
        entityType: 'file',
        parentEntityId: '500',
        parentEntityType: 'route',
        type: 'uploaded',
        userFk: ME,
      }),
      activityAgo(9, {
        entityId: 'f-01h-4',
        entityType: 'file',
        parentEntityId: '500',
        parentEntityType: 'route',
        type: 'uploaded',
        userFk: ME,
      }),
    ],
    domain: 'file',
    entities: worldWith([
      [{ id: 'f-01h-0', type: 'file' }, fileEntity('Kante direkt', [photo('01h-0')])],
      [{ id: 'f-01h-1', type: 'file' }, fileEntity('Kante direkt', [photo('01h-1')])],
      [{ id: 'f-01h-2', type: 'file' }, fileEntity('Kante direkt', [photo('01h-2')])],
      [{ id: 'f-01h-3', type: 'file' }, fileEntity('Kante direkt', [photo('01h-3')])],
      [{ id: 'f-01h-4', type: 'file' }, fileEntity('Kante direkt', [photo('01h-4')])],
    ]),
    expected:
      'One upload card of 5, keyed on the shared parent, summary "5 photos". Five rows, five media tiles, still one headline naming Kante direkt. No change lines.',
    id: 'FILE-01h',
  },
  {
    action: '/routes/{id} -> Add tile -> pick a photo -> cancel the tile (X) before it finalizes',
    activities: [],
    domain: 'file',
    expected: 'No card. Nothing is written until finalize, and the staged object is swept after 24h.',
    id: 'FILE-01i',
  },
  {
    action: '/routes/{id} -> Add tile -> pick a photo, finalize fails -> toast Retry',
    activities: [
      activityAgo(5, {
        entityId: 'f-01j-retry',
        entityType: 'file',
        parentEntityId: '500',
        parentEntityType: 'route',
        type: 'uploaded',
        userFk: ME,
      }),
    ],
    domain: 'file',
    expected:
      'Exactly one upload card. The retry finalizes under a fresh file cuid, so the failed attempt leaves no row and there is nothing to deduplicate. No change line.',
    id: 'FILE-01j',
  },
  {
    action: '/routes/{id}/ascents/add -> drag an .mp4 onto the plain drop zone -> fill the form -> Save',
    activities: [
      activityAgo(5, {
        entityId: 'f-02a',
        entityType: 'file',
        parentEntityId: '9001',
        parentEntityType: 'ascent',
        type: 'uploaded',
        userFk: ME,
      }),
    ],
    domain: 'file',
    entities: worldWith([[{ id: 'f-02a', type: 'file' }, fileEntity('Rampe', [video('02a')])]]),
    expected:
      'upload kind, single card. The word "video" comes off the hydrated file bunnyStreamFk, not off the row, so it reads "You added a video to your ascent of Rampe". bunnyStreams.source stays null (the ascent picker never asks). No change line.',
    id: 'FILE-02a',
  },
  {
    action: '/routes/{id} -> Add -> Upload a video -> Choose a video -> leave Source empty -> Add video',
    activities: [
      activityAgo(5, {
        entityId: 'f-02b',
        entityType: 'file',
        parentEntityId: '500',
        parentEntityType: 'route',
        type: 'uploaded',
        userFk: ME,
      }),
    ],
    domain: 'file',
    entities: worldWith([[{ id: 'f-02b', type: 'file' }, fileEntity('Kante direkt', [video('02b')])]]),
    expected:
      'upload kind, single card, "You added a video to Kante direkt". No source stored and no source row, so no change line.',
    id: 'FILE-02b',
  },
  {
    action: 'Same as FILE-02b, typing a valid URL into Source before Add video',
    activities: [
      activityAgo(5, {
        entityId: 'f-02c',
        entityType: 'file',
        parentEntityId: '500',
        parentEntityType: 'route',
        type: 'uploaded',
        userFk: ME,
      }),
    ],
    domain: 'file',
    entities: worldWith([
      [{ id: 'f-02c', type: 'file' }, fileEntity('Kante direkt', [video('02c', 'https://vimeo.com/912345')])],
    ]),
    expected:
      'Byte-identical card to FILE-02b. The credit lands on bunny_streams.source silently, and no file:updated:source row is written at upload time, so the feed never shows where the clip came from.',
    id: 'FILE-02c',
  },
  {
    action: 'Same as FILE-02b with an invalid Source (no dot in the hostname)',
    activities: [],
    domain: 'file',
    expected: 'No card. The Add video button stays disabled, so nothing uploads and nothing is written.',
    id: 'FILE-02d',
  },
  {
    action: 'Post a forged or foreign Bunny GUID to the finalize endpoint',
    activities: [],
    domain: 'file',
    expected: 'No card. verifyUpload 403s before any DB write, so the feed cannot be seeded with a foreign stream.',
    id: 'FILE-02e',
  },
  {
    action:
      '/routes/{id} -> tap a video thumb -> ?media={fileId} viewer -> chain icon (Edit source) -> type a URL -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'source',
        entityId: 'f-03a',
        entityType: 'file',
        newValue: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        parentEntityId: '501',
        parentEntityType: 'route',
        userFk: ME,
      }),
    ],
    domain: 'file',
    entities: worldWith([
      [
        { id: 'f-03a', type: 'file' },
        fileEntity('Riss', [video('03a', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')]),
      ],
    ]),
    expected:
      'entity kind with one member, so a single card naming the parent route Riss. source renderer: italic "Not set" to a host chip reading www.youtube.com, with the full URL kept in storage.',
    id: 'FILE-03a',
  },
  {
    action: 'Same viewer, replace the existing Source URL with another one -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'source',
        entityId: 'f-03b',
        entityType: 'file',
        newValue: 'https://vimeo.com/912345',
        oldValue: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        parentEntityId: '501',
        parentEntityType: 'route',
        userFk: ME,
      }),
    ],
    domain: 'file',
    entities: worldWith([
      [{ id: 'f-03b', type: 'file' }, fileEntity('Riss', [video('03b', 'https://vimeo.com/912345')])],
    ]),
    expected:
      'entity kind, single card. source renderer: two host chips (www.youtube.com to vimeo.com), the full URLs stay stored and unshown.',
    id: 'FILE-03b',
  },
  {
    action: 'Same viewer, clear the Source field entirely -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'source',
        entityId: 'f-03c',
        entityType: 'file',
        oldValue: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        parentEntityId: '501',
        parentEntityType: 'route',
        userFk: ME,
      }),
    ],
    domain: 'file',
    entities: worldWith([[{ id: 'f-03c', type: 'file' }, fileEntity('Riss', [video('03c')])]]),
    expected:
      'entity kind, single card, still the "updated the source" sentence: there is no separate removal verb. source renderer: host chip to "Not set".',
    id: 'FILE-03c',
  },
  {
    action: 'Same viewer, Save with the Source text unchanged',
    activities: [],
    domain: 'file',
    expected: 'No card. The UPDATE still runs, but the diff finds no change, so no row is written.',
    id: 'FILE-03d',
  },
  {
    action: 'FILE-03b, then edit the Source a second time within 15 min',
    activities: [
      activityAgo(5, {
        columnName: 'source',
        entityId: 'f-03e',
        entityType: 'file',
        newValue: 'https://www.instagram.com/p/abc123/',
        oldValue: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        parentEntityId: '501',
        parentEntityType: 'route',
        userFk: ME,
      }),
    ],
    domain: 'file',
    entities: worldWith([
      [{ id: 'f-03e', type: 'file' }, fileEntity('Riss', [video('03e', 'https://www.instagram.com/p/abc123/')])],
    ]),
    expected:
      'One folded row, A to C, so one entity card. The intermediate vimeo.com is erased from history and the source renderer shows www.youtube.com to www.instagram.com.',
    id: 'FILE-03e',
  },
  {
    action: 'FILE-03b, then within 15 min set the Source back to the original URL',
    activities: [],
    domain: 'file',
    expected:
      'No card at all. createUpdateActivity deletes the row it folded back to its starting value, so a credit fixed and unfixed leaves no trace.',
    id: 'FILE-03f',
  },
  {
    action: 'Open the viewer on a legacy clip whose stored source is free text rather than a URL',
    activities: [
      activityAgo(5, {
        columnName: 'source',
        entityId: 'f-03g',
        entityType: 'file',
        newValue: 'filmed by the local club',
        parentEntityId: '501',
        parentEntityType: 'route',
        userFk: ME,
      }),
    ],
    domain: 'file',
    entities: worldWith([
      [{ id: 'f-03g', type: 'file' }, fileEntity('Riss', [video('03g', 'filmed by the local club')])],
    ]),
    expected:
      'entity kind, single card. sourceHost returns undefined for an unparseable value, so the source renderer chips the raw stored string verbatim instead of a host.',
    id: 'FILE-03g',
  },
  {
    action: 'FILE-02b then FILE-03a on the same clip, immediately after the upload',
    activities: [
      activityAgo(5, {
        columnName: 'source',
        entityId: 'f-03h',
        entityType: 'file',
        newValue: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        parentEntityId: '501',
        parentEntityType: 'route',
        userFk: ME,
      }),
      activityAgo(8, {
        entityId: 'f-03h',
        entityType: 'file',
        parentEntityId: '501',
        parentEntityType: 'route',
        type: 'uploaded',
        userFk: ME,
      }),
    ],
    domain: 'file',
    entities: worldWith([
      [
        { id: 'f-03h', type: 'file' },
        fileEntity('Riss', [video('03h', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')]),
      ],
    ]),
    expected:
      'One card. A source pasted with the upload says nothing the upload row does not, so it is dropped rather than given a card of its own, which matches setting the source during the upload (FILE-02c) writing only one row. A source corrected later still gets its own card.',
    id: 'FILE-03h',
  },
  {
    action: 'Open an ascent clip in the media viewer and look for the Edit source (chain) button',
    activities: [],
    domain: 'file',
    expected:
      'Unreachable, so no card. The button is gated on ascentCreatedBy == null, so a clip that belongs to an ascent can never get a source row.',
    id: 'FILE-03i',
  },
  {
    action: 'Call the Edit source mutation against an image rather than a video',
    activities: [],
    domain: 'file',
    expected: 'No card. The server answers error(400) "Only videos carry a source" before any write.',
    id: 'FILE-03j',
  },

  // ==== TOPO ====
  {
    action: '/blocks/{id} -> More -> Manage -> Edit topos -> Add photo (or the dashed + ADD tile) -> pick 1 image',
    activities: [
      activityAgo(5, {
        columnName: 'topo',
        entityId: '400',
        entityType: 'block',
        metadata: topoMetadata('photoAdded', 700),
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'topo',
    expected: 'single card. topo renderer draws the photo with its current lines, caption "Photo added".',
    id: 'TOPO-01a',
    topos: topos(),
  },
  {
    action: 'Same topo editor Add photo, multi-select 4 images',
    activities: [700, 701, 702, 703].map((topoId, index) =>
      activityAgo(5 + index * 3, {
        columnName: 'topo',
        entityId: '400',
        entityType: 'block',
        metadata: topoMetadata('photoAdded', topoId),
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ),
    domain: 'topo',
    expected:
      'One burst card, "4 edits". All four rows are the same kind of change and point at the one block, so the headline reads like TOPO-01a and names Nordblock rather than the area it hangs under. Four rows with different topoIds collapse into nothing, so the expanded half draws four topo lines.',
    id: 'TOPO-01b',
    topos: new Map([...topos(700), ...topos(701), ...topos(702), ...topos(703)]),
  },
  {
    action: 'Add photo in the topo editor, pick an oversized file or a video',
    activities: [],
    domain: 'topo',
    expected: 'No card. imageRejection() toasts "{filename}: {reason}" client-side and no row is written.',
    id: 'TOPO-01c',
  },
  {
    action: 'Add photo with 4 images, one upload fails mid-batch',
    activities: [700, 701, 702].map((topoId, index) =>
      activityAgo(5 + index * 3, {
        columnName: 'topo',
        entityId: '400',
        entityType: 'block',
        metadata: topoMetadata('photoAdded', topoId),
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ),
    domain: 'topo',
    expected: 'One burst card, "3 edits". Only the failed file writes nothing, so three topo lines render.',
    id: 'TOPO-01d',
    topos: new Map([...topos(700), ...topos(701), ...topos(702)]),
  },
  {
    action: 'Topo editor -> Delete photo, then Add photo with an identical image',
    activities: [
      activityAgo(5, {
        columnName: 'topo',
        entityId: '400',
        entityType: 'block',
        metadata: topoMetadata('photoAdded', 704),
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'topo',
    expected:
      'single card. The stale photoAdded row points at a topos id nothing resolves, so the topo renderer shows the caption "Photo added" alone, no image.',
    id: 'TOPO-01e',
    topos: topos(),
  },
  {
    action: 'Topo editor -> tap a thumbnail -> its More button -> Delete photo -> accept the native confirm()',
    activities: [
      activityAgo(5, {
        columnName: 'topo',
        entityId: '400',
        entityType: 'block',
        metadata: topoMetadata('photoRemoved', 701),
        parentEntityId: '300',
        parentEntityType: 'area',
        type: 'deleted',
        userFk: ME,
      }),
    ],
    domain: 'topo',
    expected:
      'single card, and a burst rather than a removal (the delete carries a columnName). topo renderer, caption "Photo removed" and deliberately no image, since the topos row is gone.',
    id: 'TOPO-02a',
    topos: topos(),
  },
  {
    action: 'Topo editor -> Delete photo -> cancel the native confirm()',
    activities: [],
    domain: 'topo',
    expected: 'No card. The confirm() guard returns before any mutation runs.',
    id: 'TOPO-02b',
  },
  {
    action: 'Topo editor -> Delete photo on two thumbnails in a row',
    activities: [701, 702].map((topoId, index) =>
      activityAgo(5 + index * 4, {
        columnName: 'topo',
        entityId: '400',
        entityType: 'block',
        metadata: topoMetadata('photoRemoved', topoId),
        parentEntityId: '300',
        parentEntityType: 'area',
        type: 'deleted',
        userFk: ME,
      }),
    ),
    domain: 'topo',
    expected:
      'One burst card, "2 edits". Different topoIds keep the rows apart, so the topo renderer draws two caption-only lines.',
    id: 'TOPO-02c',
    topos: topos(),
  },
  {
    action: 'Topo editor -> select a photo -> More -> Replace photo -> pick 1 image (single-select is forced)',
    activities: [
      activityAgo(5, {
        columnName: 'topo',
        entityId: '400',
        entityType: 'block',
        metadata: topoMetadata('photoReplaced', 700),
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'topo',
    expected: 'single card. topo renderer draws the new photo, caption "Photo replaced".',
    id: 'TOPO-03a',
    topos: topos(),
  },
  {
    action: 'Replace photo twice on the same photo, any interval',
    activities: [
      activityAgo(5, {
        columnName: 'topo',
        entityId: '400',
        entityType: 'block',
        metadata: topoMetadata('photoReplaced', 700),
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'topo',
    expected:
      'single card. The value tuple is identical both times, so insertActivity collapses it to one row. This is the one topo action where a repeat genuinely collapses.',
    id: 'TOPO-03b',
    topos: topos(),
  },
  {
    action: 'Add photo, then Replace photo on that same photo',
    activities: [
      activityAgo(5, {
        columnName: 'topo',
        entityId: '400',
        entityType: 'block',
        metadata: topoMetadata('photoReplaced', 700),
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
      activityAgo(9, {
        columnName: 'topo',
        entityId: '400',
        entityType: 'block',
        metadata: topoMetadata('photoAdded', 700),
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'topo',
    expected:
      'One burst card, "2 edits". The action differs inside the metadata, so nothing collapses and the topo renderer draws two lines.',
    id: 'TOPO-03c',
    topos: topos(),
  },
  {
    action:
      'Topo editor with 2+ photos -> tap a thumbnail -> press its grip (Drag to reorder) -> drag past 8px onto another slot -> release',
    activities: [
      activityAgo(5, {
        columnName: 'topo',
        entityId: '400',
        entityType: 'block',
        metadata: topoMetadata('reordered'),
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'topo',
    expected:
      'single card. topo renderer, caption "Photos reordered" and never an image, since the metadata carries no topoId to resolve.',
    id: 'TOPO-04a',
    topos: topos(),
  },
  {
    action: 'Reorder the thumbnails repeatedly, any interval',
    activities: [
      activityAgo(5, {
        columnName: 'topo',
        entityId: '400',
        entityType: 'block',
        metadata: topoMetadata('reordered'),
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'topo',
    expected:
      'single card, forever, per user per block. Every reorder row is value-identical, so the collapse keeps only the newest with createdAt bumped.',
    id: 'TOPO-04b',
    topos: topos(),
  },
  {
    action:
      'Drag a thumbnail and drop it on the same index, or release under the 8px threshold, or outside any thumbnail',
    activities: [],
    domain: 'topo',
    expected: 'No card. The drag never becomes a reorder mutation.',
    id: 'TOPO-04c',
  },
  {
    action: 'Reorder from a stale client snapshot whose ids all get filtered out server-side',
    activities: [
      activityAgo(5, {
        columnName: 'topo',
        entityId: '400',
        entityType: 'block',
        metadata: topoMetadata('reordered'),
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'topo',
    expected:
      'single card even though the persisted order did not change: the row is written unconditionally. topo renderer, caption "Photos reordered".',
    id: 'TOPO-04d',
    topos: topos(),
  },
  {
    action:
      'Topo editor -> select a photo -> Routes -> Add route to this photo -> pick a route -> place Start / Middle / Top -> Done -> HUD Save',
    activities: [
      activityAgo(5, {
        columnName: 'topo',
        entityId: '400',
        entityType: 'block',
        metadata: topoMetadata('lines', 700),
        newValue: topoLines([{ name: 'Kante direkt', routeFk: 501 }]),
        oldValue: '',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'topo',
    expected:
      'single card. topo renderer draws the photo with the new line solid and a green chip "Drew Kante direkt", no ghosts.',
    id: 'TOPO-05a',
    topos: topos(),
  },
  {
    action: 'Topo editor -> select a line -> drag its points -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'topo',
        entityId: '400',
        entityType: 'block',
        metadata: topoMetadata('lines', 700),
        newValue: topoLines([{ name: 'Kante direkt', routeFk: 501 }], true),
        oldValue: topoLines([{ name: 'Kante direkt', routeFk: 501 }]),
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'topo',
    expected:
      'single card. Same routeFk with a different path, so the topo renderer draws the new geometry solid over the old dashed underneath, neutral chip "Redrew Kante direkt".',
    id: 'TOPO-05b',
    topos: topos(),
  },
  {
    action: 'Topo editor -> select a line -> toggle Finish hold / Top out without moving a point -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'topo',
        entityId: '400',
        entityType: 'block',
        metadata: topoMetadata('lines', 700),
        newValue: '501:topout:M0.2,0.9 L0.3,0.2:Kante%20direkt',
        oldValue: topoLines([{ name: 'Kante direkt', routeFk: 501 }]),
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'topo',
    expected:
      'single card. Only the encoded topType differs, so the topo renderer says "Redrew Kante direkt" with the ghost sitting exactly under the solid line.',
    id: 'TOPO-05c',
    topos: topos(),
  },
  {
    action: 'Topo editor -> select a line -> Remove line -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'topo',
        entityId: '400',
        entityType: 'block',
        metadata: topoMetadata('lines', 700),
        newValue: topoLines([{ name: 'Kante direkt', routeFk: 501 }]),
        oldValue: topoLines([
          { name: 'Kante direkt', routeFk: 501 },
          { name: 'Rampe', routeFk: 502 },
        ]),
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'topo',
    expected:
      'single card. The routeFk drops out of newValue, so the topo renderer shows a red chip "Erased Rampe" plus a dashed ghost of it.',
    id: 'TOPO-05d',
    topos: topos(),
  },
  {
    action: 'Topo editor -> Remove line on the last remaining line -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'topo',
        entityId: '400',
        entityType: 'block',
        metadata: topoMetadata('lines', 700),
        newValue: '',
        oldValue: topoLines([
          { name: 'Kante direkt', routeFk: 501 },
          { name: 'Rampe', routeFk: 502 },
        ]),
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'topo',
    expected:
      'single card. newValue is the empty string rather than null, so the topo renderer turns every before-line into an "Erased" chip.',
    id: 'TOPO-05e',
    topos: topos(),
  },
  {
    action: 'Topo editor -> HUD Save with no geometry or topType change',
    activities: [],
    domain: 'topo',
    expected: 'No card. The encoder sorts by routeFk, so an unsorted set cannot read as a change.',
    id: 'TOPO-05f',
  },
  {
    action: 'Draw a line and Save, then redraw and Save again on the same photo within 15 min',
    activities: [
      activityAgo(5, {
        columnName: 'topo',
        entityId: '400',
        entityType: 'block',
        metadata: topoMetadata('lines', 700),
        newValue: topoLines([
          { name: 'Kante direkt', routeFk: 501 },
          { name: 'Rampe', routeFk: 502 },
        ]),
        oldValue: '',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'topo',
    expected:
      'One folded row, so a single card. Draw, save, redraw, save reads as one change from the photo starting state.',
    id: 'TOPO-05g',
    topos: topos(),
  },
  {
    action: 'Draw a line and Save, then within 15 min put the lines back exactly as they started and Save',
    activities: [],
    domain: 'topo',
    expected:
      'No card at all. newValue equals oldValue, so createUpdateActivity deletes the row (serializePoints rounds to 5 decimals, so the strings match byte for byte).',
    id: 'TOPO-05h',
  },
  {
    action: 'Topo editor -> edit lines on 2 photos -> one HUD Save press',
    activities: [700, 701].map((topoId, index) =>
      activityAgo(5 + index * 4, {
        columnName: 'topo',
        entityId: '400',
        entityType: 'block',
        metadata: topoMetadata('lines', topoId),
        newValue: topoLines([{ name: 'Kante direkt', routeFk: 501 }]),
        oldValue: '',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ),
    domain: 'topo',
    expected:
      'One burst card, "2 edits". The topoId in metadata keeps the fold apart, so the topo renderer draws two lines, each on its own photo.',
    id: 'TOPO-05i',
    topos: new Map([...topos(700), ...topos(701)]),
  },
  {
    action: 'Create a block (/areas/{id}/blocks/add), then draw lines and Save within 15 min',
    activities: [],
    domain: 'topo',
    expected: 'No topo row at all. The block:created row inside 15 minutes absorbs it, so only the create card exists.',
    id: 'TOPO-05j',
  },
  {
    action: 'Topo editor -> Routes -> Quick line for a route with no name -> place points -> Done -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'topo',
        entityId: '400',
        entityType: 'block',
        metadata: topoMetadata('lines', 700),
        newValue: topoLines([{ name: '', routeFk: 503 }]),
        oldValue: '',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'topo',
    expected:
      'single card. The name encodes as the empty string, so the topo renderer chip reads the `common_unnamed` placeholder.',
    id: 'TOPO-05k',
    topos: topos(),
  },
  {
    action: 'Save lines, soft-delete one of those routes, then Save the topo again',
    activities: [
      activityAgo(5, {
        columnName: 'topo',
        entityId: '400',
        entityType: 'block',
        metadata: topoMetadata('lines', 700),
        newValue: topoLines([{ name: 'Kante direkt', routeFk: 501 }], true),
        oldValue: topoLines([{ name: 'Kante direkt', routeFk: 501 }]),
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'topo',
    expected:
      'single card. The after side is read from the rows the call leaves behind rather than the payload, so the topo renderer shows only "Redrew Kante direkt" and no phantom "Erased" chip.',
    id: 'TOPO-05l',
    topos: topos(),
  },
  {
    action: 'Open the feed on a legacy topo row whose metadata is NULL (2 exist in the dev DB)',
    activities: [
      activityAgo(5, {
        columnName: 'topo',
        entityId: '400',
        entityType: 'block',
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'topo',
    expected:
      'single card. Nothing parses out of the metadata, so the topo renderer takes its vaguest arm: one muted line "Topo redrawn", no image, no chips.',
    id: 'TOPO-05m',
    topos: topos(),
  },
  {
    action: 'Open the feed on a lines row whose diff resolves to nothing added, redrawn or removed',
    activities: [
      activityAgo(5, {
        columnName: 'topo',
        entityId: '400',
        entityType: 'block',
        metadata: topoMetadata('lines', 700),
        newValue: topoLines([{ name: 'Kante direkt', routeFk: 501 }]),
        oldValue: topoLines([{ name: 'Kante direkt', routeFk: 501 }]),
        parentEntityId: '300',
        parentEntityType: 'area',
        userFk: ME,
      }),
    ],
    domain: 'topo',
    expected:
      'single card. The topo renderer draws the photo and falls back to the caption "Lines updated" with no chips.',
    id: 'TOPO-05n',
    topos: topos(),
  },
  {
    action: 'Topo editor -> draw a line referencing a route that is not on the block, or is not live -> Save',
    activities: [],
    domain: 'topo',
    expected: 'No card. The save fails with 400 "Route is not on this block" before any row is written.',
    id: 'TOPO-05o',
  },
  {
    action: 'Open a legacy pixel-space topo (banner "This topo uses legacy coordinates and can\'t be edited yet.")',
    activities: [],
    domain: 'topo',
    expected: 'No card. Saving is impossible, so no topo row can be written from that editor.',
    id: 'TOPO-05p',
  },

  // ==== REGION AND USER ====
  {
    action:
      '/settings -> Regions -> the region row -> /settings/regions/{id} -> Invite someone -> Email address -> Invite',
    activities: [
      activityAgo(5, {
        columnName: 'invitation',
        entityId: '1',
        entityType: 'user',
        newValue: 'lea.hofer@example.com',
        type: 'created',
        userFk: ME,
      }),
    ],
    domain: 'region',
    expected:
      'single card, "You invited lea.hofer@example.com". No change line: the entry declares no field, and names: stored keeps hydration off the inviter.',
    id: 'REG-01a',
  },
  {
    action: '/settings/regions/{id} -> Invite someone -> the same address that already has a live invitation -> Invite',
    activities: [
      activityAgo(5, {
        columnName: 'invitation',
        entityId: '1',
        entityType: 'user',
        newValue: 'lea.hofer@example.com',
        type: 'created',
        userFk: ME,
      }),
    ],
    domain: 'region',
    expected:
      'Still one single card, not two: insertActivity deleted the earlier byte-identical row, so the existing card just jumps to now. No change line.',
    id: 'REG-01b',
  },
  {
    action: '/settings/regions/{id} -> Invite someone with members plus live invitations at maxMembers',
    activities: [],
    domain: 'region',
    expected: 'No card at all. The button is disabled and the server 409s with region_seatsFull, so no row is written.',
    id: 'REG-01c',
  },
  {
    action: '/settings/regions/{id} -> Invite someone -> an address that is already an active member -> Invite',
    activities: [],
    domain: 'region',
    expected: 'No card at all. The request 409s before anything is inserted.',
    id: 'REG-01d',
  },
  {
    action: '/settings/regions/{id} -> Invite someone -> Invite, with the mail provider failing',
    activities: [
      activityAgo(5, {
        columnName: 'invitation',
        entityId: '1',
        entityType: 'user',
        newValue: 'lea.hofer@example.com',
        type: 'created',
        userFk: ME,
      }),
    ],
    domain: 'region',
    expected:
      'single card, identical to REG-01a: insertActivity runs before sendInvitationEmail, so the warning toast changes nothing in the feed. No change line.',
    id: 'REG-01e',
  },
  {
    action:
      '/settings/regions/{id} -> the pending invitation row -> Revoke invitation (Resend, above the rule, writes nothing)',
    activities: [
      activityAgo(5, {
        columnName: 'invitation',
        entityId: '1',
        entityType: 'user',
        newValue: 'lea.hofer@example.com',
        type: 'deleted',
        userFk: ME,
      }),
    ],
    domain: 'region',
    expected:
      'single card, "You revoked the invitation for lea.hofer@example.com". No change line, and the address comes off the row itself (names: stored).',
    id: 'REG-02a',
  },
  {
    action:
      'Sofia invites the address, then Mara opens /settings/regions/{id} -> the invitation row -> Revoke invitation',
    activities: [
      activityAgo(5, {
        columnName: 'invitation',
        entityId: '5',
        entityType: 'user',
        newValue: 'lea.hofer@example.com',
        type: 'deleted',
        userFk: 5,
      }),
      activityAgo(8, {
        columnName: 'invitation',
        entityId: '3',
        entityType: 'user',
        newValue: 'lea.hofer@example.com',
        type: 'created',
        userFk: 3,
      }),
    ],
    domain: 'region',
    expected:
      'Two single cards that can never join: entityId is the actor on both, so the entity:user:{id} keys differ. No change lines.',
    id: 'REG-02b',
  },
  {
    action: 'Revoke invitation, then Undo on the "Invitation for {email} revoked" snackbar',
    activities: [],
    domain: 'region',
    expected:
      "No card. deleteActivity erases this admin's own deleted:invitation row for the address, so another admin's revoke of the same address survives. The created card survives untouched.",
    id: 'REG-03',
  },
  {
    action: "/settings/regions/{id} -> another member's row -> Role -> pick a different role",
    activities: [
      activityAgo(5, {
        columnName: 'role',
        entityId: '5',
        entityType: 'user',
        newValue: 'region_maintainer',
        oldValue: 'region_user',
        userFk: ME,
      }),
    ],
    domain: 'region',
    expected:
      'single card, "You changed Mara Lindqvist\'s role". role renderer, label Role, showing User -> Maintainer rather than the stored enum members.',
    id: 'REG-04a',
  },
  {
    action: '/settings/regions/{id} -> the same member -> Role -> a different role, twice within 15 min',
    activities: [
      activityAgo(5, {
        columnName: 'role',
        entityId: '5',
        entityType: 'user',
        newValue: 'region_admin',
        oldValue: 'region_user',
        userFk: ME,
      }),
    ],
    domain: 'region',
    expected:
      'One folded row, so one single card: user to maintainer to admin reads as User -> Admin. role renderer, the intermediate role is erased.',
    id: 'REG-04b',
  },
  {
    action: '/settings/regions/{id} -> a member -> Role -> a different role, then back to the original within 15 min',
    activities: [],
    domain: 'region',
    expected: 'No card at all. createUpdateActivity deletes the row it folded back to its starting value.',
    id: 'REG-04c',
  },
  {
    action: "Change the same member's role in region A, then in region B (/settings/regions/{other}) within 15 min",
    activities: [
      activityAgo(5, {
        columnName: 'role',
        entityId: '5',
        entityType: 'user',
        newValue: 'region_maintainer',
        oldValue: 'region_user',
        regionFk: 2,
        userFk: ME,
      }),
      activityAgo(8, {
        columnName: 'role',
        entityId: '5',
        entityType: 'user',
        newValue: 'region_admin',
        oldValue: 'region_user',
        regionFk: 1,
        userFk: ME,
      }),
    ],
    domain: 'region',
    expected:
      'Two single cards, one per region. The fold scopes on regionFk so the second region writes its own row instead of overwriting the first, and the group key does too so the two never share a card. role renderer on each.',
    id: 'REG-04d',
  },
  {
    action: '/settings/regions/{id} -> a member -> Role -> pick the role that member already holds',
    activities: [],
    domain: 'region',
    expected: 'No card. MemberRow guards option !== role so no request fires, and the diff would be empty anyway.',
    id: 'REG-04e',
  },
  {
    action: '/settings/regions/{id} -> the last remaining admin -> Role -> anything lower',
    activities: [],
    domain: 'region',
    expected: 'No card. The server 409s with region_lastAdmin before writing.',
    id: 'REG-04f',
  },
  {
    action: "/settings/regions/{id} -> a member's row -> below the rule -> Remove",
    activities: [
      activityAgo(5, { columnName: 'role', entityId: '5', entityType: 'user', type: 'deleted', userFk: ME }),
    ],
    domain: 'region',
    expected:
      'single card, "You removed Mara Lindqvist from the region". No change line, deliberately: the row stores no old/new pair, and the shared registry used to render "Role: maintainer to Not set".',
    id: 'REG-05a',
  },
  {
    action: '/settings/regions/{id} -> Remove on one member, then Remove on a second member within 30 min',
    activities: [
      activityAgo(5, { columnName: 'role', entityId: '5', entityType: 'user', type: 'deleted', userFk: ME }),
      activityAgo(11, { columnName: 'role', entityId: '3', entityType: 'user', type: 'deleted', userFk: ME }),
    ],
    domain: 'region',
    entities: worldWith([
      [
        { id: '3', type: 'user' },
        { href: '#', name: 'Sofia Brandt', row: 'user' },
      ],
    ]),
    expected:
      'Two single cards, never one "removed 2 people" card: the rows carry a columnName so kindOf skips removal, and the entity key is per member. No change lines.',
    id: 'REG-05b',
  },
  {
    action: 'Remove a member, then Undo on the "{name} removed" snackbar',
    activities: [],
    domain: 'region',
    expected:
      "No card. deleteActivity erases the deleted:role row this admin wrote for that member in that region only; a removal from another region, another admin's removal, and that person's own deleted:membership row all survive.",
    id: 'REG-06',
  },
  {
    action: '/settings/regions/{id} -> your own member row -> Leave region -> confirm the Leave region dialog',
    activities: [
      activityAgo(5, { columnName: 'membership', entityId: '5', entityType: 'user', type: 'deleted', userFk: 5 }),
    ],
    domain: 'region',
    expected:
      'single card, "Mara Lindqvist left the region". No change line and no tombstone name: the sentence names only the actor, who is also the subject.',
    id: 'REG-07a',
  },
  {
    action: '/settings/regions/{id} -> your own member row as the sole remaining admin',
    activities: [],
    domain: 'region',
    expected: 'No card. The Leave region row is not even rendered (self && canLeave), and the server 409s.',
    id: 'REG-07b',
  },
  {
    action: 'Leave region, then follow a fresh invite back in via /invite/accept?token={uuid} -> Join {region}',
    activities: [
      activityAgo(5, { columnName: 'invitation', entityId: '5', entityType: 'user', type: 'updated', userFk: 5 }),
      activityAgo(25, { columnName: 'membership', entityId: '5', entityType: 'user', type: 'deleted', userFk: 5 }),
    ],
    domain: 'region',
    expected:
      'One entity card mixing both events, since the two rows share entity:user:5 and fall inside 30 min. No change lines, and the leave row is permanent (no undo path erases it).',
    id: 'REG-07c',
  },
  {
    action:
      'Follow the emailed link to /invite/accept?token={uuid} -> Join {region}, or /settings -> Invitations -> Join',
    activities: [
      activityAgo(5, { columnName: 'invitation', entityId: '1', entityType: 'user', type: 'updated', userFk: ME }),
    ],
    domain: 'region',
    expected:
      'single card, "You joined the region". No change line, and the row carries no values, so the headline has no address to name.',
    id: 'REG-08a',
  },
  {
    action: 'Reopen the accept link, or double-tap Join, while already an active member',
    activities: [],
    domain: 'region',
    expected: 'No card. Both the membership insert and the activity are skipped.',
    id: 'REG-08b',
  },
  {
    action: 'Leave region, get re-invited, then Join {region} again',
    activities: [
      activityAgo(5, { columnName: 'invitation', entityId: '5', entityType: 'user', type: 'updated', userFk: 5 }),
      activityAgo(95, { columnName: 'membership', entityId: '5', entityType: 'user', type: 'deleted', userFk: 5 }),
    ],
    domain: 'region',
    expected:
      'Two single cards (the rows are more than 30 min apart). Only the most recent join survives, insertActivity deleted the byte-identical older one, so the "left the region" card now sits below the join it replaced. No change lines.',
    id: 'REG-08c',
  },
  {
    action: 'Join {region} from the accept link after the seats filled between invite and accept',
    activities: [],
    domain: 'region',
    expected: 'No card. The join 409s and the invitation stays live.',
    id: 'REG-08d',
  },
  {
    action:
      '/settings -> Account -> Username -> /settings/username -> type a new name -> Save, as a member of 3 regions',
    activities: [
      activityAgo(5, {
        columnName: 'username',
        entityId: '5',
        entityType: 'user',
        newValue: 'mara.l',
        oldValue: 'mara',
        regionFk: 1,
        userFk: 5,
      }),
      activityAgo(5, {
        columnName: 'username',
        entityId: '5',
        entityType: 'user',
        newValue: 'mara.l',
        oldValue: 'mara',
        regionFk: 2,
        userFk: 5,
      }),
      activityAgo(5, {
        columnName: 'username',
        entityId: '5',
        entityType: 'user',
        newValue: 'mara.l',
        oldValue: 'mara',
        regionFk: 18,
        userFk: 5,
      }),
    ],
    domain: 'user',
    expected:
      'Three single cards, one per region, since the group key now carries the region. A reader who shares two of those regions sees two cards that read identically, because nothing on a card says which region it belongs to yet. Worth deciding: this is the case that argues for a region label.',
    id: 'USER-01a',
  },
  {
    action: '/settings/username -> type a new name -> Save as a user with zero regions',
    activities: [],
    domain: 'user',
    expected:
      'No card. The row array is empty and insertActivity returns early, though the users row is still renamed.',
    id: 'USER-01b',
  },
  {
    action: '/settings/username -> change mara to Mara (case only) -> Save',
    activities: [
      activityAgo(5, {
        columnName: 'username',
        entityId: '5',
        entityType: 'user',
        newValue: 'Mara',
        oldValue: 'mara',
        userFk: 5,
      }),
    ],
    domain: 'user',
    expected:
      'single card: the equality guard is case-sensitive, so the row is written. text renderer with two chips differing only in case.',
    id: 'USER-01c',
  },
  {
    action: '/settings/username -> a name that collides with somebody in a shared region -> Save',
    activities: [],
    domain: 'user',
    expected: 'No card. invalid() rejects with a field issue before anything is written.',
    id: 'USER-01d',
  },
  {
    action: '/settings/username -> Save twice, mara to mara.l, then mara.l to lindqvist',
    activities: [
      activityAgo(5, {
        columnName: 'username',
        entityId: '5',
        entityType: 'user',
        newValue: 'lindqvist',
        oldValue: 'mara.l',
        userFk: 5,
      }),
      activityAgo(20, {
        columnName: 'username',
        entityId: '5',
        entityType: 'user',
        newValue: 'mara.l',
        oldValue: 'mara',
        userFk: 5,
      }),
    ],
    domain: 'user',
    expected:
      'One entity card with two text lines. This is insertActivity, so there is no 15-minute fold and the pair never collapses to mara -> lindqvist.',
    id: 'USER-01e',
  },
  {
    action: '/settings/username -> Save three times: mara to mara.l, back to mara, then to mara.l again',
    activities: [
      activityAgo(5, {
        columnName: 'username',
        entityId: '5',
        entityType: 'user',
        newValue: 'mara.l',
        oldValue: 'mara',
        userFk: 5,
      }),
      activityAgo(12, {
        columnName: 'username',
        entityId: '5',
        entityType: 'user',
        newValue: 'mara',
        oldValue: 'mara.l',
        userFk: 5,
      }),
    ],
    domain: 'user',
    expected:
      "One entity card with two text lines. The third write was byte-identical to the first, so insertActivity deleted the first: two rows survive (mara.l -> mara, then mara -> mara.l on top), and the older card's timestamp effectively moved to now.",
    id: 'USER-01f',
  },
]
