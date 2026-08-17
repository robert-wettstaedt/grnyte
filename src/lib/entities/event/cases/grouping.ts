/**
 * The cards that exist only because several events landed together.
 *
 * Not one write site. Every other domain answers "what does this mutation say"; this one answers
 * "what happens when two of them arrive minutes apart", which is a decision `groupEvents` makes at
 * read time and no writer can see. The cases below still name the site that emitted each event,
 * because a fold that stops matching the way a writer really writes is a fixture and not a case.
 *
 * The three windows in play, all different, and most of the surprises here come from mixing them
 * up: the SERVER folds a second call on the same object into the open event inside 15 minutes
 * (`event.server.ts`, keyed on actor, object, region and metadata); the CLIENT groups separate
 * events inside 30 minutes (`BURST_MS`); and a session additionally holds together for a whole
 * local calendar day. So "I did it twice" reaches the feed as one event, two events on one card, or
 * two cards, depending on which window it fell in.
 *
 * Every claim names the KIND the group should come out as. Read `grouping.ts` beside it: the kind
 * is decided before the card is, and `card.ts` then rewrites `single` to `entity` for a group whose
 * one event carries several change rows, which is why exactly one of these claims (GROUP-08a) names
 * a kind grouping never handed that card. The other claim naming `entity` (GROUP-05b) gets it
 * straight from `groupEvents`, which returns that kind for any multi-event group off the entity key.
 */
import type { EventCase } from './types'
import { ascentEntity, blockEntity, change, eventAgo, fileEntity, ME, photo, routeEntity, video } from './world'

export const GROUPING_CASES: EventCase[] = [
  {
    action: '/routes/... -> Log ascent -> Save, five times through one afternoon',
    domain: 'grouping',
    events: [
      eventAgo(600, {
        actorFk: ME,
        entity: ascentEntity('Kante direkt', 11, ME, 'flash'),
        objectId: 9101,
        objectType: 'ascent',
        parent: { id: 500, type: 'route' },
        verb: 'create',
      }),
      eventAgo(607, {
        actorFk: ME,
        entity: ascentEntity('Riss', 15, ME, 'redpoint'),
        objectId: 9102,
        objectType: 'ascent',
        parent: { id: 501, type: 'route' },
        verb: 'create',
      }),
      eventAgo(614, {
        actorFk: ME,
        entity: ascentEntity('Dach', 14, ME, 'attempt'),
        objectId: 9103,
        objectType: 'ascent',
        parent: { id: 502, type: 'route' },
        verb: 'create',
      }),
      eventAgo(621, {
        actorFk: ME,
        entity: ascentEntity('Platte', 8, ME, 'repeat'),
        objectId: 9104,
        objectType: 'ascent',
        parent: { id: 503, type: 'route' },
        verb: 'create',
      }),
      eventAgo(628, {
        actorFk: ME,
        entity: ascentEntity('Ecke', 9, ME, 'flash'),
        objectId: 9105,
        objectType: 'ascent',
        parent: { id: 504, type: 'route' },
        parentEntity: routeEntity('Ecke', 9),
        verb: 'create',
      }),
    ],
    expected:
      'One KIND `session` card, "You logged a session", with a "5 ascents" sub line. Five routes means the window agrees on no shared parent, so the sub line names no place: a session summary appends one only when every event points at the same one. Four rows render and the fifth collapses into "1 more", and that fifth ascent keeps no reaction bar, since a bar rides a rendered row.',
    id: 'GROUP-01a',
    writer: 'ascents.remote.ts:69',
  },
  {
    action: 'Log two ascents eight minutes apart, with local midnight somewhere between them',
    domain: 'grouping',
    events: [
      eventAgo(560, {
        actorFk: ME,
        entity: ascentEntity('Kante direkt', 11, ME, 'redpoint'),
        objectId: 9106,
        objectType: 'ascent',
        parent: { id: 500, type: 'route' },
        verb: 'create',
      }),
      eventAgo(568, {
        actorFk: ME,
        entity: ascentEntity('Riss', 15, ME, 'flash'),
        objectId: 9107,
        objectType: 'ascent',
        parent: { id: 501, type: 'route' },
        verb: 'create',
      }),
    ],
    expected:
      'One KIND `session` card of 2 ascents. The session key holds no calendar day and `joins` takes the 30 minute window first, so a log that runs past local midnight stays one card instead of splitting in two. Whether midnight really falls between these two depends on when the wall is read, which is the honest state of this case: nothing in the fixtures can pin an event to a clock time.',
    id: 'GROUP-01b',
    writer: 'ascents.remote.ts:69',
  },
  {
    action: 'Log one ascent, climb for another hour and a half, log the next',
    domain: 'grouping',
    events: [
      eventAgo(480, {
        actorFk: ME,
        entity: ascentEntity('Dach', 14, ME, 'redpoint'),
        objectId: 9108,
        objectType: 'ascent',
        parent: { id: 502, type: 'route' },
        verb: 'create',
      }),
      eventAgo(580, {
        actorFk: ME,
        entity: ascentEntity('Platte', 8, ME, 'flash'),
        objectId: 9109,
        objectType: 'ascent',
        parent: { id: 503, type: 'route' },
        verb: 'create',
      }),
    ],
    expected:
      'One KIND `session` card of 2 ascents, held together by the `isSameDay` arm alone: 100 minutes is well past the 30 minute window, and only a session has that second arm. Read close to local midnight the older event falls on the previous day and this becomes two KIND `single` cards, which makes it the one claim on this wall the clock can change.',
    id: 'GROUP-01c',
    writer: 'ascents.remote.ts:69',
  },
  {
    action: 'Two climbers log their afternoon in the same session, seen from one feed',
    domain: 'grouping',
    events: [
      eventAgo(440, {
        actorFk: ME,
        entity: ascentEntity('Kante direkt', 11, ME, 'flash'),
        objectId: 9110,
        objectType: 'ascent',
        parent: { id: 500, type: 'route' },
        verb: 'create',
      }),
      eventAgo(442, {
        actorFk: 3,
        entity: ascentEntity('Kante direkt', 11, 3, 'redpoint'),
        objectId: 9111,
        objectType: 'ascent',
        parent: { id: 500, type: 'route' },
        verb: 'create',
      }),
      eventAgo(444, {
        actorFk: ME,
        entity: ascentEntity('Riss', 15, ME, 'repeat'),
        objectId: 9112,
        objectType: 'ascent',
        parent: { id: 501, type: 'route' },
        verb: 'create',
      }),
      eventAgo(446, {
        actorFk: 3,
        entity: ascentEntity('Riss', 15, 3, 'attempt'),
        objectId: 9113,
        objectType: 'ascent',
        parent: { id: 501, type: 'route' },
        verb: 'create',
      }),
    ],
    expected:
      'Two KIND `session` cards of 2 ascents each, interleaved minute by minute in the feed: the session key carries the actor, so climbing together never merges two logbooks. "You logged a session" and "Sofia Brandt logged a session".',
    id: 'GROUP-01d',
    writer: 'ascents.remote.ts:69',
  },

  {
    action: 'Edit four routes under Nordblock in one sitting, three fields each',
    domain: 'grouping',
    events: [
      eventAgo(400, {
        actorFk: ME,
        changes: [
          change({ columnName: 'gradeFk', newValue: '12', oldValue: '11' }),
          change({ columnName: 'name', newValue: 'Kante direkt', oldValue: 'Kante' }),
          change({ columnName: 'rating', newValue: '3', oldValue: '2' }),
        ],
        objectId: 500,
      }),
      eventAgo(402, {
        actorFk: ME,
        changes: [
          change({ columnName: 'gradeFk', newValue: '16', oldValue: '15' }),
          change({ columnName: 'name', newValue: 'Riss', oldValue: 'Rissweg' }),
          change({ columnName: 'rating', newValue: '2', oldValue: '1' }),
        ],
        objectId: 501,
      }),
      eventAgo(404, {
        actorFk: ME,
        changes: [
          change({ columnName: 'gradeFk', newValue: '14', oldValue: '13' }),
          change({ columnName: 'name', newValue: 'Dach', oldValue: 'Dachweg' }),
          change({ columnName: 'rating', newValue: '3', oldValue: '1' }),
        ],
        objectId: 502,
      }),
      eventAgo(406, {
        actorFk: ME,
        changes: [
          change({ columnName: 'gradeFk', newValue: '8', oldValue: '9' }),
          change({ columnName: 'name', newValue: 'Platte', oldValue: 'Plattenweg' }),
          change({ columnName: 'rating', newValue: '1', oldValue: '2' }),
        ],
        objectId: 503,
      }),
    ],
    expected:
      'One KIND `burst` card, "You edited Nordblock", with a "12 edits" sub line. Four events, twelve edits: the count is change ROWS, because `legacyRows` expands an update into one row per column and the card counts what it holds. All four routes are the shared parent of every event, so the headline names the block rather than any one route, and four rows fit with nothing left over.',
    id: 'GROUP-02a',
    writer: 'routes.remote.ts:257',
  },
  {
    action: 'Edit routes in two blocks alternately, one minute apart',
    domain: 'grouping',
    events: [
      eventAgo(380, {
        actorFk: ME,
        changes: [change({ columnName: 'name', newValue: 'Kante direkt', oldValue: 'Kante' })],
        objectId: 500,
      }),
      eventAgo(381, {
        actorFk: ME,
        changes: [change({ columnName: 'name', newValue: 'Verschneidung', oldValue: 'Verschneidungsweg' })],
        entity: { ...routeEntity('Verschneidung', 10), crumbs: ['Steinbruch', 'Westwand', 'Südblock'] },
        objectId: 510,
        parent: { id: 401, type: 'block' },
        parentEntity: blockEntity('Südblock'),
      }),
      eventAgo(382, {
        actorFk: ME,
        changes: [change({ columnName: 'rating', newValue: '3', oldValue: '2' })],
        objectId: 501,
      }),
      eventAgo(383, {
        actorFk: ME,
        changes: [change({ columnName: 'gradeFk', newValue: '13', oldValue: '12' })],
        entity: { ...routeEntity('Kamin', 13), crumbs: ['Steinbruch', 'Westwand', 'Südblock'] },
        objectId: 511,
        parent: { id: 401, type: 'block' },
        parentEntity: blockEntity('Südblock'),
      }),
      eventAgo(384, {
        actorFk: ME,
        changes: [change({ columnName: 'gradeFk', newValue: '15', oldValue: '14' })],
        objectId: 502,
      }),
    ],
    expected:
      'Two cards, though every event is a minute from the next: a KIND `burst` of 3 edits in Nordblock and a KIND `burst` of 2 edits in Südblock. The burst key carries the locality, so an editor working across two blocks gets one card per place rather than one card that can only headline one of them.',
    id: 'GROUP-02b',
    writer: 'routes.remote.ts:257',
  },
  {
    action: 'Edit two routes, walk off, come back 40 minutes later and edit a third',
    domain: 'grouping',
    events: [
      eventAgo(330, {
        actorFk: ME,
        changes: [change({ columnName: 'name', newValue: 'Kante direkt', oldValue: 'Kante' })],
        objectId: 500,
      }),
      eventAgo(333, {
        actorFk: ME,
        changes: [change({ columnName: 'rating', newValue: '3', oldValue: '2' })],
        objectId: 501,
      }),
      eventAgo(375, {
        actorFk: ME,
        changes: [change({ columnName: 'gradeFk', newValue: '15', oldValue: '14' })],
        objectId: 502,
      }),
    ],
    expected:
      "A KIND `burst` card of the two edits three minutes apart, and a KIND `single` card for the one 42 minutes earlier. The window is measured against the group's oldest member so far rather than against its newest, so a burst can stretch as long as no gap inside it exceeds 30 minutes, and this gap does.",
    id: 'GROUP-02c',
    writer: 'routes.remote.ts:257',
  },

  {
    action: '/blocks/400 -> Add route -> pick two photos -> Create route',
    domain: 'grouping',
    events: [
      eventAgo(298, {
        actorFk: ME,
        entity: fileEntity(routeEntity('Kante direkt', 11), [photo('p2')]),
        objectId: 'p2',
        objectType: 'file',
        parent: { id: 500, type: 'route' },
        verb: 'add',
      }),
      eventAgo(299, {
        actorFk: ME,
        entity: fileEntity(routeEntity('Kante direkt', 11), [photo('p1')]),
        objectId: 'p1',
        objectType: 'file',
        parent: { id: 500, type: 'route' },
        verb: 'add',
      }),
      eventAgo(300, { actorFk: ME, objectId: 500, verb: 'create' }),
    ],
    expected:
      'One card, not two. `mergeCreatedWithMedia` folds the upload group into the group holding the create it landed on, and the merged group keeps the CREATE group\'s kind, which for a route created under a block is KIND `burst`. The create is moved to the front, so the headline is "You added the route Kante direkt" with a "2 photos" sub line, both photos above one route row. The create half is written by routes.remote.ts:163.',
    id: 'GROUP-03a',
    writer: 'files.remote.ts:59',
  },
  {
    action: '/routes/500 -> Log ascent -> attach a clip -> Save',
    domain: 'grouping',
    events: [
      eventAgo(289, {
        actorFk: ME,
        entity: fileEntity(ascentEntity('Rampe', 12, ME, 'flash'), [video('v1')]),
        objectId: 'v1',
        objectType: 'file',
        parent: { id: 9001, type: 'ascent' },
        verb: 'add',
      }),
      eventAgo(290, { actorFk: ME, objectId: 9001, objectType: 'ascent', verb: 'create' }),
    ],
    expected:
      'One KIND `session` card holding the create and the upload: the same merge, into a session group this time, because a lone ascent create is a session of one. The headline is the create\'s own sentence, "You flashed Rampe", with a "1 video" sub line, not "You logged a session". The create half is written by ascents.remote.ts:69.',
    id: 'GROUP-03b',
    writer: 'files.remote.ts:59',
  },
  {
    action: 'You add a route, somebody else photographs it a minute later',
    domain: 'grouping',
    events: [
      eventAgo(278, {
        actorFk: 3,
        entity: fileEntity(routeEntity('Kante direkt', 11), [photo('p4')]),
        objectId: 'p4',
        objectType: 'file',
        parent: { id: 500, type: 'route' },
        verb: 'add',
      }),
      eventAgo(279, {
        actorFk: 3,
        entity: fileEntity(routeEntity('Kante direkt', 11), [photo('p3')]),
        objectId: 'p3',
        objectType: 'file',
        parent: { id: 500, type: 'route' },
        verb: 'add',
      }),
      eventAgo(280, { actorFk: ME, objectId: 500, verb: 'create' }),
    ],
    expected:
      'Two cards, the newer one on top: a KIND `upload`, "Sofia Brandt added photos to Kante direkt" with a "2 photos" sub line, above a KIND `single` create, "You added the route Kante direkt". The merge looks up the create by actor as well as by object, so somebody else\'s photos never disappear into your create.',
    id: 'GROUP-03c',
    writer: 'files.remote.ts:59',
  },
  {
    action: 'Add a route, come back half an hour later and upload the photos',
    domain: 'grouping',
    events: [
      eventAgo(234, {
        actorFk: ME,
        entity: fileEntity(routeEntity('Kante direkt', 11), [photo('p6')]),
        objectId: 'p6',
        objectType: 'file',
        parent: { id: 500, type: 'route' },
        verb: 'add',
      }),
      eventAgo(235, {
        actorFk: ME,
        entity: fileEntity(routeEntity('Kante direkt', 11), [photo('p5')]),
        objectId: 'p5',
        objectType: 'file',
        parent: { id: 500, type: 'route' },
        verb: 'add',
      }),
      eventAgo(270, { actorFk: ME, objectId: 500, verb: 'create' }),
    ],
    expected:
      'Two cards again, this time on the clock: the two groups are 36 minutes apart and `withinBurst` compares their newest events against the same 30 minutes the rest of grouping uses. A KIND `upload` of "2 photos" on top, "You added photos to Kante direkt", and the KIND `single` create below it.',
    id: 'GROUP-03d',
    writer: 'files.remote.ts:59',
  },
  {
    action: 'Log three ascents, hang a clip on one of them',
    domain: 'grouping',
    events: [
      eventAgo(224, {
        actorFk: ME,
        entity: fileEntity(ascentEntity('Riss', 15, ME, 'redpoint'), [video('v2')]),
        objectId: 'v2',
        objectType: 'file',
        parent: { id: 9114, type: 'ascent' },
        verb: 'add',
      }),
      eventAgo(225, {
        actorFk: ME,
        entity: ascentEntity('Riss', 15, ME, 'redpoint'),
        objectId: 9114,
        objectType: 'ascent',
        parent: { id: 501, type: 'route' },
        verb: 'create',
      }),
      eventAgo(227, {
        actorFk: ME,
        entity: ascentEntity('Dach', 14, ME, 'attempt'),
        objectId: 9115,
        objectType: 'ascent',
        parent: { id: 502, type: 'route' },
        verb: 'create',
      }),
      eventAgo(229, {
        actorFk: ME,
        entity: ascentEntity('Platte', 8, ME, 'flash'),
        objectId: 9116,
        objectType: 'ascent',
        parent: { id: 503, type: 'route' },
        verb: 'create',
      }),
    ],
    expected:
      'Two cards, and this is the merge deliberately declining: a KIND `single` upload, "You added a video to your ascent of Riss", above a KIND `session` of 3 ascents. Only a group holding EXACTLY one create is a merge target, because folding the clip in would make an afternoon of three climbs speak one ascent\'s verb and count one video.',
    id: 'GROUP-03e',
    writer: 'files.remote.ts:59',
  },

  {
    action: 'Clear three abandoned routes out of Nordblock, one after another',
    domain: 'grouping',
    events: [
      eventAgo(200, { actorFk: ME, objectId: 501, verb: 'delete' }),
      eventAgo(202, { actorFk: ME, objectId: 502, verb: 'delete' }),
      eventAgo(204, { actorFk: ME, objectId: 503, verb: 'delete' }),
    ],
    expected:
      'One KIND `removal` card, "You deleted entries", with a "3 deletions" sub line followed by "Nordblock". `deleteRoute` records no scale, so nothing is counted beyond the rows themselves. The routes soft delete once they are past the grace window, so each row still renders as the live route rather than as a tombstone.',
    id: 'GROUP-04a',
    writer: 'routes.remote.ts:428',
  },
  {
    action: 'Delete a route, rename the next one, delete a third, inside three minutes',
    domain: 'grouping',
    events: [
      eventAgo(180, { actorFk: ME, objectId: 501, verb: 'delete' }),
      eventAgo(181, {
        actorFk: ME,
        changes: [change({ columnName: 'name', newValue: 'Kante direkt', oldValue: 'Kante' })],
        objectId: 500,
      }),
      eventAgo(182, { actorFk: ME, objectId: 502, verb: 'delete' }),
    ],
    expected:
      'Two cards from three events a minute apart: a KIND `removal` of "2 deletions" in Nordblock, and a KIND `single` rename between them. `kindOf` sends a `delete` to its own kind before the crag rule can claim it, so a deletion is never something a reader has to find inside "made 3 edits in Nordblock".',
    id: 'GROUP-04b',
    writer: 'routes.remote.ts:428',
  },

  {
    action: 'Two maintainers edit the same route within two minutes',
    domain: 'grouping',
    events: [
      eventAgo(160, {
        actorFk: ME,
        changes: [change({ columnName: 'name', newValue: 'Kante direkt', oldValue: 'Kante' })],
        objectId: 500,
      }),
      eventAgo(162, {
        actorFk: 3,
        changes: [change({ columnName: 'rating', newValue: '3', oldValue: '2' })],
        objectId: 500,
      }),
    ],
    expected:
      'Two KIND `single` cards, "You renamed Kante direkt" and "Sofia Brandt changed the rating of Kante direkt". A route is a crag object, so both events are `burst` kind, and the burst key carries the actor: two people working on one route never share a card. `event_groupEditsMultiple` is unreachable from a route for that reason, and the next case is where it does appear.',
    id: 'GROUP-05a',
    writer: 'routes.remote.ts:257',
  },
  {
    action: 'You pull a photo off your ascent, a maintainer pulls another off the same one',
    domain: 'grouping',
    events: [
      eventAgo(150, { actorFk: ME, metadata: 'photo', objectId: 9001, objectType: 'ascent', verb: 'remove' }),
      eventAgo(152, { actorFk: 3, metadata: 'photo', objectId: 9001, objectType: 'ascent', verb: 'remove' }),
    ],
    expected:
      'One KIND `entity` card mixing two actors, which only the entity key allows: a file removal logs on the PARENT (the file row is gone by then), so it arrives as `ascent` + `remove` and `kindOf` keeps it out of the session. Headline "You and others edited Rampe". The sub line is "2 photos" and NOT the "2 people" part, because the file-only branch of `summaryParts` returns before the actor count is appended: the card says two people in words and never counts them.',
    id: 'GROUP-05b',
    writer: 'files.remote.ts:344',
  },

  {
    action: 'Log ascents in two regions on the same afternoon, alternating',
    domain: 'grouping',
    events: [
      eventAgo(130, {
        actorFk: ME,
        entity: ascentEntity('Kante direkt', 11, ME, 'flash'),
        objectId: 9117,
        objectType: 'ascent',
        parent: { id: 500, type: 'route' },
        verb: 'create',
      }),
      eventAgo(132, {
        actorFk: ME,
        entity: ascentEntity('Sonnenplatte', 10, ME, 'redpoint', { crumbs: ['Jura', 'Balmfluh'] }),
        objectId: 9118,
        objectType: 'ascent',
        parent: { id: 520, type: 'route' },
        parentEntity: { ...routeEntity('Sonnenplatte', 10), crumbs: ['Jura', 'Balmfluh'] },
        regionFk: 2,
        verb: 'create',
      }),
      eventAgo(134, {
        actorFk: ME,
        entity: ascentEntity('Riss', 15, ME, 'repeat'),
        objectId: 9119,
        objectType: 'ascent',
        parent: { id: 501, type: 'route' },
        verb: 'create',
      }),
      eventAgo(136, {
        actorFk: ME,
        entity: ascentEntity('Kaminriss', 13, ME, 'flash', { crumbs: ['Jura', 'Balmfluh'] }),
        objectId: 9120,
        objectType: 'ascent',
        parent: { id: 521, type: 'route' },
        parentEntity: { ...routeEntity('Kaminriss', 13), crumbs: ['Jura', 'Balmfluh'] },
        regionFk: 2,
        verb: 'create',
      }),
    ],
    expected:
      'Two KIND `session` cards of 2 ascents each, one per region, interleaved in the feed. Every group key carries the region: without it these four fold into one "4 ascents" card that belongs to neither place. Nobody climbs in two regions in one afternoon, but a person who moved does, and the same guard is what keeps two roles in two regions from becoming one card.',
    id: 'GROUP-06a',
    writer: 'ascents.remote.ts:69',
  },

  {
    action: 'Rename six routes in Nordblock in one sitting',
    domain: 'grouping',
    events: [
      eventAgo(100, {
        actorFk: ME,
        changes: [change({ columnName: 'name', newValue: 'Kante direkt', oldValue: 'Kante' })],
        objectId: 500,
      }),
      eventAgo(102, {
        actorFk: ME,
        changes: [change({ columnName: 'name', newValue: 'Riss', oldValue: 'Rissweg' })],
        objectId: 501,
      }),
      eventAgo(104, {
        actorFk: ME,
        changes: [change({ columnName: 'name', newValue: 'Dach', oldValue: 'Dachweg' })],
        objectId: 502,
      }),
      eventAgo(106, {
        actorFk: ME,
        changes: [change({ columnName: 'name', newValue: 'Platte', oldValue: 'Plattenweg' })],
        objectId: 503,
      }),
      eventAgo(108, {
        actorFk: ME,
        changes: [change({ columnName: 'name', newValue: 'Ecke', oldValue: 'Eckweg' })],
        entity: routeEntity('Ecke', 9),
        objectId: 504,
        parent: { id: 400, type: 'block' },
      }),
      eventAgo(110, {
        actorFk: ME,
        changes: [change({ columnName: 'name', newValue: 'Pfeiler', oldValue: 'Pfeilerweg' })],
        entity: routeEntity('Pfeiler', 13),
        objectId: 505,
        parent: { id: 400, type: 'block' },
      }),
    ],
    expected:
      'One KIND `burst` card, "You edited Nordblock", sub line "6 edits". Six subjects and MAX_ROWS is 4, so four route rows render and the card ends with "2 more" (`event_moreEntities`). The two rows behind that count carry no reaction bar of their own: a bar rides a rendered row, and only an event that already holds a reaction or a comment falls through to the footer.',
    id: 'GROUP-07a',
    writer: 'routes.remote.ts:257',
  },

  {
    action: 'Rename a route, then fix its grade five minutes later',
    domain: 'grouping',
    events: [
      eventAgo(60, {
        actorFk: ME,
        changes: [
          change({ columnName: 'gradeFk', newValue: '12', oldValue: '11' }),
          change({ columnName: 'name', newValue: 'Kante direkt', oldValue: 'Kante' }),
        ],
        objectId: 500,
      }),
    ],
    expected:
      'One card out of ONE event: inside the 15 minute server fold the second save joins the open event instead of writing a new one, so there is nothing for grouping to group. `groupEvents` calls it `single` and `card.ts` rewrites that to KIND `entity`, because the event expands to two change rows and a card that spoke one row\'s sentence would name whichever column sorts first. Headline "You edited Kante direkt", sub line "2 edits", and the Grade and Name lines behind the card\'s Show changes toggle. Not a Compare toggle: that one belongs to a prose line and counts its characters, and a grade and a name render their before/after pair inline.',
    id: 'GROUP-08a',
    writer: 'routes.remote.ts:257',
  },
  {
    action: 'Log an ascent, then correct its notes and rating three minutes later',
    domain: 'grouping',
    events: [
      eventAgo(50, {
        actorFk: ME,
        changes: [
          change({ columnName: 'notes', newValue: 'Slippery in the crux.', oldValue: 'Slippy in the crux' }),
          change({ columnName: 'rating', newValue: '3', oldValue: '2' }),
        ],
        objectId: 9001,
        objectType: 'ascent',
        verb: 'create',
      }),
    ],
    expected:
      'One KIND `single` card, "You flashed Rampe", and the corrections are invisible: an `update` joins an open `create` and the verb stays `create`, but `legacyRows` expands changes only for an `update`, so the two rows the fold saved render as nothing at all. The card also sits at the CORRECTION\'s time, since joining bumps the open event back to the top of the feed.',
    id: 'GROUP-08b',
    writer: 'ascents.remote.ts:117',
  },
  {
    action: 'Delete three photos off one route from the media viewer, one after another',
    domain: 'grouping',
    events: [eventAgo(40, { actorFk: ME, metadata: 'photo', objectId: 500, verb: 'remove' })],
    expected:
      'One KIND `single` card, "You removed a photo from Kante direkt". Three files but one event: the fold key is (actor, object, region, metadata) and every one of these writes the same `photo`, so the second and third join the first. The sentence stays singular and nothing on the card counts three, which is the trade the fold makes for one card a reader can tell apart from two identical ones.',
    id: 'GROUP-08c',
    writer: 'files.remote.ts:344',
  },
  {
    action: 'Delete a photo and a video off one route, two minutes apart',
    domain: 'grouping',
    events: [
      eventAgo(30, { actorFk: ME, metadata: 'video', objectId: 500, verb: 'remove' }),
      eventAgo(32, { actorFk: ME, metadata: 'photo', objectId: 500, verb: 'remove' }),
    ],
    expected:
      'One KIND `burst` card of two events: `metadata` scopes the server fold, so a photo and a video stay apart there and then group on the client as crag edits under Nordblock. Both rows resolve the same sentence, so the card speaks it rather than a group verb, with the mixed media word: "You removed media from Kante direkt", sub line "2 files".',
    id: 'GROUP-08d',
    writer: 'files.remote.ts:344',
  },
]
