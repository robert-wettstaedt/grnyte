/**
 * Every card an action on a TOPO can produce.
 *
 * A topo has no page and no row of its own, so all of these log on the BLOCK the photo hangs
 * under, and what the change is ABOUT rides in `metadata`: which of the five actions it was, and
 * which photo. That metadata is also what scopes the server fold, so two photos on one block are
 * two events rather than one quietly absorbing the other.
 *
 * Two write sites. `insertTopoActivity` (topos.remote.ts:44) logs the four actions that have no
 * before/after pair to show: a photo added, swapped, removed, or the strip reordered. It writes
 * `remove` for the removal and `update` for the other three. `saveTopoLines`
 * (topos.remote.ts:320) is the one action that does have a pair, and it diffs a single column,
 * `topo`, whose two sides hold the whole set of drawn lines.
 *
 * Two things worth knowing before reading the claims:
 *
 * - Uploading the image writes no card of its own. `insertUploadActivity` skips blocks, because
 *   every image on a block is a topo image and the `createTopo` that follows says strictly more
 *   about the same upload. So adding a photo is one card, not two.
 * - The photos are only fetched for cards a reader has expanded, and only live ones. A case that
 *   states no `topos` is therefore not a missing fixture: it is what the card draws before the
 *   photo query answers, and permanently once the photo is gone.
 *
 * `coverage.test.ts` reads the write sites as text and takes `verb` only when it is a literal.
 * Line 44 computes it (`action === 'photoRemoved' ? 'remove' : 'update'`), so the audit reports
 * that site as `?:block`, which no case can carry since `?` is not a verb. Both verbs the site
 * really writes are covered below.
 */
import type { EventCase } from './types'
import { change, eventAgo, ME, topoLines, topoMetadata, topoViews } from './world'

/**
 * The routes the fixture photo carries a line for, at the ids `topoViews` draws them under.
 *
 * The names ride on the change row itself: `saveTopoLines` writes each route's name into the
 * encoded state, so a card names the routes as they were called when the save happened, not as
 * they are called now. `Platte` is deliberately not one of the photo's lines, which is what makes
 * the drawn-line case show what an unknown grade band looks like.
 */
const KANTE = { name: 'Kante direkt', routeFk: 501 }
const PLATTE = { name: 'Platte', routeFk: 503 }
const RAMPE = { name: 'Rampe', routeFk: 502 }

export const TOPO_CASES: EventCase[] = [
  {
    action: '/blocks/400/topos/edit -> Add photo -> pick an image',
    domain: 'topo',
    events: [
      eventAgo(700, {
        actorFk: ME,
        metadata: topoMetadata('photoAdded', 700),
        objectId: 400,
        objectType: 'block',
      }),
    ],
    expected:
      'Single card, "You updated the topo on Nordblock", with one change line labelled Topo: the caption "Photo added" over the photo as it stands, its two lines drawn solid. One card rather than two, since the upload behind it logs nothing for a block.',
    id: 'TOPO-01a',
    topos: topoViews(700),
    writer: 'topos.remote.ts:44',
  },
  {
    action: 'Somebody else adds a photo, seen from your feed',
    domain: 'topo',
    events: [
      eventAgo(660, {
        actorFk: 3,
        metadata: topoMetadata('photoAdded', 700),
        objectId: 400,
        objectType: 'block',
      }),
    ],
    expected:
      'Third person, "Sofia Brandt updated the topo on Nordblock", with her avatar. The change line is the same one: who is reading only decides the sentence.',
    id: 'TOPO-01b',
    topos: topoViews(700),
    writer: 'topos.remote.ts:44',
  },
  {
    action: 'Pick two images in one go, so two topos are created minutes apart',
    domain: 'topo',
    events: [
      eventAgo(617, {
        actorFk: ME,
        metadata: topoMetadata('photoAdded', 701),
        objectId: 400,
        objectType: 'block',
      }),
      eventAgo(620, {
        actorFk: ME,
        metadata: topoMetadata('photoAdded', 700),
        objectId: 400,
        objectType: 'block',
      }),
    ],
    expected:
      'Two events, because the photo is in the metadata and the server fold keys on it, but ONE card: a burst keys on the actor and the place, and the block is one place. Both rows resolve the same sentence, so the headline stays "You updated the topo on Nordblock", with a "2 edits" sub line and a change line per photo.',
    id: 'TOPO-01c',
    topos: new Map([...topoViews(700), ...topoViews(701)]),
    writer: 'topos.remote.ts:44',
  },
  {
    action: 'Expand the card before its photo has synced, or after the photo has been deleted',
    domain: 'topo',
    events: [
      eventAgo(580, {
        actorFk: ME,
        metadata: topoMetadata('photoAdded', 700),
        objectId: 400,
        objectType: 'block',
      }),
    ],
    expected:
      'Same headline and the same "Photo added" caption, and nothing drawn: the feed fetches topo photos only for expanded cards, and only live ones. A photo action carries no state of its own, so with the photo missing the caption is all that is left.',
    id: 'TOPO-01d',
    writer: 'topos.remote.ts:44',
  },
  {
    action: 'A photo added to a block that does not resolve',
    domain: 'topo',
    events: [
      eventAgo(540, {
        actorFk: ME,
        entity: undefined,
        metadata: topoMetadata('photoAdded', 700),
        objectId: 400,
        objectType: 'block',
      }),
    ],
    expected:
      'The honest degraded state: "You updated the topo on" with the unnamed placeholder, and the block row as a nameless tombstone. Nothing hydrates, not even the area it hangs under, since the card builds its entity map from the events and skips one that carries no entity. `block:updated:topo` declares no tombstone column, so there is no stored name to fall back on either.',
    id: 'TOPO-01e',
    topos: topoViews(700),
    writer: 'topos.remote.ts:44',
  },

  {
    action: '/blocks/400/topos/edit -> photo menu -> Replace photo -> pick an image',
    domain: 'topo',
    events: [
      eventAgo(500, {
        actorFk: ME,
        metadata: topoMetadata('photoReplaced', 700),
        objectId: 400,
        objectType: 'block',
      }),
    ],
    expected:
      'Single card, "You updated the topo on Nordblock", caption "Photo replaced". The picture is the topo as it stands, so it is the NEW photo with the lines that survived the swap. The old image is not shown anywhere: the row stores no pair, and the file is gone by the time anyone reads the card.',
    id: 'TOPO-02a',
    topos: topoViews(700),
    writer: 'topos.remote.ts:44',
  },

  {
    action: '/blocks/400/topos/edit -> drag a photo to a new position in the strip',
    domain: 'topo',
    events: [
      eventAgo(460, {
        actorFk: ME,
        metadata: topoMetadata('reordered'),
        objectId: 400,
        objectType: 'block',
      }),
    ],
    expected:
      'Single card, "You updated the topo on Nordblock", caption "Photos reordered", nothing drawn: a reorder is about the strip rather than any one photo in it, so it stores no topo id and there is nothing to fetch. The order itself is not stored either, so the card cannot say what moved where.',
    id: 'TOPO-03a',
    writer: 'topos.remote.ts:44',
  },
  {
    action: 'Drag two photos around, one after the other, inside the 15-minute window',
    domain: 'topo',
    events: [
      eventAgo(420, {
        actorFk: ME,
        metadata: topoMetadata('reordered'),
        objectId: 400,
        objectType: 'block',
      }),
    ],
    expected:
      'ONE event and one card, not two. Both drags write byte-identical metadata on the same block, so the second joins the open event and only bumps its timestamp, floating the card back to the top. Nothing on it says the strip was rearranged twice.',
    id: 'TOPO-03b',
    writer: 'topos.remote.ts:44',
  },

  {
    action: '/blocks/400/topos/edit -> photo menu -> Delete photo -> confirm',
    domain: 'topo',
    events: [
      eventAgo(380, {
        actorFk: ME,
        metadata: topoMetadata('photoRemoved', 700),
        objectId: 400,
        objectType: 'block',
        verb: 'remove',
      }),
    ],
    expected:
      'Single card, "You removed a topo photo from Nordblock". Its own sentence rather than "updated the topo", the way a cleared pin gets one. The change line borrows the sentence a removed route photo gets and reads "Photo removed" (the markup passes the word, since a topo is always an image), and draws nothing: the photo is gone, so no case can supply one.',
    id: 'TOPO-04a',
    writer: 'topos.remote.ts:44',
  },
  {
    action: 'Delete a photo, then add a better one, in the same sitting',
    domain: 'topo',
    events: [
      eventAgo(340, {
        actorFk: ME,
        metadata: topoMetadata('photoAdded', 701),
        objectId: 400,
        objectType: 'block',
      }),
      eventAgo(343, {
        actorFk: ME,
        metadata: topoMetadata('photoRemoved', 700),
        objectId: 400,
        objectType: 'block',
        verb: 'remove',
      }),
    ],
    expected:
      'One card. Pulling a topo photo is `remove`, not `delete`, so it bursts with the edits rather than opening a deletion card. The two rows resolve different sentences, so the headline drops to the shared "You edited Nordblock" with "2 edits", over both change lines: Photo added on the new picture, then Photo removed with nothing to draw.',
    id: 'TOPO-04b',
    topos: topoViews(701),
    writer: 'topos.remote.ts:44',
  },
  {
    action: 'Delete a topo whose row names no block',
    domain: 'topo',
    events: [],
    expected:
      'No card at all. `insertTopoActivity` returns before writing when the topo has no block, because the feed would have nowhere to put a change that hangs off nothing. Only reachable for a `topos` row with a null `block_fk`; the editor only ever creates them under a block.',
    id: 'TOPO-04c',
    writer: 'topos.remote.ts:44',
  },

  {
    action: '/blocks/400/topos/edit -> pick a route -> draw a line -> Save',
    domain: 'topo',
    events: [
      eventAgo(300, {
        actorFk: ME,
        changes: [change({ columnName: 'topo', newValue: topoLines([KANTE]), oldValue: topoLines([]) })],
        metadata: topoMetadata('lines', 700),
        objectId: 400,
        objectType: 'block',
      }),
    ],
    expected:
      'Single card, "You updated the topo on Nordblock", one change line: a green "Drew Kante direkt" chip and NO caption, since the chips are the sentence once there are any. The photo is drawn with the new line solid and no ghost under it: nothing moved, the line arrived.',
    id: 'TOPO-05a',
    topos: topoViews(700),
    writer: 'topos.remote.ts:320',
  },
  {
    action: 'Drag an existing line to a better position -> Save',
    domain: 'topo',
    events: [
      eventAgo(260, {
        actorFk: ME,
        changes: [change({ columnName: 'topo', newValue: topoLines([KANTE], true), oldValue: topoLines([KANTE]) })],
        metadata: topoMetadata('lines', 700),
        objectId: 400,
        objectType: 'block',
      }),
    ],
    expected:
      'One change line with a neutral "Redrew Kante direkt" chip, and the photo drawn twice over: where the save left the line, solid, and where it used to be, dashed underneath. The ghost keeps its own id (the route id, negated) so it does not collide with the live line sitting on top of it.',
    id: 'TOPO-05b',
    topos: topoViews(700),
    writer: 'topos.remote.ts:320',
  },
  {
    action: 'Select a drawn route -> Clear its line -> Save',
    domain: 'topo',
    events: [
      eventAgo(220, {
        actorFk: ME,
        changes: [change({ columnName: 'topo', newValue: topoLines([KANTE]), oldValue: topoLines([KANTE, RAMPE]) })],
        metadata: topoMetadata('lines', 700),
        objectId: 400,
        objectType: 'block',
      }),
    ],
    expected:
      'One change line with a red "Erased Rampe" chip. The line that survived draws solid and the erased one draws dashed under it, which is the only place that line still exists: its row is deleted, and the state on the change row is what remembers it.',
    id: 'TOPO-05c',
    topos: topoViews(700),
    writer: 'topos.remote.ts:320',
  },
  {
    action: 'Draw one line, drag another, clear a third, then Save once',
    domain: 'topo',
    events: [
      eventAgo(180, {
        actorFk: ME,
        changes: [
          change({
            columnName: 'topo',
            newValue: topoLines([RAMPE, PLATTE]),
            oldValue: topoLines([KANTE, RAMPE]),
          }),
        ],
        metadata: topoMetadata('lines', 700),
        objectId: 400,
        objectType: 'block',
      }),
    ],
    expected:
      'ONE change line, not three: a save is one column moving once, and the chips carry the detail. Green "Drew Platte", neutral "Redrew Rampe", red "Erased Kante direkt", over a photo with two solid lines and two ghosts. Platte draws in the ungraded neutral, since a line takes its colour from the photo as it stands and this photo carries no line for that route.',
    id: 'TOPO-05d',
    topos: topoViews(700),
    writer: 'topos.remote.ts:320',
  },
  {
    action: 'Open the editor, move nothing, press Save',
    domain: 'topo',
    events: [],
    expected:
      'No card. The two encoded states match, so `createUpdateEvent` writes neither event nor change row. The encoding sorts by route for exactly this reason: unsorted, the same drawing would read as a change every time the rows came back in a different order.',
    id: 'TOPO-05e',
    writer: 'topos.remote.ts:320',
  },
  {
    action: 'Draw a line and Save, then nudge it and Save again inside the 15-minute window',
    domain: 'topo',
    events: [
      eventAgo(140, {
        actorFk: ME,
        // The fold overwrites `new_value` on the open event's change row and keeps its original
        // `old_value`, so the pair reads from where the photo started to where it ended up. The
        // position in between was never a state the crag was left in.
        changes: [change({ columnName: 'topo', newValue: topoLines([KANTE], true), oldValue: topoLines([]) })],
        metadata: topoMetadata('lines', 700),
        objectId: 400,
        objectType: 'block',
      }),
    ],
    expected:
      'Still ONE card with ONE change line. The second save joins the open event (same actor, same block, same metadata, inside the window) rather than opening a second. The chip reads "Drew Kante direkt" and not "Redrew": to the stored pair the line was never anywhere else. Two cards here would mean the fold is not working.',
    id: 'TOPO-05f',
    topos: topoViews(700),
    writer: 'topos.remote.ts:320',
  },
  {
    action: 'Drag a line, Save, drag it back to where it was, Save again inside the window',
    domain: 'topo',
    events: [],
    expected:
      'No card at all. The folded change row ends where it started, so it is deleted, and an `update` event left holding no changes deletes itself. The photo is back where it was and so is the log.',
    id: 'TOPO-05g',
    writer: 'topos.remote.ts:320',
  },
  {
    action: 'The same undo, on an event somebody has already reacted to',
    domain: 'topo',
    events: [
      eventAgo(100, {
        actorFk: ME,
        metadata: topoMetadata('lines', 700),
        objectId: 400,
        objectType: 'block',
      }),
    ],
    expected:
      'The card survives holding nothing, because deleting the event would cascade somebody else\'s reaction away. "You updated the topo on Nordblock", and a change line with no chips and no pair, which is the one path to the "Lines updated" caption. Its timestamp is put back too, so it does not float up for an edit that undid itself. The reaction that kept it alive is not part of this claim; the card is.',
    id: 'TOPO-05h',
    topos: topoViews(700),
    writer: 'topos.remote.ts:320',
  },
  {
    action: 'Read an erase whose photo has since been deleted',
    domain: 'topo',
    events: [
      eventAgo(60, {
        actorFk: ME,
        changes: [change({ columnName: 'topo', newValue: topoLines([KANTE]), oldValue: topoLines([KANTE, RAMPE]) })],
        metadata: topoMetadata('lines', 700),
        objectId: 400,
        objectType: 'block',
      }),
    ],
    expected:
      'The chips still say it: a red "Erased Rampe", with nothing drawn above them. The chips are decided off the row and the picture off the photo, so losing the photo costs the drawing and not the story. Unlike a photo action (TOPO-01d), which has nothing but the picture to lose.',
    id: 'TOPO-05i',
    writer: 'topos.remote.ts:320',
  },
  {
    action: 'Save lines on a topo whose row names no block',
    domain: 'topo',
    events: [],
    expected:
      'No card, same reason as the delete: `saveTopoLines` skips the event entirely when `block_fk` is null. The lines are still saved, so the drawing changes and the feed says nothing about it.',
    id: 'TOPO-05j',
    writer: 'topos.remote.ts:320',
  },
  {
    action: 'A topo row carried over from before the writers recorded which action they were',
    domain: 'topo',
    events: [
      eventAgo(20, {
        actorFk: ME,
        changes: [change({ columnName: 'topo', newValue: topoLines([KANTE]), oldValue: topoLines([KANTE, RAMPE]) })],
        objectId: 400,
        objectType: 'block',
      }),
    ],
    expected:
      'The vaguest topo sentence there is: "You updated the topo on Nordblock" over a change line reading "Topo redrawn", with no photo and no chips, even though the row holds a real pair. Without metadata nothing knows which of the five actions it was or which photo it happened on, and the column on the change row is the only reason the line renders at all. Only reachable for backfilled rows.',
    id: 'TOPO-05k',
    topos: topoViews(700),
    writer: 'topos.remote.ts:320',
  },
]
