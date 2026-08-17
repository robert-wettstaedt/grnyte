/**
 * Every card an action on a BLOCK can produce.
 *
 * Six write sites, five of which are about one column: a block is a name and a pin, and the pin can
 * be set from three different screens (the edit form, the map picker, and a topo photo's GPS). Each
 * case names the site it stands for, states the events that site emits, and claims what the card
 * says. The claim is derived by reading the code, so it is what is under review, never the oracle.
 *
 * NOT here: the topo. `block:updated:topo` and `block:deleted:topo` are events about a block, but
 * they are written by the topo mutations and belong to that domain's file.
 *
 * Two things to keep in mind while reading. A block groups as a `burst` on its AREA, so every block
 * event by one person in one area within half an hour lands on one card; and the server fold key is
 * `(actor, object, region, metadata)` with the verb left out, so two different screens editing one
 * block minutes apart write ONE event with two change rows.
 */
import { stringifyCoords } from '$lib/map/coords'
import { stringifyDeletionScale } from '../verbs'
import type { EventCase } from './types'
import { blockEntity, change, eventAgo, ME, PIN } from './world'

/**
 * A second pin, a nudge from {@link PIN}, for the changes that have to show a pin MOVING.
 *
 * About 70 m apart, which is what the "Moved" caption reads out. The world holds one pin on purpose,
 * so this is deliberately close enough to read as the same block rather than as a second place.
 */
const NUDGED = { lat: PIN.lat + 0.00045, long: PIN.long + 0.0006 }

export const BLOCK_CASES: EventCase[] = [
  {
    action: '/areas/301 -> More -> Add block -> name -> Set location on the map -> Create block',
    domain: 'block',
    events: [
      eventAgo(470, {
        actorFk: ME,
        entity: blockEntity('Nordblock', false),
        objectId: 400,
        objectType: 'block',
        verb: 'create',
      }),
    ],
    expected:
      'Single card, "You added the block Nordblock", with a map thumbnail of the pin. A create declares no column, so no change line; the map is the one thing a create card adds, and it draws the pin as it stands TODAY rather than the coordinates the create was made with, which it never stored.',
    id: 'BLOCK-01a',
    writer: 'blocks.remote.ts:96',
  },
  {
    action: 'Same, with the "rough guess" toggle left on',
    domain: 'block',
    events: [
      eventAgo(465, {
        actorFk: ME,
        entity: blockEntity('Nordblock', true),
        objectId: 400,
        objectType: 'block',
        verb: 'create',
      }),
    ],
    expected:
      'The same sentence. Only the thumbnail differs: an estimated pin is drawn dashed, the way the real map draws one, which is the reader\'s cue that the block page will be showing its "confirm the spot" banner.',
    id: 'BLOCK-01b',
    writer: 'blocks.remote.ts:96',
  },
  {
    action: 'Add a block, skip the location, answer the confirm dialog with "Save anyway"',
    domain: 'block',
    events: [
      eventAgo(460, {
        actorFk: ME,
        entity: blockEntity('Nordblock'),
        objectId: 400,
        objectType: 'block',
        verb: 'create',
      }),
    ],
    expected:
      'Same headline, no map at all. The pin is read off the block rather than off the event, so a block with none renders the card with nothing where the thumbnail would be.',
    id: 'BLOCK-01c',
    writer: 'blocks.remote.ts:96',
  },
  {
    action: 'Add a block and leave the name empty (blank names are allowed, unlike duplicates)',
    domain: 'block',
    events: [
      eventAgo(455, {
        actorFk: ME,
        // Already through `blockName`: the mapper swaps a blank name for "Block {order + 1}" before
        // any card sees it, so a fixture passing '' would describe a state the app cannot produce.
        entity: blockEntity('Block 3', false),
        objectId: 400,
        objectType: 'block',
        verb: 'create',
      }),
    ],
    expected:
      '"You added the block Block 3". The positional fallback, not the unnamed placeholder: nameless blocks are normal, so the card names it the way every other screen does.',
    id: 'BLOCK-01d',
    writer: 'blocks.remote.ts:96',
  },

  {
    action: '/blocks/400/edit -> Name -> Save',
    domain: 'block',
    events: [
      eventAgo(430, {
        actorFk: ME,
        changes: [change({ columnName: 'name', newValue: 'Nordblock', oldValue: 'Nordwand' })],
        objectId: 400,
        objectType: 'block',
      }),
    ],
    expected:
      'Single card, "You renamed Nordblock", with one change line: Nordwand to Nordblock. The form resubmits the current pin on every save, and the diff drops it because it did not move, so a rename writes one row rather than two.',
    id: 'BLOCK-02a',
    writer: 'blocks.remote.ts:182',
  },
  {
    action: '/blocks/400/edit -> the location field -> pick a new spot on the map -> Save',
    domain: 'block',
    events: [
      eventAgo(425, {
        actorFk: ME,
        changes: [
          change({ columnName: 'location', newValue: stringifyCoords(NUDGED), oldValue: stringifyCoords(PIN) }),
        ],
        objectId: 400,
        objectType: 'block',
      }),
    ],
    expected:
      'Single card, "You updated the location of Nordblock". The change line draws both pins on one thumbnail, the old one faded, captioned with how far it moved (about 70 m here). No approach path: only areas carry those, so a block\'s location line is a bare map.',
    id: 'BLOCK-02b',
    writer: 'blocks.remote.ts:182',
  },
  {
    action: '/blocks/400/edit on a block with no pin -> Use current location -> Save',
    domain: 'block',
    events: [
      eventAgo(420, {
        actorFk: ME,
        changes: [change({ columnName: 'location', newValue: stringifyCoords(PIN) })],
        objectId: 400,
        objectType: 'block',
      }),
    ],
    expected:
      'Same headline, different caption: with nothing on the old side the line reads "Pin added" and draws one pin. The device fix is stored unflagged, so the pin is solid rather than dashed.',
    id: 'BLOCK-02c',
    writer: 'blocks.remote.ts:182',
  },
  {
    action: 'Block page -> the "Approximate location" banner -> /blocks/400/edit -> untick "rough guess" -> Save',
    domain: 'block',
    events: [
      eventAgo(415, {
        actorFk: ME,
        // Same coordinates on both sides. Only the leading `~` moved, which is the whole edit: the
        // banner links to the form rather than to the picker precisely because moving a pin is not
        // the same as vouching for one.
        changes: [
          change({ columnName: 'location', newValue: stringifyCoords(PIN), oldValue: stringifyCoords(PIN, true) }),
        ],
        objectId: 400,
        objectType: 'block',
      }),
    ],
    expected:
      'Single card, "You updated the location of Nordblock", captioned "Approximate pin confirmed". A pin that did not move must not say "Moved 0 m", and the chip that marks a pin approximate keys on the new side, so it is gone here.',
    id: 'BLOCK-02d',
    writer: 'blocks.remote.ts:182',
  },
  {
    action: '/blocks/400/edit -> the location field -> Remove -> Save',
    domain: 'block',
    events: [
      eventAgo(410, {
        actorFk: ME,
        changes: [change({ columnName: 'location', oldValue: stringifyCoords(PIN) })],
        objectId: 400,
        objectType: 'block',
      }),
    ],
    expected:
      'Single card, "You removed the location of Nordblock", captioned "Location removed", with the old pin drawn as gone. The form writes verb `update` whatever the pin did, so what reaches the cleared sentence is the VALUE going away: the catalogue holds one entry marked `cleared` and the lookup tries it first. It read "You updated the location" until then, which a reader takes as still pinned.',
    id: 'BLOCK-02e',
    writer: 'blocks.remote.ts:182',
  },
  {
    action: 'A block pin cleared BEFORE the events cutover, as the backfill migrated it',
    domain: 'block',
    events: [
      eventAgo(183, {
        actorFk: ME,
        metadata: '47.123456,8.567890',
        objectId: 400,
        objectType: 'block',
        verb: 'remove',
      }),
    ],
    expected:
      'The same card as BLOCK-02e, "You removed the location of Nordblock", from the shape history carries: the backfill mapped a deleted row with a column to `remove` and kept the coordinates in metadata, where the live form is an update whose value went away. Without the second entry this read "made a change to Nordblock", and the coordinates are what tell it apart from a removed photo.',
    id: 'BLOCK-02j',
    writer: null,
  },
  {
    action: '/blocks/400/edit -> rename AND move the pin -> Save (one submit, two columns)',
    domain: 'block',
    events: [
      eventAgo(405, {
        actorFk: ME,
        // The order the writer diffs them in: `createUpdateEvent` walks the keys of
        // `{ location, name }`, and the rows are read back in the order they were written.
        changes: [
          change({ columnName: 'location', newValue: stringifyCoords(NUDGED), oldValue: stringifyCoords(PIN) }),
          change({ columnName: 'name', newValue: 'Nordblock', oldValue: 'Nordwand' }),
        ],
        objectId: 400,
        objectType: 'block',
      }),
    ],
    expected:
      'ONE card, not two: one event with two change rows. Neither sentence can speak for the other, so the headline drops to the shared "You edited Nordblock" with a "2 edits" sub line, and both lines (Location, then Name) sit behind the card\'s "Show changes" toggle. Not a Compare toggle: that one is the prose diff\'s own control, and neither a location nor a name line has one.',
    id: 'BLOCK-02f',
    writer: 'blocks.remote.ts:182',
  },
  {
    action: 'Rename, notice the typo, rename again inside the 15-minute fold window',
    domain: 'block',
    events: [
      eventAgo(400, {
        actorFk: ME,
        // The fold overwrites `new_value` on the open event's existing row rather than adding a
        // second: the card shows where the name ended up, not the path it took.
        changes: [change({ columnName: 'name', newValue: 'Nordblock', oldValue: 'Nordwand' })],
        objectId: 400,
        objectType: 'block',
      }),
    ],
    expected:
      'Still one card with one line, showing the ORIGINAL old value against the LATEST new one. Two cards here would mean the fold is not working. The card dates from the second save: joining an open event bumps its timestamp so it returns to the top of the feed.',
    id: 'BLOCK-02g',
    writer: 'blocks.remote.ts:182',
  },
  {
    action: 'Rename the block back to what it was called, inside the window',
    domain: 'block',
    events: [],
    expected:
      'No card at all. The fold deletes a change row that returns to its old value, and an `update` left holding no changes deletes itself, reactions permitting.',
    id: 'BLOCK-02h',
    writer: 'blocks.remote.ts:182',
  },
  {
    action: '/blocks/400/edit -> Save without touching anything',
    domain: 'block',
    events: [],
    expected:
      'Nothing written, so no card and no refloat of whatever card is already there. Worth stating because the form POSTS both columns every time: the name and the pin it resubmits are compared before anything is logged, so an accidental save is not an edit.',
    id: 'BLOCK-02i',
    writer: 'blocks.remote.ts:182',
  },

  {
    action: 'Block page -> More -> Move on the map -> drag the pin -> Done',
    domain: 'block',
    events: [
      eventAgo(380, {
        actorFk: ME,
        changes: [
          change({ columnName: 'location', newValue: stringifyCoords(NUDGED), oldValue: stringifyCoords(PIN) }),
        ],
        objectId: 400,
        objectType: 'block',
      }),
    ],
    expected:
      'Indistinguishable from the same move made in the edit form (BLOCK-02b): "You updated the location of Nordblock", captioned with the distance. Two screens, one sentence, which is right here since the reader did the same thing.',
    id: 'BLOCK-03a',
    writer: 'blocks.remote.ts:221',
  },
  {
    action: 'Block page with no pin -> "Add location" -> place the pin -> Done',
    domain: 'block',
    events: [
      eventAgo(375, {
        actorFk: ME,
        changes: [change({ columnName: 'location', newValue: stringifyCoords(PIN) })],
        objectId: 400,
        objectType: 'block',
      }),
    ],
    expected:
      '"Pin added", solid rather than dashed: the picker never sets the rough-guess flag, so a first pin placed here is a claim rather than a guess.',
    id: 'BLOCK-03b',
    writer: 'blocks.remote.ts:221',
  },
  {
    action: 'Move an estimated pin on the map (the block was pinned from a photo, see BLOCK-04a)',
    domain: 'block',
    events: [
      eventAgo(370, {
        actorFk: ME,
        // Estimated on BOTH sides. The picker carries the existing flag over rather than clearing
        // it: dragging a guess is a better guess, not a confirmation.
        changes: [
          change({
            columnName: 'location',
            newValue: stringifyCoords(NUDGED, true),
            oldValue: stringifyCoords(PIN, true),
          }),
        ],
        objectId: 400,
        objectType: 'block',
      }),
    ],
    expected:
      'Captioned "Moved", with the approximate chip still on it, and the block keeps its warning banner. Compare BLOCK-02d: only the form\'s checkbox takes the flag off, which is the distinction worth checking on the wall.',
    id: 'BLOCK-03c',
    writer: 'blocks.remote.ts:221',
  },
  {
    action: 'Nudge the pin, look at it, nudge it again a minute later',
    domain: 'block',
    events: [
      eventAgo(365, {
        actorFk: ME,
        changes: [
          change({ columnName: 'location', newValue: stringifyCoords(NUDGED), oldValue: stringifyCoords(PIN) }),
        ],
        objectId: 400,
        objectType: 'block',
      }),
    ],
    expected:
      'One card, one line, from where the pin started to where it ended. The intermediate spot was never somewhere the block was left, so it is not on the card and the distance is measured end to end.',
    id: 'BLOCK-03d',
    writer: 'blocks.remote.ts:221',
  },
  {
    action: 'Add a block, then fix its pin two minutes later from the map',
    domain: 'block',
    events: [
      eventAgo(360, {
        actorFk: ME,
        // ONE event, verb `create`, carrying the nudge as a change row: an `update` joins an open
        // `create` rather than opening a second event, which is what makes a create absorb its own
        // corrections. Moved TO the pin the entity holds, since that is where the block ends up.
        changes: [
          change({ columnName: 'location', newValue: stringifyCoords(PIN), oldValue: stringifyCoords(NUDGED) }),
        ],
        entity: blockEntity('Nordblock', false),
        objectId: 400,
        objectType: 'block',
        verb: 'create',
      }),
    ],
    expected:
      'One card, "You added the block Nordblock", dated from the nudge rather than the create. The correction is INVISIBLE: only an `update` expands into one row per column, so a create that absorbed a change row renders exactly one sentence and no change line. The map redraws at the corrected spot, which is the only trace. Arguable both ways: it keeps a card per action, and it silently drops a recorded edit.',
    id: 'BLOCK-03e',
    writer: 'blocks.remote.ts:221',
  },
  {
    action: 'Add a block, drag the pin, drag it back to exactly where you placed it',
    domain: 'block',
    events: [
      eventAgo(355, {
        actorFk: ME,
        entity: blockEntity('Nordblock', false),
        objectId: 400,
        objectType: 'block',
        verb: 'create',
      }),
    ],
    expected:
      'The create card, unchanged and NOT refloated to the top. The undone change row is deleted, and the event survives holding nothing because it is a create rather than an update, so the timestamp the join bumped is put back.',
    id: 'BLOCK-03f',
    writer: 'blocks.remote.ts:221',
  },

  {
    action: '/blocks/400/topos/edit -> add a topo photo whose EXIF carries GPS, on a block with no pin',
    domain: 'block',
    events: [
      eventAgo(340, {
        actorFk: ME,
        changes: [change({ columnName: 'location', newValue: stringifyCoords(PIN, true) })],
        objectId: 400,
        objectType: 'block',
      }),
    ],
    expected:
      '"You updated the location of Nordblock", captioned "Pin added" with the approximate chip. The reader never asked for this: they uploaded a photo, and the card credits them with a location edit. Rarely stands alone either, since the topo upload writes its own events on the same block and a burst keys on the actor plus the place.',
    id: 'BLOCK-04a',
    writer: 'blocks.remote.ts:264',
  },
  {
    action: 'The same upload onto a block that already has a pin',
    domain: 'block',
    events: [],
    expected:
      'Nothing, by the guard above the write: an existing pin is never overridden by a guess, so the backfill is safe to fire on every topo upload and silent on all but the first.',
    id: 'BLOCK-04b',
    writer: 'blocks.remote.ts:249',
  },

  {
    action: 'Block page -> More -> Delete block (it has routes, so it soft-deletes)',
    domain: 'block',
    events: [
      eventAgo(320, {
        actorFk: ME,
        metadata: stringifyDeletionScale({ routes: 9 }),
        objectId: 400,
        objectType: 'block',
        verb: 'delete',
      }),
    ],
    expected:
      'Single card, "You deleted the block Nordblock", with "9 routes" underneath. The count is written down at delete time because it stops being knowable a statement later; the block\'s own name is not, because a soft delete leaves the row readable.',
    id: 'BLOCK-05a',
    writer: 'blocks.remote.ts:393',
  },
  {
    action: 'Delete a block that has a topo but no live routes, an hour after somebody added it',
    domain: 'block',
    events: [eventAgo(315, { actorFk: ME, objectId: 400, objectType: 'block', verb: 'delete' })],
    expected:
      'Same sentence, no sub line: a scale of zero is stored as nothing at all, so this card and a card written before the counting existed are the same card. The topo is what kept it off the hard path, and the card says nothing about it.',
    id: 'BLOCK-05b',
    writer: 'blocks.remote.ts:393',
  },
  {
    action: 'Delete a bare block you added five minutes ago (the grace window)',
    domain: 'block',
    events: [],
    expected:
      'No card, and the create card is gone too: inside the window a childless, unreacted block is hard-deleted and `events.block_fk` cascades its whole log away. A mistake leaves no trace.',
    id: 'BLOCK-05c',
    writer: 'blocks.remote.ts:378',
  },
  {
    action: 'Clear out two abandoned blocks in one area, one after the other',
    domain: 'block',
    events: [
      eventAgo(306, {
        actorFk: ME,
        entity: blockEntity('Südblock'),
        metadata: stringifyDeletionScale({ routes: 3 }),
        objectId: 401,
        objectType: 'block',
        parent: { id: 301, type: 'area' },
        verb: 'delete',
      }),
      eventAgo(310, {
        actorFk: ME,
        metadata: stringifyDeletionScale({ routes: 9 }),
        objectId: 400,
        objectType: 'block',
        verb: 'delete',
      }),
    ],
    expected:
      'One removal card: same actor, same area, minutes apart. "You deleted entries", which names nothing on purpose (whatever it named is what was just deleted), with both blocks as rows and the scales SUMMED to "12 routes". Note what is missing: the card does not say "2 removals", because the deletion scale takes the sub line over from the count.',
    id: 'BLOCK-05d',
    writer: 'blocks.remote.ts:393',
  },
  {
    action: 'A deletion whose block cannot be resolved (a pre-migration orphan)',
    domain: 'block',
    events: [
      eventAgo(300, {
        actorFk: ME,
        entity: undefined,
        metadata: stringifyDeletionScale({ routes: 4 }),
        objectId: 999,
        objectType: 'block',
        parent: undefined,
        verb: 'delete',
      }),
    ],
    expected:
      'The honest degraded state: "You deleted the block" with the unnamed placeholder, and "4 routes" still under it. A block delete stores no name of its own, deliberately, so there is nothing to fall back on once the row is really gone. Only reachable for backfilled rows.',
    id: 'BLOCK-05e',
    writer: 'blocks.remote.ts:393',
  },

  {
    action: 'Undo a block deletion, from the toast (the soft path)',
    domain: 'block',
    events: [],
    expected:
      "No card, and the deletion card disappears: the undo erases the event the delete wrote rather than logging a second action. Only that one event. The block's create and every edit ever made to it still point at the same id and stay on the wall.",
    id: 'BLOCK-06a',
    writer: 'blocks.remote.ts:504',
  },
  {
    action: 'Undo a block deletion that took the hard path (deleted inside the grace window)',
    domain: 'block',
    events: [],
    expected:
      "Nothing to erase and nothing restored to the log: the hard delete already cascaded the block's events away, and the restore inserts a brand new row with a new id. The block comes back at its old order; its history does not.",
    id: 'BLOCK-06b',
    writer: 'blocks.remote.ts:481',
  },

  {
    action: '/areas/301 -> reorder blocks -> drag into a new order (or "sort by distance") -> Save',
    domain: 'block',
    events: [],
    expected:
      'Silent, deliberately or not. Reordering rewrites `order` on every block in the area and writes no event, so a reader who had the area open sees nothing move in the feed. The one on this list most worth arguing about, since the same action on a topo IS logged.',
    id: 'BLOCK-07a',
    writer: 'blocks.remote.ts:515',
  },

  {
    action: 'Add two blocks to one area in one sitting',
    domain: 'block',
    events: [
      eventAgo(280, {
        actorFk: ME,
        entity: blockEntity('Südblock', false),
        objectId: 401,
        objectType: 'block',
        parent: { id: 301, type: 'area' },
        verb: 'create',
      }),
      eventAgo(283, {
        actorFk: ME,
        entity: blockEntity('Nordblock', false),
        objectId: 400,
        objectType: 'block',
        verb: 'create',
      }),
    ],
    expected:
      'One burst card: same actor, same area, minutes apart. "You edited Westwand" (the area, since no single block is the subject) with a "2 edits" sub line and both blocks as rows. No map thumbnail: two creates have two pins and no row to hang either on, so the card that draws one is only ever the card that created one thing.',
    id: 'BLOCK-08a',
    writer: 'blocks.remote.ts:96',
  },
  {
    action: 'Rename a block in the edit form, then move its pin from the map three minutes later',
    domain: 'block',
    events: [
      eventAgo(270, {
        actorFk: ME,
        // TWO mutation calls, ONE event. The fold key is (actor, object, region, metadata) and
        // leaves the verb out, so the second call finds the first call's event still open and its
        // change row joins it.
        changes: [
          change({ columnName: 'name', newValue: 'Nordblock', oldValue: 'Nordwand' }),
          change({ columnName: 'location', newValue: stringifyCoords(NUDGED), oldValue: stringifyCoords(PIN) }),
        ],
        objectId: 400,
        objectType: 'block',
      }),
    ],
    expected:
      'Same headline and sub line as BLOCK-02f, "You edited Nordblock" with "2 edits", even though the reader used two screens. The only difference is the order of the two change lines, Name then Location here because the rows are read back in the order the two calls wrote them, against 02f\'s Location then Name from one submit diffing `{ location, name }`: nothing a reader could read as two screens, and the timestamp is the second call\'s. This is the server fold rather than the client grouping, so it holds even if the two land in different feed windows.',
    id: 'BLOCK-08b',
    writer: 'blocks.remote.ts:221',
  },
  {
    action: 'You rename a block while somebody else moves its pin, in the same minute',
    domain: 'block',
    events: [
      eventAgo(260, {
        actorFk: 3,
        changes: [
          change({ columnName: 'location', newValue: stringifyCoords(NUDGED), oldValue: stringifyCoords(PIN) }),
        ],
        objectId: 400,
        objectType: 'block',
      }),
      eventAgo(262, {
        actorFk: ME,
        changes: [change({ columnName: 'name', newValue: 'Nordblock', oldValue: 'Nordwand' })],
        objectId: 400,
        objectType: 'block',
      }),
    ],
    expected:
      'TWO cards, two minutes apart: "Sofia Brandt updated the location of Nordblock" and "You renamed Nordblock". The actor is in the server fold key and in the burst key, so two people working on one block never share an event or a card, which is what keeps "You" honest.',
    id: 'BLOCK-08c',
    writer: 'blocks.remote.ts:182',
  },
  {
    action: 'Rename a block, then decide it should not exist and delete it four minutes later',
    domain: 'block',
    events: [
      eventAgo(250, {
        actorFk: ME,
        metadata: stringifyDeletionScale({ routes: 2 }),
        objectId: 400,
        objectType: 'block',
        verb: 'delete',
      }),
      eventAgo(254, {
        actorFk: ME,
        changes: [change({ columnName: 'name', newValue: 'Nordblock', oldValue: 'Nordwand' })],
        objectId: 400,
        objectType: 'block',
      }),
    ],
    expected:
      'TWO cards, kept apart twice over. The server refuses to let a `delete` join an open `update`, which would have reported the removal as an edit; and the feed keeps deletions out of edit bursts, so "You deleted the block Nordblock" cannot end up buried inside a card counting edits.',
    id: 'BLOCK-08d',
    writer: 'blocks.remote.ts:393',
  },
]
