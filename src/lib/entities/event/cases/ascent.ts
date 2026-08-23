/**
 * Every card an action on an ASCENT can produce.
 *
 * Three write sites, and each of them bends the shared rules a little. A create is the one family
 * whose sentence is keyed on a VALUE (the ascent type) rather than a column, so four types are four
 * cases. An update is the opposite: all seven columns share one sentence, so what a case here
 * changes is the change line, not the headline. And a delete only writes at all when the actor is
 * not the climber, which makes two of that sentence's six arms unreachable.
 *
 * Same contract as `area.ts`. Where the answer depends on something the fixture cannot state (a
 * grade chip needs the region's grade list, a temperature needs the reader's units), the claim
 * says so rather than inventing the output.
 */
import { stringifyDeletedAscent } from '../verbs'
import type { EventCase } from './types'
import { ascentEntity, change, eventAgo, ME, PEOPLE, utcDay } from './world'

/**
 * The `YYYY-MM-DD` the form submits and the `date` column stores.
 *
 * Fixed dates rather than "n days back", unlike every other clock on this wall: these two are the
 * only values a snapshot records verbatim, so deriving them from today rewrote the wall at every
 * midnight and failed the run that crossed one. What the case claims is how a stored calendar date
 * is read and formatted, which any date demonstrates.
 */
const day = (index: 0 | 1 | 2 | 3) => ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04'][index]

export const ASCENT_CASES: EventCase[] = [
  {
    action: '/routes/500 -> Log ascent -> Flash -> Save',
    domain: 'ascent',
    events: [eventAgo(420, { actorFk: ME, objectId: 9001, objectType: 'ascent', verb: 'create' })],
    expected:
      'Single card, "You flashed Rampe", with the flash glyph on the route row. The type is not on the event: `line.ts` reads it back off the resolved ascent and the catalogue keys the sentence on it, which is why this family has four entries and not one.',
    id: 'ASCENT-01a',
    writer: 'ascents.remote.ts:69',
  },
  {
    action: '/routes/501 -> Log ascent -> Redpoint -> Save',
    domain: 'ascent',
    events: [
      eventAgo(415, {
        actorFk: ME,
        entity: ascentEntity('Riss', 15, ME, 'redpoint'),
        objectId: 9003,
        objectType: 'ascent',
        parent: { id: 501, type: 'route' },
        verb: 'create',
      }),
    ],
    expected: 'Same write, different type, different verb: "You redpointed Riss".',
    id: 'ASCENT-01b',
    writer: 'ascents.remote.ts:69',
  },
  {
    action: '/routes/502 -> Log ascent -> Repeat -> Save',
    domain: 'ascent',
    events: [
      eventAgo(410, {
        actorFk: ME,
        entity: ascentEntity('Dach', 14, ME, 'repeat'),
        objectId: 9004,
        objectType: 'ascent',
        parent: { id: 502, type: 'route' },
        verb: 'create',
      }),
    ],
    expected: '"You repeated Dach". A repeat is a send like the two above, and reads as one.',
    id: 'ASCENT-01c',
    writer: 'ascents.remote.ts:69',
  },
  {
    action: '/routes/503 -> Log ascent -> Attempt -> Save',
    domain: 'ascent',
    events: [
      eventAgo(405, {
        actorFk: ME,
        entity: ascentEntity('Platte', 8, ME, 'attempt'),
        objectId: 9005,
        objectType: 'ascent',
        parent: { id: 503, type: 'route' },
        verb: 'create',
      }),
    ],
    expected:
      '"You attempted Platte". The fourth type is not a send, and the card says so in the verb and in the glyph rather than in a note somewhere.',
    id: 'ASCENT-01d',
    writer: 'ascents.remote.ts:69',
  },
  {
    action: 'Somebody else logs an ascent, seen from your feed',
    domain: 'ascent',
    events: [eventAgo(400, { actorFk: 3, objectId: 9002, objectType: 'ascent', verb: 'create' })],
    expected:
      'Third person, "Sofia Brandt redpointed Kante". A create names nobody but the actor: the climber and the actor are the same person here, and there is no sentence arm that could say otherwise.',
    id: 'ASCENT-01e',
    writer: 'ascents.remote.ts:69',
  },
  {
    action: '/routes/500 -> Log ascent -> Flash, plus your grade, stars, conditions and notes -> Save',
    domain: 'ascent',
    events: [
      eventAgo(395, {
        actorFk: ME,
        entity: ascentEntity('Kante direkt', 11, ME, 'flash', {
          ascentGradeFk: 13,
          ascentRating: 3,
          humidity: 45,
          note: 'Cold hands on the start, then it went first go.',
          temperature: 9,
        }),
        objectId: 9006,
        objectType: 'ascent',
        parent: { id: 500, type: 'route' },
        verb: 'create',
      }),
    ],
    expected:
      'Still one sentence, "You flashed Kante direkt", with what the ascent was logged with under its own row: your grade and stars behind the Opinion label (the row itself carries the community numbers, which is what the label tells them apart from), then the conditions pill outside that label, since a temperature is a reading rather than a take on the climb, then the note. None of it is a change line, because a create writes no change rows; the card reads it off the ascent.',
    id: 'ASCENT-01f',
    writer: 'ascents.remote.ts:69',
  },
  {
    action: 'Log an ascent you climbed four days ago (the date field, backdated)',
    domain: 'ascent',
    events: [
      eventAgo(390, {
        actorFk: ME,
        entity: ascentEntity('Dach', 14, ME, 'redpoint', { climbedAt: utcDay(4) }),
        objectId: 9007,
        objectType: 'ascent',
        parent: { id: 502, type: 'route' },
        verb: 'create',
      }),
    ],
    expected:
      'Single card, "You redpointed Dach", dated by when it was LOGGED, with the climb date called out separately because the two fall on different calendar days. Compared as calendar days rather than as elapsed time, so a genuine one-day backdate still shows and an evening log does not.',
    id: 'ASCENT-01g',
    writer: 'ascents.remote.ts:69',
  },
  {
    action: 'Log two ascents in one sitting, minutes apart',
    domain: 'ascent',
    events: [
      eventAgo(383, {
        actorFk: ME,
        entity: ascentEntity('Riss', 15, ME, 'redpoint'),
        objectId: 9008,
        objectType: 'ascent',
        parent: { id: 501, type: 'route' },
        verb: 'create',
      }),
      eventAgo(385, { actorFk: ME, objectId: 9001, objectType: 'ascent', verb: 'create' }),
    ],
    expected:
      'ONE session card, "You logged a session", with "2 ascents" as the sub line and both routes as rows. No place is named, because the two ascents hang off different routes and the card only names a place its whole window agrees on. A session folds more readily than anything else: same day is enough, so this stays one card even hours apart, as long as the calendar day holds.',
    id: 'ASCENT-01h',
    writer: 'ascents.remote.ts:69',
  },
  {
    action: 'A create whose ascent does not resolve (the degraded state)',
    domain: 'ascent',
    events: [
      eventAgo(380, {
        actorFk: ME,
        entity: undefined,
        objectId: 9009,
        objectType: 'ascent',
        parent: undefined,
        verb: 'create',
      }),
    ],
    expected:
      'The vaguer sentence, "You logged an ascent of Unnamed", with no status glyph and a tombstone row. This is the ONLY way to reach `event_ascentCreated`: the type that scopes the four real sentences is read off the resolved ascent, so a create with nothing to read from falls through to the degraded key. Not reachable while `events.ascent_fk` holds, since it cascades; this is what the card degrades to if the relation ever arrives empty.',
    id: 'ASCENT-01i',
    writer: 'ascents.remote.ts:69',
  },

  {
    action: '/ascents/9001/edit -> Date -> Save',
    domain: 'ascent',
    events: [
      eventAgo(360, {
        actorFk: ME,
        changes: [change({ columnName: 'dateTime', newValue: day(1), oldValue: day(0) })],
        objectId: 9001,
        objectType: 'ascent',
      }),
    ],
    expected:
      'Single card, "You edited your ascent of Rampe", with one change line labelled Date. Both chips are the stored `YYYY-MM-DD` read as a calendar day and formatted in the reader\'s locale, not as an instant, which is what keeps a date off the day before west of Greenwich.',
    id: 'ASCENT-02a',
    writer: 'ascents.remote.ts:117',
  },
  {
    action: '/ascents/9001/edit -> Your grade -> Save',
    domain: 'ascent',
    events: [
      eventAgo(355, {
        actorFk: ME,
        changes: [change({ columnName: 'gradeFk', newValue: '12', oldValue: '10' })],
        objectId: 9001,
        objectType: 'ascent',
      }),
    ],
    expected:
      'Same headline, "You edited your ascent of Rampe": every ascent column shares one sentence, and the expanded half is what says which one moved. The line is a Grade pair, drawn as two grade chips resolved through the region\'s grading scale rather than as the stored ids. Clearing the grade instead stores null and the chip reads Not set.',
    id: 'ASCENT-02b',
    writer: 'ascents.remote.ts:117',
  },
  {
    action: '/ascents/9010/edit -> Type: Attempt to Redpoint -> Save',
    domain: 'ascent',
    events: [
      eventAgo(350, {
        actorFk: ME,
        changes: [change({ columnName: 'type', newValue: 'redpoint', oldValue: 'attempt' })],
        entity: ascentEntity('Platte', 8, ME, 'redpoint'),
        objectId: 9010,
        objectType: 'ascent',
        parent: { id: 503, type: 'route' },
      }),
    ],
    expected:
      'One Type line under "You edited your ascent of Platte", drawn as the same glyph and word the log form\'s type picker offers: the attempt ring, then the redpoint tick. Its own change kind rather than a text pair, because the column stores `attempt` and `redpoint` and printing those put an English enum member under a German headline. A value that is no longer one of the four (a row written before `send` became `redpoint`) has no glyph and falls back to a plain chip of what was stored. The row beside it shows the glyph for the type the ascent ended up with.',
    id: 'ASCENT-02c',
    writer: 'ascents.remote.ts:117',
  },
  {
    action: '/ascents/9001/edit -> Stars -> Save',
    domain: 'ascent',
    events: [
      eventAgo(345, {
        actorFk: ME,
        changes: [change({ columnName: 'rating', newValue: '3', oldValue: '2' })],
        objectId: 9001,
        objectType: 'ascent',
      }),
    ],
    expected:
      'One Rating line, drawn as two rows of stars. An unset rating coerces to zero stars rather than to Not set, since a reader cannot tell an unrated route from one rated nothing and an empty row of stars says both.',
    id: 'ASCENT-02d',
    writer: 'ascents.remote.ts:117',
  },
  {
    action: '/ascents/9001/edit -> Notes -> Save',
    domain: 'ascent',
    events: [
      eventAgo(340, {
        actorFk: ME,
        changes: [
          change({
            columnName: 'notes',
            newValue: 'Slippery in the crux. Chalk the second pocket.',
            oldValue: 'Slippery in the crux.',
          }),
        ],
        objectId: 9001,
        objectType: 'ascent',
      }),
    ],
    expected:
      'One Notes line. Prose, like an area description, so it collapses behind a Compare toggle with a word level diff instead of showing two chips side by side. Saving the editor untouched reserialises with a trailing newline, which the diff deliberately does not count as an edit.',
    id: 'ASCENT-02e',
    writer: 'ascents.remote.ts:117',
  },
  {
    action: '/ascents/9001/edit -> Conditions -> Temperature -> Save',
    domain: 'ascent',
    events: [
      eventAgo(335, {
        actorFk: ME,
        changes: [change({ columnName: 'temperature', newValue: '12', oldValue: '18' })],
        objectId: 9001,
        objectType: 'ascent',
      }),
    ],
    expected:
      "One Temperature line. The column stores Celsius and the chips are formatted through the reader's unit preference, so the same event reads in Fahrenheit for a reader who set that.",
    id: 'ASCENT-02f',
    writer: 'ascents.remote.ts:117',
  },
  {
    action: '/ascents/9001/edit -> Conditions -> Humidity -> Save',
    domain: 'ascent',
    events: [
      eventAgo(330, {
        actorFk: ME,
        changes: [change({ columnName: 'humidity', newValue: '65', oldValue: '40' })],
        objectId: 9001,
        objectType: 'ascent',
      }),
    ],
    expected:
      'One Humidity line, the other half of the conditions pill, formatted as a percentage. Same headline again: seven columns, one sentence.',
    id: 'ASCENT-02g',
    writer: 'ascents.remote.ts:117',
  },
  {
    action: '/ascents/9001/edit -> change all seven fields -> Save (one call, seven columns)',
    domain: 'ascent',
    events: [
      eventAgo(325, {
        actorFk: ME,
        changes: [
          change({ columnName: 'dateTime', newValue: day(3), oldValue: day(2) }),
          change({ columnName: 'gradeFk', newValue: '13', oldValue: '11' }),
          change({ columnName: 'humidity', newValue: '55', oldValue: '35' }),
          change({ columnName: 'notes', newValue: 'Went second go, low crux.', oldValue: 'Went first go.' }),
          change({ columnName: 'rating', newValue: '3', oldValue: '1' }),
          change({ columnName: 'temperature', newValue: '11', oldValue: '20' }),
          change({ columnName: 'type', newValue: 'redpoint', oldValue: 'flash' }),
        ],
        objectId: 9001,
        objectType: 'ascent',
      }),
    ],
    expected:
      'ONE card with seven change lines. Unlike an area, the headline does NOT drop to the generic "You edited Rampe": all seven columns resolve the same key, so the shared sentence survives and the card still says "You edited your ascent of Rampe", with "7 edits" as the sub line. One write, seven rows, in the order the diff declares them.',
    id: 'ASCENT-02h',
    writer: 'ascents.remote.ts:117',
  },
  {
    action: "A maintainer opens somebody else's log and corrects it",
    domain: 'ascent',
    events: [
      eventAgo(320, {
        actorFk: ME,
        changes: [change({ columnName: 'gradeFk', newValue: '9', oldValue: '11' })],
        objectId: 9002,
        objectType: 'ascent',
      }),
    ],
    expected:
      'The sentence names whose log it was: "You edited Sofia Brandt\'s ascent of Kante". The climber comes off the resolved ascent, and the owner slot is decided against the ACTOR, so this is the arm that separates an edit of your own from an edit of somebody else\'s. The climber is also notified, which an edit of your own is not.',
    id: 'ASCENT-02i',
    writer: 'ascents.remote.ts:117',
  },
  {
    action: 'Somebody else corrects YOUR ascent, seen from your feed',
    domain: 'ascent',
    events: [
      eventAgo(315, {
        actorFk: 3,
        changes: [change({ columnName: 'rating', newValue: '1', oldValue: '3' })],
        objectId: 9001,
        objectType: 'ascent',
      }),
    ],
    expected:
      '"Sofia Brandt edited Ada Rossi\'s ascent of Rampe", read by Ada Rossi. The card names the reader in the third person rather than saying "your ascent": the owner slot compares the climber against the actor, never against the reader, and only the actor slot knows who is looking. Worth deciding on: the reader is the one person on this card who does not need telling whose ascent it is.',
    id: 'ASCENT-02j',
    writer: 'ascents.remote.ts:117',
  },
  {
    action: 'Edit the stars, then edit them again within the 15-minute fold window',
    domain: 'ascent',
    events: [
      eventAgo(310, {
        actorFk: ME,
        // The second save merges onto the open event's existing row for that column, keeping where
        // it started and taking where it ended. Two saves, one line, never an intermediate.
        changes: [change({ columnName: 'rating', newValue: '3', oldValue: '1' })],
        objectId: 9001,
        objectType: 'ascent',
      }),
    ],
    expected:
      'Still one card with one Rating line, showing the ORIGINAL old value against the LATEST new one. Two cards, or two lines, would mean the fold is not working. The event also floats back to the top of the feed on the second save.',
    id: 'ASCENT-02k',
    writer: 'ascents.remote.ts:117',
  },
  {
    action: 'Edit the stars back to where they started, inside the window',
    domain: 'ascent',
    events: [],
    expected:
      'No card at all. The change row is deleted once it ends where it began, and an update event left holding no rows deletes itself. The climber is still notified, though: a save that moved something and then moved it back is an edit somebody made.',
    id: 'ASCENT-02l',
    writer: 'ascents.remote.ts:117',
  },
  {
    action: 'Open the edit form and save without touching anything',
    domain: 'ascent',
    events: [],
    expected:
      'No card, and no event row either: the diff is empty, so the writer returns before it opens one. Different from the case above, which opens an event and then deletes it. This one also announces nothing, which is the point: without the guard an empty save would take the (actor, ascent, kind) slot in the notification index and swallow the real edit that followed it.',
    id: 'ASCENT-02m',
    writer: 'ascents.remote.ts:117',
  },
  {
    action: 'Log an ascent, then correct its grade a minute later',
    domain: 'ascent',
    events: [
      eventAgo(300, {
        actorFk: ME,
        // The edit joins the open CREATE rather than opening an update of its own, and the verb is
        // deliberately not overwritten. The change row is written, and then dropped on the way to
        // the card: only an `update` expands into one row per column.
        changes: [change({ columnName: 'gradeFk', newValue: '13', oldValue: '11' })],
        entity: ascentEntity('Rampe', 12, ME, 'flash', { ascentGradeFk: 13 }),
        objectId: 9001,
        objectType: 'ascent',
        verb: 'create',
      }),
    ],
    expected:
      'ONE card, still "You flashed Rampe", refloated to the time of the correction. NO change line: the row exists in the database, but a create is one catalogue row whatever it carries, so the card never expands it. The corrected grade shows only as "Opinion 7A" under the route row, read off the ascent as it stands now, which is why the label has to say whose grade that is: the row beside it carries the community one.',
    id: 'ASCENT-02n',
    writer: 'ascents.remote.ts:117',
  },

  {
    action: '/ascents/9001 -> Delete -> Confirm (your own, logged more than 15 minutes ago)',
    domain: 'ascent',
    events: [
      eventAgo(300, {
        actorFk: ME,
        metadata: stringifyDeletedAscent({ climberFk: ME, climberName: PEOPLE[ME] }),
        objectId: 9001,
        objectType: 'ascent',
        verb: 'delete',
      }),
    ],
    expected:
      'Single card, "You deleted your ascent of Rampe". Past the grace window the ascent soft-deletes and its create event stays, so the "You flashed Rampe" card is still on the feed: without this one the log would show a send that no longer exists and nothing would ever correct it. Inside the window there is no card at all, because the cascade takes the create with it.',
    id: 'ASCENT-03a',
    writer: 'ascents.remote.ts:241',
  },
  {
    action: "A maintainer deletes somebody else's ascent, logged more than 15 minutes ago",
    domain: 'ascent',
    events: [
      eventAgo(240, {
        actorFk: ME,
        metadata: stringifyDeletedAscent({ climberFk: 3, climberName: PEOPLE[3] }),
        objectId: 9002,
        objectType: 'ascent',
        verb: 'delete',
      }),
    ],
    expected:
      'Single card, "You removed Sofia Brandt\'s ascent of Kante". The row is a LIVE route row, not a tombstone: a soft-deleted ascent is still synced by the feed query, which filters no `deletedAt`, so the card can still show what was removed. There is no undo here and no toast offering one, so nothing ever deletes this event again.',
    id: 'ASCENT-03b',
    writer: 'ascents.remote.ts:248',
  },
  {
    action: 'Delete your own ascent within 15 minutes of logging it (the grace window)',
    domain: 'ascent',
    events: [],
    expected:
      "No card, and the create card is gone too: inside the window the ascent is hard-deleted and its events cascade away with it, media rows included. A mistake leaves no trace. Reacting to the create card closes the window, because somebody else's words are not part of the mistake.",
    id: 'ASCENT-03c',
    writer: 'ascents.remote.ts:219',
  },
  {
    action: "A maintainer deletes somebody else's ascent within 15 minutes of them logging it",
    domain: 'ascent',
    events: [],
    expected:
      "No card, and the climber's own create card disappears from the feed. The grace window asks how OLD the row is and whether anybody responded, never who is deleting it, and the delete event is written only for the rows that survive as tombstones. The climber is still notified, so the only record of it is in their inbox. Worth deciding on: this is the one path where one person can erase another person's log with nothing left on the feed.",
    id: 'ASCENT-03d',
    writer: 'ascents.remote.ts:219',
  },
  {
    action: 'Somebody else deletes YOUR ascent, seen from your feed',
    domain: 'ascent',
    events: [
      eventAgo(235, {
        actorFk: 3,
        metadata: stringifyDeletedAscent({ climberFk: ME, climberName: PEOPLE[ME] }),
        objectId: 9001,
        objectType: 'ascent',
        verb: 'delete',
      }),
    ],
    expected:
      '"Sofia Brandt removed Ada Rossi\'s ascent of Rampe", read by Ada Rossi. Same third-person naming as the edit case: the sentence has an arm for the actor removing their own ascent, but none for the reader\'s. Note that two of the six arms of this sentence are unreachable in the app at all, since the writer only logs a delete when the actor is NOT the climber.',
    id: 'ASCENT-03e',
    writer: 'ascents.remote.ts:248',
  },
  {
    action: 'A deletion whose climber has no readable user row (metadata is null)',
    domain: 'ascent',
    events: [
      eventAgo(230, {
        actorFk: ME,
        metadata: undefined,
        objectId: 9002,
        objectType: 'ascent',
        verb: 'delete',
      }),
    ],
    expected:
      'Still "You removed Sofia Brandt\'s ascent of Kante". The name lookup failed and the writer stored no metadata, but the soft-deleted ascent itself resolves and carries both the climber and their name, so the card loses nothing. The metadata is belt and braces for as long as that stays true.',
    id: 'ASCENT-03f',
    writer: 'ascents.remote.ts:248',
  },
  {
    action: 'A deletion whose ascent no longer resolves, with the climber written down',
    domain: 'ascent',
    events: [
      eventAgo(225, {
        actorFk: ME,
        entity: undefined,
        metadata: stringifyDeletedAscent({ climberFk: 3, climberName: PEOPLE[3] }),
        objectId: 9011,
        objectType: 'ascent',
        parent: undefined,
        verb: 'delete',
      }),
    ],
    expected:
      'The metadata is now the only source: "You removed Sofia Brandt\'s ascent of Unnamed", with a tombstone row. The name of the ROUTE is lost, because a delete event stores none and the parent is read off the ascent that is no longer there, but the one thing a card about somebody else\'s log must not get wrong is still right. This is the state the fallback was written for.',
    id: 'ASCENT-03g',
    writer: 'ascents.remote.ts:248',
  },
  {
    action: 'A deletion with neither an ascent nor metadata (fully degraded)',
    domain: 'ascent',
    events: [
      eventAgo(220, {
        actorFk: ME,
        entity: undefined,
        metadata: undefined,
        objectId: 9012,
        objectType: 'ascent',
        parent: undefined,
        verb: 'delete',
      }),
    ],
    expected:
      'The honest floor: "You removed an ascent of Unnamed". Nothing is left to say whose it was, so the sentence takes its no-owner arm rather than guessing. Only reachable when both halves fail at once, which is why the writer records the climber even though the row usually survives.',
    id: 'ASCENT-03h',
    writer: 'ascents.remote.ts:248',
  },
]
