/**
 * The cards that exist only because several events landed together.
 *
 * Not one write site. Every other domain answers "what does this mutation say"; this one answers
 * "what happens when two of them arrive minutes apart", which is a decision `groupEvents` makes at
 * read time and no writer can see. The cases below still name the site that emitted each event,
 * because a fold that stops matching the way a writer writes is a fixture and not a case.
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
 * one event carries several change rows, which is why the one claim naming `entity` (GROUP-08a)
 * names a kind grouping never handed that card.
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
    action: 'Log three ascents in one sitting, each with your own grade, stars and conditions',
    domain: 'grouping',
    events: [
      eventAgo(420, {
        actorFk: ME,
        entity: ascentEntity('Kante direkt', 11, ME, 'flash', {
          ascentGradeFk: 12,
          ascentRating: 3,
          note: 'Straight up first go.',
          temperature: 9,
        }),
        objectId: 9121,
        objectType: 'ascent',
        parent: { id: 500, type: 'route' },
        verb: 'create',
      }),
      eventAgo(424, {
        actorFk: ME,
        entity: ascentEntity('Riss', 15, ME, 'redpoint', { ascentGradeFk: 14, ascentRating: 1, temperature: 9 }),
        objectId: 9122,
        objectType: 'ascent',
        parent: { id: 501, type: 'route' },
        verb: 'create',
      }),
      eventAgo(428, {
        actorFk: ME,
        entity: ascentEntity('Dach', 14, ME, 'attempt', { humidity: 70, temperature: 9 }),
        objectId: 9123,
        objectType: 'ascent',
        parent: { id: 502, type: 'route' },
        verb: 'create',
      }),
    ],
    expected:
      "One KIND `session` card of 3 ascents, and each row carries what THAT climb was logged with: an Opinion strip under Kante direkt holding your own grade and three stars, with your note quoted below it, one under Riss holding your grade and one star, and one under Dach with no Opinion label at all, since an attempt logged with conditions alone said nothing about grade or stars. All three were logged at the same temperature, and the conditions pill sits outside the label on each of them, because a reading is not a take on the climb. The grades are stored as ids here and render through the reader's own scale, the same as the temperature renders through their units, so what the chips say depends on who is looking. The community numbers stay on the rows themselves, which is what the label is there to tell apart. A card-level strip could only ever have shown the first of the three, and did.",
    id: 'GROUP-01e',
    writer: 'ascents.remote.ts:69',
  },

  {
    action: 'Log an ascent, then fix its rating twenty minutes later (past the fold window)',
    domain: 'grouping',
    events: [
      eventAgo(400, {
        actorFk: ME,
        changes: [change({ columnName: 'rating', newValue: '3', oldValue: '1' })],
        entity: ascentEntity('Rampe', 12, ME, 'flash', { ascentGradeFk: 13, ascentRating: 3 }),
        objectId: 9001,
        objectType: 'ascent',
      }),
      eventAgo(420, {
        actorFk: ME,
        entity: ascentEntity('Rampe', 12, ME, 'flash', { ascentGradeFk: 13, ascentRating: 3 }),
        objectId: 9001,
        objectType: 'ascent',
        verb: 'create',
      }),
    ],
    expected:
      'ONE card that still says "You flashed Rampe", with the flash glyph, one row, and "1 edit" as the sub line. Two events (20 minutes is past the 15 minute server fold) about one climb: that is not a session, and the card used to say "You logged a session" over "1 ascent", contradicting itself about how much happened. A card holding one create that every line is about speaks that create\'s sentence, and what it counts is then EDITS, since the log itself is not one. The row keeps its Opinion strip: it is named by an update AND by a create, and the strip comes off the create wherever it sits rather than off whichever line is newest, or an evening correction would take the morning\'s grade and stars off the card that logged them. The Rating line sits behind the changes toggle, and the strip shows where the rating ended up, since it reads the ascent as it stands now.',
    id: 'GROUP-01f',
    writer: 'ascents.remote.ts:117',
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
      'One KIND `burst` card, "You edited Nordblock", with a "12 edits" sub line. Four events, twelve edits: the count is change ROWS, because `eventLines` expands an update into one line per column and the card counts what it holds. All four routes are the shared parent of every event, so the headline names the block rather than any one route, and four rows fit with nothing left over.',
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
    action: 'Two renames in one sitting, neither route still resolvable',
    domain: 'grouping',
    events: [
      eventAgo(320, {
        actorFk: ME,
        changes: [change({ columnName: 'name', newValue: 'Kante direkt', oldValue: 'Kante' })],
        entity: undefined,
        objectId: 598,
        parent: { id: 400, type: 'block' },
      }),
      eventAgo(322, {
        actorFk: ME,
        changes: [change({ columnName: 'name', newValue: 'Rissweg', oldValue: 'Riss' })],
        entity: undefined,
        objectId: 599,
        parent: { id: 400, type: 'block' },
      }),
    ],
    expected:
      'A KIND `burst` card headlined "You edited Nordblock", with TWO tombstone rows, each carrying the name its OWN rename stored: "Rissweg" and "Kante direkt", never the same name twice. The name a tombstone shows comes from the line that named that row, and a rename is the one shape that stores one (its entry declares the new value as the tombstone column), so a card holding two of them is where borrowing the first line\'s name would show. The block names the card even though neither route resolves, because the events carry it. Only reachable degraded, since a route soft deletes and keeps resolving; the backfill can leave an event whose route is gone.',
    id: 'GROUP-02d',
    writer: 'routes.remote.ts:257',
  },

  {
    action: 'Rename one route twice, twenty minutes apart, and the route is gone',
    domain: 'grouping',
    events: [
      eventAgo(310, {
        actorFk: ME,
        changes: [change({ columnName: 'name', newValue: 'Kante direkt', oldValue: 'Kante links' })],
        entity: undefined,
        objectId: 597,
        parent: { id: 400, type: 'block' },
      }),
      eventAgo(330, {
        actorFk: ME,
        changes: [change({ columnName: 'name', newValue: 'Kante links', oldValue: 'Kante' })],
        entity: undefined,
        objectId: 597,
        parent: { id: 400, type: 'block' },
      }),
    ],
    expected:
      'One card speaking the shared sentence, "You renamed Kante direkt", over a tombstone row of the same name and "2 edits" as the sub line. Two events because 20 minutes is past the fold, one subject, one key, so the card says what happened rather than "You edited Nordblock". The name comes from the newest rename\'s stored value, which is where a route that no longer resolves keeps the name it ended on; the block is the fallback only for an entry that stores no name at all, and a rename is the one that does. Only reachable degraded, the same as the two-tombstone burst above.',
    id: 'GROUP-02e',
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
      'ONE KIND `session` card, "You logged a session", sub line "3 ascents · 1 video", the clip in the thumbnail strip and all three climbs as rows. A session takes several creates as a merge target where an edit burst does not: the clip belongs to the sitting the card reports, and leaving it on a card of its own put "You added a video to your ascent of Riss" between the reader and the session it came from. Nothing moves to the front, unlike a lone create: the card speaks for the afternoon rather than for any one climb, so the headline stays the session\'s and the count stays 3 ascents rather than becoming 1 video.',
    id: 'GROUP-03e',
    writer: 'files.remote.ts:59',
  },
  {
    action: 'Log two ascents and hang a clip on each of them',
    domain: 'grouping',
    events: [
      eventAgo(214, {
        actorFk: ME,
        entity: fileEntity(ascentEntity('Riss', 15, ME, 'redpoint'), [video('v3')]),
        objectId: 'v3',
        objectType: 'file',
        parent: { id: 9124, type: 'ascent' },
        verb: 'add',
      }),
      eventAgo(215, {
        actorFk: ME,
        entity: fileEntity(ascentEntity('Dach', 14, ME, 'flash'), [video('v4')]),
        objectId: 'v4',
        objectType: 'file',
        parent: { id: 9125, type: 'ascent' },
        verb: 'add',
      }),
      eventAgo(217, {
        actorFk: ME,
        entity: ascentEntity('Riss', 15, ME, 'redpoint'),
        objectId: 9124,
        objectType: 'ascent',
        parent: { id: 501, type: 'route' },
        verb: 'create',
      }),
      eventAgo(219, {
        actorFk: ME,
        entity: ascentEntity('Dach', 14, ME, 'flash'),
        objectId: 9125,
        objectType: 'ascent',
        parent: { id: 502, type: 'route' },
        verb: 'create',
      }),
    ],
    expected:
      'Still ONE KIND `session` card, "2 ascents · 2 videos": two upload groups, each keyed on the ascent it landed on, both folding into the same session. Two rows, not four, because an upload names the thing it landed on rather than the file, and both clips in one thumbnail strip. The card counts the climbs off the rows rather than off its subjects, since a file is a subject too and counting those read "4 ascents".',
    id: 'GROUP-03f',
    writer: 'files.remote.ts:59',
  },

  {
    action: 'Log an ascent with a clip, then log another one before the clip has finished uploading',
    domain: 'grouping',
    events: [
      eventAgo(206, {
        actorFk: ME,
        entity: ascentEntity('Dach', 14, ME, 'attempt'),
        objectId: 9127,
        objectType: 'ascent',
        parent: { id: 502, type: 'route' },
        verb: 'create',
      }),
      eventAgo(208, {
        actorFk: ME,
        entity: fileEntity(ascentEntity('Riss', 15, ME, 'redpoint'), [video('v5')]),
        objectId: 'v5',
        objectType: 'file',
        parent: { id: 9126, type: 'ascent' },
        verb: 'add',
      }),
      eventAgo(210, {
        actorFk: ME,
        entity: ascentEntity('Riss', 15, ME, 'redpoint'),
        objectId: 9126,
        objectType: 'ascent',
        parent: { id: 501, type: 'route' },
        verb: 'create',
      }),
    ],
    expected:
      'One KIND `session` card, "You logged a session", sub line "2 ascents · 1 video". The card holds a CREATE at the front, since a file finalizes after the entity it hangs on and the next climb was logged after that, but it is not a create that speaks for the card: only a group holding exactly ONE create is that, and this one holds two. Without that guard the card read "You redpointed Riss" over two ascent rows and counted the video instead of the climbs.',
    id: 'GROUP-03g',
    writer: 'files.remote.ts:59',
  },
  {
    action: 'Work a project: three goes on one route in a session, with a clip of the last',
    domain: 'grouping',
    events: [
      eventAgo(190, {
        actorFk: ME,
        entity: fileEntity(ascentEntity('Rampe', 12, ME, 'redpoint'), [video('v6')]),
        objectId: 'v6',
        objectType: 'file',
        parent: { id: 9130, type: 'ascent' },
        verb: 'add',
      }),
      eventAgo(192, {
        actorFk: ME,
        entity: ascentEntity('Rampe', 12, ME, 'redpoint'),
        objectId: 9130,
        objectType: 'ascent',
        parent: { id: 506, type: 'route' },
        verb: 'create',
      }),
      eventAgo(196, {
        actorFk: ME,
        entity: ascentEntity('Rampe', 12, ME, 'attempt'),
        objectId: 9129,
        objectType: 'ascent',
        parent: { id: 506, type: 'route' },
        verb: 'create',
      }),
      eventAgo(200, {
        actorFk: ME,
        entity: ascentEntity('Rampe', 12, ME, 'attempt'),
        objectId: 9128,
        objectType: 'ascent',
        parent: { id: 506, type: 'route' },
        verb: 'create',
      }),
    ],
    expected:
      'One KIND `session` card, sub line "3 ascents · Rampe · 1 video": every ascent hangs off the same route, so the session names the place, and the clip does not take that away. A card names a place only when its whole window agrees on one, and an upload hangs off the ASCENT rather than the route, so it used to count as a disagreement and a session on one project lost its name the moment somebody filmed a go. A line that borrows its parent\'s row says nothing about the place when that parent is already on the card.',
    id: 'GROUP-03h',
    writer: 'files.remote.ts:59',
  },
  {
    action: 'Film a go on a route you photographed last week',
    domain: 'grouping',
    events: [
      eventAgo(186, {
        actorFk: ME,
        entity: fileEntity(ascentEntity('Riss', 15, ME, 'flash'), [video('v7')]),
        objectId: 'v7',
        objectType: 'file',
        parent: { id: 9131, type: 'ascent' },
        verb: 'add',
      }),
      eventAgo(188, {
        actorFk: ME,
        entity: ascentEntity('Riss', 15, ME, 'flash', { files: [video('v7'), photo('p9')] }),
        objectId: 9131,
        objectType: 'ascent',
        parent: { id: 501, type: 'route' },
        verb: 'create',
      }),
      eventAgo(189, {
        actorFk: ME,
        entity: ascentEntity('Dach', 14, ME, 'attempt'),
        objectId: 9132,
        objectType: 'ascent',
        parent: { id: 502, type: 'route' },
        verb: 'create',
      }),
    ],
    expected:
      'Sub line "2 ascents · 1 video", not "1 media". The count and the word both come off the upload rows themselves; reading the card-wide media word instead asked a different question, since that one reads every file hanging off every entity on the card, and the older photo still on that ascent made the two disagree. Both files show in the thumbnail strip, which is the card saying what it holds rather than what happened.',
    id: 'GROUP-03i',
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
      'Two KIND `single` cards, "You renamed Kante direkt" and "Sofia Brandt changed the rating of Kante direkt". A route is a crag object, so both events are `burst` kind, and the burst key carries the actor: two people working on one route never share a card. Every other key carries it too now, so this is the rule rather than a property of bursts, and the next case is the one that used to break it.',
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
      'TWO KIND `single` cards, "You removed a photo from your ascent of Rampe" and "Sofia Brandt removed a photo from Ada Rossi’s ascent of Rampe". A file removal logs on the PARENT (the file row is gone by then), so it arrives as `ascent` + `remove` and `kindOf` keeps it out of the session; the entity key carries the actor, so the two removals no longer share a card. Under the old key they did, and the card said "You removed photos" over work two people did, since the file-only branch of the headline ran before the multi-actor one could: it read as one person pulling two photos.',
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
      'One KIND `single` card, "You flashed Rampe", and the corrections are invisible: an `update` joins an open `create` and the verb stays `create`, but `eventLines` expands changes only for an `update`, so the two rows the fold saved render as nothing at all. The card also sits at the CORRECTION\'s time, since joining bumps the open event back to the top of the feed.',
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
      'One KIND `burst` card of two events: `metadata` scopes the server fold, so a photo and a video stay apart there and then group on the client as guidebook edits under Nordblock. Both rows resolve the same sentence, so the card speaks it rather than a group verb, with the mixed media word: "You removed media from Kante direkt", sub line "2 files".',
    id: 'GROUP-08d',
    writer: 'files.remote.ts:344',
  },
]
