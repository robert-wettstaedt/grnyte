/**
 * Every card an action on a ROUTE can produce.
 *
 * Same contract as `area.ts`: each case names the write site it stands for, states the events that
 * site emits, and claims what the card says. The claim is derived by reading the code, so it is
 * what is under review, never the oracle.
 *
 * Two things are route-specific and worth knowing before reading the claims. A grade is stored as
 * an id, so both sides of a grade line are ids here and the card renders the labels its reader's
 * grading scale gives them. And tags and first ascensionists are stored comma-joined on one change
 * row each, so one save of five tags is one line, not five.
 */
import type { EventCase } from './types'
import { change, eventAgo, ME, routeEntity } from './world'

export const ROUTE_CASES: EventCase[] = [
  {
    action: '/blocks/400 -> + -> Add route -> name, grade -> Create route',
    domain: 'route',
    events: [eventAgo(300, { actorFk: ME, objectId: 500, verb: 'create' })],
    expected:
      'Single card, "You added the route Kante direkt". A create declares no column, so no change line: the grade and stars it was created with are only on the route row underneath.',
    id: 'ROUTE-01a',
    writer: 'routes.remote.ts:163',
  },
  {
    action: 'Somebody else adds a route to the same block, seen from your feed',
    domain: 'route',
    events: [eventAgo(295, { actorFk: 2, objectId: 502, verb: 'create' })],
    expected: 'Third person, "Tomas Kessler added the route Dach", with his avatar rather than "Me".',
    id: 'ROUTE-01b',
    writer: 'routes.remote.ts:163',
  },
  {
    action: 'Add a route and leave the name empty (the form allows it)',
    domain: 'route',
    events: [
      eventAgo(290, {
        actorFk: ME,
        // Built through `routeEntity`, which runs the blank through `routeDisplayName`: by the time
        // a card sees the route the placeholder is already its name, so nothing downstream has to
        // know the column was empty.
        entity: routeEntity('', 12),
        objectId: 504,
        parent: { id: 400, type: 'block' },
        verb: 'create',
      }),
    ],
    expected:
      'Single card, "You added the route Unnamed", with the placeholder in the name slot rather than an empty gap.',
    id: 'ROUTE-01c',
    writer: 'routes.remote.ts:163',
  },
  {
    action: 'Add a route, then fix its grade two minutes later',
    domain: 'route',
    events: [
      eventAgo(285, {
        actorFk: ME,
        // ONE event, still a create. `insertEvent` finds the open create and lets the update join
        // it without overwriting the verb, so the correction lands as a change row under "added".
        changes: [change({ columnName: 'gradeFk', newValue: '11', oldValue: '9' })],
        objectId: 500,
        verb: 'create',
      }),
    ],
    expected:
      'One card, "You added the route Kante direkt", and NO grade line: `eventLines` expands change rows only for an `update`, so a create absorbs its own corrections and shows none of them. The card reads as if the route had been added at 11 all along.',
    id: 'ROUTE-01d',
    writer: 'routes.remote.ts:257',
  },
  {
    action: 'Add two routes to Nordblock in one sitting',
    domain: 'route',
    events: [
      eventAgo(270, { actorFk: ME, objectId: 501, verb: 'create' }),
      eventAgo(273, { actorFk: ME, objectId: 500, verb: 'create' }),
    ],
    expected:
      'One burst card, keyed on the block both routes hang under: "You edited Nordblock" with a "2 edits" sub line and both routes as rows. The card says "edited" although both events are creates, because two subjects leave no shared sentence to speak.',
    id: 'ROUTE-01e',
    writer: 'routes.remote.ts:163',
  },

  {
    action: '/routes/500/edit -> Name -> Save',
    domain: 'route',
    events: [
      eventAgo(240, {
        actorFk: ME,
        changes: [change({ columnName: 'name', newValue: 'Kante direkt', oldValue: 'Kante' })],
        objectId: 500,
      }),
    ],
    expected:
      'Single card, "You renamed Kante direkt", naming the route as it stands now, with one change line: Kante to Kante direkt. No "the route" in this sentence: a rename names the thing alone, and an area rename renders the same bare sentence.',
    id: 'ROUTE-02a',
    writer: 'routes.remote.ts:257',
  },
  {
    action: '/routes/500/edit -> Grade -> Save',
    domain: 'route',
    events: [
      eventAgo(235, {
        actorFk: ME,
        // Ids, because that is what the column holds. The label a reader sees is whatever their
        // grading scale calls 9 and 11, which is why nothing here spells a grade out.
        changes: [change({ columnName: 'gradeFk', newValue: '11', oldValue: '9' })],
        objectId: 500,
      }),
    ],
    expected:
      'Single card, "You changed the grade of Kante direkt". The change line draws two grade chips, each coloured by its band and labelled through the reader\'s grading scale, so neither side shows the stored id.',
    id: 'ROUTE-02b',
    writer: 'routes.remote.ts:257',
  },
  {
    action: '/routes/500/edit -> Rating -> two stars -> Save (it had none)',
    domain: 'route',
    events: [
      eventAgo(230, {
        actorFk: ME,
        // No `oldValue`: an unrated route stores null, and the form has no way to submit zero
        // stars either, so "not rated" only ever appears on the old side.
        changes: [change({ columnName: 'rating', newValue: '2' })],
        objectId: 500,
      }),
    ],
    expected:
      'Single card, "You changed the rating of Kante direkt", with two rows of stars: an empty one and a two-star one. The missing old value reads as zero stars rather than "Not set", because an unrated route and a route rated zero are the same thing to a reader.',
    id: 'ROUTE-02c',
    writer: 'routes.remote.ts:257',
  },
  {
    action: '/routes/500/edit -> Tags -> add benchmark, drop high -> Save',
    domain: 'route',
    events: [
      eventAgo(225, {
        actorFk: ME,
        // Sorted and comma-joined, exactly as the writer stores them. Uppercase sorts first, which
        // is why SD leads both sides.
        changes: [change({ columnName: 'tags', newValue: 'SD,benchmark', oldValue: 'SD,high' })],
        objectId: 500,
      }),
    ],
    expected:
      'Single card, "You changed the tags of Kante direkt". The change line is the only one with no before/after pair: it lists "Added benchmark" and "Removed high" as two chips, and says nothing about SD, which did not move.',
    id: 'ROUTE-02d',
    writer: 'routes.remote.ts:257',
  },
  {
    action: '/routes/500/edit -> First ascensionists -> add Tomas -> Save',
    domain: 'route',
    events: [
      eventAgo(220, {
        actorFk: ME,
        // Names, not ids: `updateRoute` resolves the links first and diffs the sorted names, so a
        // card can be read without a second lookup.
        changes: [
          change({
            columnName: 'firstAscensionists',
            newValue: 'Mara Lindqvist,Tomas Kessler',
            oldValue: 'Mara Lindqvist',
          }),
        ],
        objectId: 500,
      }),
    ],
    expected:
      'Single card, "You changed the first ascensionists of Kante direkt". Both sides render as chips, one per person, so the reader compares two lists rather than two comma-strings. Nothing marks WHICH name is the new one: Mara appears on both sides unchanged.',
    id: 'ROUTE-02e',
    writer: 'routes.remote.ts:257',
  },
  {
    action: '/routes/500/edit -> First ascent year -> 1987 -> Save (it had none)',
    domain: 'route',
    events: [
      eventAgo(215, {
        actorFk: ME,
        changes: [change({ columnName: 'firstAscentYear', newValue: '1987' })],
        objectId: 500,
      }),
    ],
    expected:
      'Single card, "You changed the first ascent year of Kante direkt", with a plain text pair: an italic "Not set" chip against 1987.',
    id: 'ROUTE-02f',
    writer: 'routes.remote.ts:257',
  },
  {
    action: '/routes/500/edit -> First ascent year -> clear the field -> Save',
    domain: 'route',
    events: [
      eventAgo(210, {
        actorFk: ME,
        changes: [change({ columnName: 'firstAscentYear', oldValue: '1987' })],
        objectId: 500,
      }),
    ],
    expected:
      'Same sentence as setting it, "You changed the first ascent year of Kante direkt": the catalogue keys on the column, not on the direction. Only the change line says which way it went, 1987 against the italic "Not set".',
    id: 'ROUTE-02g',
    writer: 'routes.remote.ts:257',
  },
  {
    action: '/routes/500/edit -> Description -> Save',
    domain: 'route',
    events: [
      eventAgo(205, {
        actorFk: ME,
        changes: [
          change({
            columnName: 'description',
            newValue: 'Steep off the ground, easier above the roof. Brush the crux hold.',
            oldValue: 'Steep off the ground, easier above the roof.',
          }),
        ],
        objectId: 500,
      }),
    ],
    expected:
      'Single card, "You edited the description of Kante direkt". The change line is prose, so it collapses behind a toggle counting the new text\'s characters and expands to a word-level diff rather than two paragraphs side by side.',
    id: 'ROUTE-02h',
    writer: 'routes.remote.ts:257',
  },
  {
    action: '/routes/500/edit -> change every field -> Save (one call, seven columns)',
    domain: 'route',
    events: [
      eventAgo(200, {
        actorFk: ME,
        // One event with seven change rows, in the order `updateRoute` declares its diff.
        changes: [
          change({
            columnName: 'description',
            newValue: 'Steep off the ground, easier above the roof.',
            oldValue: '',
          }),
          change({ columnName: 'firstAscensionists', newValue: 'Mara Lindqvist', oldValue: '' }),
          change({ columnName: 'firstAscentYear', newValue: '1987' }),
          change({ columnName: 'gradeFk', newValue: '11', oldValue: '9' }),
          change({ columnName: 'name', newValue: 'Kante direkt', oldValue: 'Kante' }),
          change({ columnName: 'rating', newValue: '2' }),
          change({ columnName: 'tags', newValue: 'SD,benchmark', oldValue: '' }),
        ],
        objectId: 500,
      }),
    ],
    expected:
      'ONE card, not seven. Each column has its own sentence, so there is no shared one to speak, and the headline drops to "You edited Kante direkt" with a "7 edits" sub line. Every line is still there behind the toggle, each in its own shape: grade chips, stars, tag chips, people chips, two text pairs and the prose toggle.',
    id: 'ROUTE-02i',
    writer: 'routes.remote.ts:257',
  },
  {
    action: 'Change the grade, then change it again within the 15-minute fold window',
    domain: 'route',
    events: [
      eventAgo(190, {
        actorFk: ME,
        // The fold overwrites `new_value` on the open event's row for that column rather than
        // adding a second: 8 to 9 then 9 to 11 is one row, 8 to 11. The 9 was never a state the
        // crag was left in.
        changes: [change({ columnName: 'gradeFk', newValue: '11', oldValue: '8' })],
        objectId: 500,
      }),
    ],
    expected:
      'Still one card with one grade line, showing where the grade STARTED against where it ended. Two cards, or a line reading 9 to 11, would mean the fold is not working.',
    id: 'ROUTE-02j',
    writer: 'routes.remote.ts:257',
  },
  {
    action: 'Change the grade back to where it started inside the window',
    domain: 'route',
    events: [],
    expected:
      'No card at all. The fold deletes a change row that returns to its old value, and an event left holding no changes deletes itself, so the earlier card disappears rather than gaining a second line.',
    id: 'ROUTE-02k',
    writer: 'routes.remote.ts:257',
  },
  {
    action: 'Open the edit form and save without touching anything',
    domain: 'route',
    events: [],
    expected:
      'No card, and no event either: the diff is empty, so `createUpdateEvent` returns before it writes anything. Reserialising a description in the editor does not count as an edit, which is what keeps merely opening a route off the feed.',
    id: 'ROUTE-02l',
    writer: 'routes.remote.ts:257',
  },

  {
    action: '/routes/500 -> More -> Delete route (it has ascents, so the soft path)',
    domain: 'route',
    events: [eventAgo(150, { actorFk: ME, objectId: 500, verb: 'delete' })],
    expected:
      'Single card, "You deleted the route Kante direkt", with no sub line: a route deletion records no scale, unlike an area\'s, because a route has nothing under it to count. The row survives the soft delete, so the name still resolves and the row underneath still draws the route.',
    id: 'ROUTE-03a',
    writer: 'routes.remote.ts:428',
  },
  {
    action: 'A maintainer deletes a route you added',
    domain: 'route',
    events: [eventAgo(145, { actorFk: 3, objectId: 501, verb: 'delete' })],
    expected:
      'Third person, "Sofia Brandt deleted the route Riss". The card names who deleted it and never whose route it was: unlike an ascent deletion, nothing about the author is stored, because a route belongs to the region rather than to the person who added it.',
    id: 'ROUTE-03b',
    writer: 'routes.remote.ts:428',
  },
  {
    action: 'Delete two routes off one block in one sitting',
    domain: 'route',
    events: [
      eventAgo(140, { actorFk: ME, objectId: 501, verb: 'delete' }),
      eventAgo(143, { actorFk: ME, objectId: 500, verb: 'delete' }),
    ],
    expected:
      'One removal card, "You deleted entries", with "2 deletions" and Nordblock as its sub line and both routes as rows. Deliberately NOT folded into an edit burst on the same block: a deletion is the one thing a reader must not have to infer from a card about edits.',
    id: 'ROUTE-03c',
    writer: 'routes.remote.ts:428',
  },
  {
    action: 'A deletion whose route cannot be resolved (an orphan the backfill left behind)',
    domain: 'route',
    events: [eventAgo(135, { actorFk: ME, entity: undefined, objectId: 599, verb: 'delete' })],
    expected:
      'The honest degraded state: "You deleted the route" with the unnamed placeholder, and a tombstone row. A route delete stores no name of its own, and its catalogue entry declares a tombstone column, so the headline does not fall back to the block it sat on the way an ascent deletion falls back to its route. An area deletion degrades exactly the same way. Not reachable through the app, since the soft delete keeps the row readable.',
    id: 'ROUTE-03d',
    writer: 'routes.remote.ts:428',
  },

  {
    action: 'Delete a route added less than 15 minutes ago, with no ascents, files or topo lines',
    domain: 'route',
    events: [],
    expected:
      'No card, and the create card is gone too: inside the grace window a bare route is hard-deleted, `events.route_fk on delete cascade` takes its whole log with it, and the insert at :428 is skipped because writing an event either side of the delete would abort or cascade away. A mistake leaves no trace.',
    id: 'ROUTE-04a',
    writer: 'routes.remote.ts:350',
  },

  {
    action: 'Undo a soft deletion, from the toast',
    domain: 'route',
    events: [],
    expected:
      "No card, and the deletion card disappears: `deleteEvent` removes the event the delete wrote rather than logging a second action. The route's own create and every edit ever made to it still point at this id and stay exactly where they were.",
    id: 'ROUTE-05a',
    writer: 'routes.remote.ts:537',
  },
  {
    action: 'Undo a hard deletion (the grace-window one), from the toast',
    domain: 'route',
    events: [],
    expected:
      'No card at all, and none comes back either. The restore inserts a brand new route row and writes no event, so the route returns with an empty history: nothing to move onto the new id, because the cascade took the old one. A reader sees a route that has always been there and was never added by anybody.',
    id: 'ROUTE-05b',
    writer: 'routes.remote.ts:525',
  },
]
