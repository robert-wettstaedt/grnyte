/**
 * Every card an action on an AREA can produce.
 *
 * The reference domain: read this one before writing another. Each case names the write site it
 * stands for, states the events that site emits, and claims what the card says. The claim is
 * derived by reading the code, so it is what is under review, never the oracle.
 */
import { stringifyCoords } from '$lib/map/coords'
import { stringifyDeletionScale } from '../verbs'
import type { EventCase } from './types'
import { areaEntity, change, eventAgo, ME, PIN } from './world'

export const AREA_CASES: EventCase[] = [
  {
    action: '/explore -> + -> New area in {Region} -> /areas/add -> name -> Create area',
    domain: 'area',
    events: [eventAgo(240, { actorFk: ME, objectId: 300, objectType: 'area', verb: 'create' })],
    expected: 'Single card, "You added the area Steinbruch". A create declares no field, so no change line.',
    id: 'AREA-01a',
    writer: 'areas.remote.ts:76',
  },
  {
    action: '/areas/300 -> More -> Add area -> name -> Create area',
    domain: 'area',
    events: [eventAgo(235, { actorFk: ME, objectId: 301, objectType: 'area', verb: 'create' })],
    expected:
      'Same sentence for a child area, "You added the area Westwand". The parent is the crumb on its row, not part of the headline.',
    id: 'AREA-01b',
    writer: 'areas.remote.ts:76',
  },
  {
    action: 'Somebody else does the same, seen from your feed',
    domain: 'area',
    events: [eventAgo(230, { actorFk: 3, objectId: 300, objectType: 'area', verb: 'create' })],
    expected: 'Third person, "Sofia Brandt added the area Steinbruch", with her avatar rather than "Me".',
    id: 'AREA-01c',
    writer: 'areas.remote.ts:76',
  },

  {
    action: '/areas/300/edit -> Name -> Save',
    domain: 'area',
    events: [
      eventAgo(200, {
        actorFk: ME,
        changes: [change({ columnName: 'name', newValue: 'Steinbruch', oldValue: 'Steinbruch Nord' })],
        objectId: 300,
        objectType: 'area',
      }),
    ],
    expected:
      'Single card, "You renamed Steinbruch", with one change line labelled Name: Steinbruch Nord to Steinbruch. The rename sentence names no entity type and carries the NEW name, so the old one exists only on the line.',
    id: 'AREA-02a',
    writer: 'areas.remote.ts:118',
  },
  {
    action: '/areas/300/edit -> Description -> Save',
    domain: 'area',
    events: [
      eventAgo(195, {
        actorFk: ME,
        changes: [
          change({
            columnName: 'description',
            newValue: 'Old quarry, shady until noon. Bring a brush.',
            oldValue: 'Old quarry, shady until noon.',
          }),
        ],
        objectId: 300,
        objectType: 'area',
      }),
    ],
    expected:
      'Single card, "You edited the description of Steinbruch". The change line is prose, so it collapses behind a Compare toggle rather than showing a before/after pair inline.',
    id: 'AREA-02b',
    writer: 'areas.remote.ts:118',
  },
  {
    action: '/areas/300/edit -> Name AND description -> Save (one call, two columns)',
    domain: 'area',
    events: [
      eventAgo(190, {
        actorFk: ME,
        changes: [
          change({ columnName: 'description', newValue: 'Shady until noon.', oldValue: 'Old quarry.' }),
          change({ columnName: 'name', newValue: 'Steinbruch', oldValue: 'Steinbruch Nord' }),
        ],
        objectId: 300,
        objectType: 'area',
      }),
    ],
    expected:
      'ONE card, not two: one event with two change rows. The headline drops to the shared "You edited Steinbruch" with a "2 edits" sub line, and both lines sit behind the toggle.',
    id: 'AREA-02c',
    writer: 'areas.remote.ts:118',
  },
  {
    action: 'Edit the name, then edit it again within the 15-minute fold window',
    domain: 'area',
    events: [
      eventAgo(180, {
        actorFk: ME,
        // The fold overwrites `new_value` on the open event's existing change row rather than
        // adding a second: the card shows where the name ended up, not the path it took.
        changes: [change({ columnName: 'name', newValue: 'Steinbruch Süd', oldValue: 'Steinbruch Nord' })],
        objectId: 300,
        objectType: 'area',
      }),
    ],
    expected:
      'Still one card with one line, showing the ORIGINAL old value against the LATEST new one. Two cards here would mean the fold is not working.',
    id: 'AREA-02d',
    writer: 'areas.remote.ts:118',
  },
  {
    action: 'Edit the name back to where it started inside the window',
    domain: 'area',
    events: [],
    expected:
      'No card at all. The fold deletes a change row that returns to its old value, and an event left with no changes deletes itself.',
    id: 'AREA-02e',
    writer: 'areas.remote.ts:118',
  },

  {
    action: '/areas/301 -> More -> Delete area (an empty one)',
    domain: 'area',
    events: [
      eventAgo(150, {
        actorFk: ME,
        metadata: stringifyDeletionScale({ areas: 0, blocks: 0, routes: 0 }),
        objectId: 301,
        objectType: 'area',
        verb: 'delete',
      }),
    ],
    expected: 'Single card, "You deleted the area Westwand". Nothing went with it, so the sub line counts nothing.',
    id: 'AREA-03a',
    writer: 'areas.remote.ts:280',
  },
  {
    action: '/areas/300 -> More -> Delete area (with children)',
    domain: 'area',
    events: [
      eventAgo(145, {
        actorFk: ME,
        metadata: stringifyDeletionScale({ areas: 1, blocks: 2, routes: 9 }),
        objectId: 300,
        objectType: 'area',
        verb: 'delete',
      }),
    ],
    expected:
      'Single card naming what went with it: 1 area, 2 blocks and 9 routes, counted while they were still knowable. The area itself is soft-deleted, so its name still resolves.',
    id: 'AREA-03b',
    writer: 'areas.remote.ts:280',
  },
  {
    action: 'Delete an area created less than 15 minutes ago (the grace window)',
    domain: 'area',
    events: [],
    expected:
      'No card, and the create card is gone too: inside the window a childless area is hard-deleted and its events cascade away. A mistake leaves no trace.',
    id: 'AREA-03c',
    writer: 'areas.remote.ts:276',
  },
  {
    action: 'Undo a deletion, from the toast',
    domain: 'area',
    events: [],
    expected:
      'No card, and the deletion card disappears: `deleteEvent` removes the event the delete wrote rather than logging a second action.',
    id: 'AREA-03d',
    writer: 'areas.remote.ts:409',
  },
  {
    action: 'A deletion whose area cannot be resolved (an orphan the backfill left behind)',
    domain: 'area',
    events: [
      eventAgo(140, {
        actorFk: ME,
        entity: undefined,
        metadata: stringifyDeletionScale({ blocks: 1, routes: 3 }),
        objectId: 999,
        objectType: 'area',
        verb: 'delete',
      }),
    ],
    expected:
      'The honest degraded state: "You deleted the area" with the unnamed placeholder, since a delete event stores no name of its own and there is no row left to read one from. Only reachable for pre-migration rows.',
    id: 'AREA-03e',
    writer: 'areas.remote.ts:280',
  },

  {
    action: '/areas/300 -> map -> long press -> Set parking',
    domain: 'area',
    events: [
      eventAgo(120, {
        actorFk: ME,
        metadata: stringifyCoords(PIN),
        objectId: 300,
        objectType: 'area',
        verb: 'add',
      }),
    ],
    expected:
      'Single card, "You set the parking for Steinbruch", with the coordinates as its change line. Resolved off the metadata: the verb `add` alone reads as an upload.',
    id: 'AREA-04a',
    writer: 'areas.remote.ts:452',
  },
  {
    action: '/areas/300 -> map -> parking marker -> Remove',
    domain: 'area',
    events: [
      eventAgo(115, {
        actorFk: ME,
        metadata: stringifyCoords(PIN, true),
        objectId: 300,
        objectType: 'area',
        verb: 'remove',
      }),
    ],
    expected:
      'Single card, "You removed the parking for Steinbruch". Same discriminator as above: without the coordinates this reads as removed media.',
    id: 'AREA-04b',
    writer: 'areas.remote.ts:507',
  },
  {
    action: 'A parking spot set BEFORE the events cutover, as the backfill migrated it',
    domain: 'area',
    events: [
      eventAgo(118, {
        actorFk: ME,
        changes: [change({ columnName: 'parking location', newValue: '47.123456,8.567890' })],
        objectId: 300,
        objectType: 'area',
      }),
    ],
    expected:
      'The same card as AREA-04a, "You set the parking for Steinbruch", from a different shape. The live writer emits `add` with the coordinates in metadata; the backfill mapped every old `updated` row to the `update` verb whatever its column was, so history arrives as an update carrying a change row. The catalogue holds both shapes, and without the second this fell through to "made a change".',
    id: 'AREA-04d',
    writer: null,
  },
  {
    action: 'Undo removing the parking spot',
    domain: 'area',
    events: [],
    expected: 'No card, and the removal card goes with it, exactly as the deletion undo does.',
    id: 'AREA-04c',
    writer: 'areas.remote.ts:542',
  },

  {
    action: 'Two areas created in one sitting, in the same region',
    domain: 'area',
    events: [
      eventAgo(100, { actorFk: ME, objectId: 301, objectType: 'area', parent: undefined, verb: 'create' }),
      eventAgo(102, { actorFk: ME, objectId: 300, objectType: 'area', parent: undefined, verb: 'create' }),
    ],
    expected:
      'Two top-level areas share no parent, so they do NOT fold: two separate create cards. Grouping keys a burst on the place, and there is none here.',
    id: 'AREA-05a',
    writer: 'areas.remote.ts:76',
  },
  {
    action: 'Two areas created under one parent in one sitting',
    domain: 'area',
    events: [
      eventAgo(95, {
        actorFk: ME,
        entity: areaEntity('Ostwand', 'Steinbruch'),
        objectId: 302,
        objectType: 'area',
        parent: { id: 300, type: 'area' },
        verb: 'create',
      }),
      eventAgo(97, { actorFk: ME, objectId: 301, objectType: 'area', verb: 'create' }),
    ],
    expected:
      'One burst card: same actor, same parent, minutes apart. "You edited Steinbruch" with a "2 edits" sub line, and both new areas as rows.',
    id: 'AREA-05b',
    writer: 'areas.remote.ts:76',
  },
]
