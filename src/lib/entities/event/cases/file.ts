/**
 * Every card an action on a FILE can produce.
 *
 * Three write sites, and they point in two different directions. An upload's object is the FILE
 * (`insertUploadEvent`, reached from `finalizeImage:187` and `finalizeVideo:410`), so the card
 * borrows the name of whatever the file landed on. A removal's object is that PARENT
 * (`deleteFile`), because the file row is gone by the time anybody reads the card and only the
 * parent is left to name. Between them sits the one column a file diffs, a video's `source`.
 *
 * Read `area.ts` first: it is the reference for what a case is. Every claim here is derived by
 * reading the code, so it says what the feed DOES, not what it should.
 */
import type { EventCase } from './types'
import { areaEntity, ascentEntity, change, eventAgo, fileEntity, ME, photo, routeEntity, video } from './world'

export const FILE_CASES: EventCase[] = [
  {
    action: '/routes/500 -> Photos & videos -> + -> Upload photos -> pick 1 JPG (finalizes on pick)',
    domain: 'file',
    events: [
      eventAgo(1400, {
        actorFk: ME,
        entity: fileEntity(routeEntity('Kante direkt', 11), [photo('01a')]),
        objectId: 'f-01a',
        objectType: 'file',
        parent: { id: 500, type: 'route' },
        verb: 'add',
      }),
    ],
    expected:
      'Single upload card, "You added a photo to Kante direkt". The name is borrowed from the parent route (a file id is a cuid and a file has no page), the word "photo" is read off the hydrated file rather than off the event, the photo fills the media strip and the route is the row underneath. An upload declares no column, so no change line.',
    id: 'FILE-01a',
    writer: 'files.remote.ts:59',
  },
  {
    action: '/routes/500 -> Photos & videos -> + -> Upload photos -> multi-select 5 JPGs',
    domain: 'file',
    events: [
      eventAgo(1360, {
        actorFk: ME,
        entity: fileEntity(routeEntity('Kante direkt', 11), [photo('01b-4')]),
        objectId: 'f-01b-4',
        objectType: 'file',
        parent: { id: 500, type: 'route' },
        verb: 'add',
      }),
      eventAgo(1361, {
        actorFk: ME,
        entity: fileEntity(routeEntity('Kante direkt', 11), [photo('01b-3')]),
        objectId: 'f-01b-3',
        objectType: 'file',
        parent: { id: 500, type: 'route' },
        verb: 'add',
      }),
      eventAgo(1362, {
        actorFk: ME,
        entity: fileEntity(routeEntity('Kante direkt', 11), [photo('01b-2')]),
        objectId: 'f-01b-2',
        objectType: 'file',
        parent: { id: 500, type: 'route' },
        verb: 'add',
      }),
      eventAgo(1363, {
        actorFk: ME,
        entity: fileEntity(routeEntity('Kante direkt', 11), [photo('01b-1')]),
        objectId: 'f-01b-1',
        objectType: 'file',
        parent: { id: 500, type: 'route' },
        verb: 'add',
      }),
      eventAgo(1364, {
        actorFk: ME,
        entity: fileEntity(routeEntity('Kante direkt', 11), [photo('01b-0')]),
        objectId: 'f-01b-0',
        objectType: 'file',
        parent: { id: 500, type: 'route' },
        verb: 'add',
      }),
    ],
    // Five events, never four or one: the object is the file, and every file has its own cuid, so
    // the server fold can never join two uploads. The folding happens on the client instead, on
    // the parent they share.
    expected:
      'ONE upload card holding five events: "You added photos to Kante direkt" with a "5 photos" sub line. Five media tiles and exactly one row, because all five borrow the same parent and the row list dedupes on it.',
    id: 'FILE-01b',
    writer: 'files.remote.ts:59',
  },
  {
    action: '/routes/500 -> Photos & videos -> + -> Upload a video -> Choose a video -> Source empty -> Add video',
    domain: 'file',
    events: [
      eventAgo(1320, {
        actorFk: ME,
        entity: fileEntity(routeEntity('Kante direkt', 11), [video('01c')]),
        objectId: 'f-01c',
        objectType: 'file',
        parent: { id: 500, type: 'route' },
        verb: 'add',
      }),
    ],
    expected:
      'Single upload card, "You added a video to Kante direkt". Same sentence as FILE-01a with one word swapped, and the word comes off the file\'s `bunnyStreamFk`: the event itself records only that something was added.',
    id: 'FILE-01c',
    writer: 'files.remote.ts:59',
  },
  {
    action: '/routes/500 -> Photos & videos -> add a photo and a video within the same minute',
    domain: 'file',
    events: [
      eventAgo(1280, {
        actorFk: ME,
        entity: fileEntity(routeEntity('Kante direkt', 11), [video('01d-video')]),
        objectId: 'f-01d-video',
        objectType: 'file',
        parent: { id: 500, type: 'route' },
        verb: 'add',
      }),
      eventAgo(1281, {
        actorFk: ME,
        entity: fileEntity(routeEntity('Kante direkt', 11), [photo('01d-photo')]),
        objectId: 'f-01d-photo',
        objectType: 'file',
        parent: { id: 500, type: 'route' },
        verb: 'add',
      }),
    ],
    expected:
      'One upload card of two, and neither word survives: the two files disagree, so the headline falls to "You added media to Kante direkt" and the sub line counts "2 files" rather than photos or videos.',
    id: 'FILE-01d',
    writer: 'files.remote.ts:59',
  },
  {
    action: 'Same as FILE-01c, typing a valid URL into Source before Add video',
    domain: 'file',
    events: [
      eventAgo(1240, {
        actorFk: ME,
        entity: fileEntity(routeEntity('Kante direkt', 11), [video('01e', 'https://vimeo.com/912345')]),
        objectId: 'f-01e',
        objectType: 'file',
        parent: { id: 500, type: 'route' },
        verb: 'add',
      }),
    ],
    expected:
      'The same card as FILE-01c, to the byte. The credit lands on `bunny_streams.source` inside the finalize, which writes one upload event and no diff, so the feed never says where the clip came from. Only a source corrected LATER gets a sentence (FILE-02a).',
    id: 'FILE-01e',
    writer: 'files.remote.ts:59',
  },
  {
    action: '/routes/500/ascents/add -> drop a photo on Photos & videos -> Save (the ascent already exists)',
    domain: 'file',
    events: [
      eventAgo(1200, {
        actorFk: ME,
        entity: fileEntity(ascentEntity('Rampe', 12, ME, 'flash'), [photo('01f')]),
        objectId: 'f-01f',
        objectType: 'file',
        parent: { id: 9001, type: 'ascent' },
        verb: 'add',
      }),
    ],
    expected:
      'Single upload card, "You added a photo to your ascent of Rampe". The ascent branch of the sentence is chosen by `climberFk` on the borrowed entity, and "your" because the climber is the actor.',
    id: 'FILE-01f',
    writer: 'files.remote.ts:59',
  },
  {
    action: 'Sofia adds a clip to her own ascent, seen from your feed',
    domain: 'file',
    events: [
      eventAgo(1160, {
        actorFk: 3,
        entity: fileEntity(ascentEntity('Kante', 9, 3, 'redpoint'), [video('01g')]),
        objectId: 'f-01g',
        objectType: 'file',
        parent: { id: 9002, type: 'ascent' },
        verb: 'add',
      }),
    ],
    expected:
      'Third person on both slots, "Sofia Brandt added a video to their ascent of Kante". The reader is not the actor, and the actor IS the climber, which is the arm that says "their" rather than naming her twice.',
    id: 'FILE-01g',
    writer: 'files.remote.ts:59',
  },
  {
    action: '/blocks/400/topos/edit -> Add photo -> pick an image',
    domain: 'file',
    events: [],
    expected:
      'No upload card at all, on purpose. Every image on a block is a topo image, and the `createTopo` or `replaceTopoImage` that follows says strictly more about the same upload (it names the action and draws the photo with its lines), so logging both would be two cards for one pick. Attach a non-topo photo to a block one day and this is the line that has to change.',
    id: 'FILE-01h',
    writer: 'files.remote.ts:58',
  },
  {
    action: 'Attach an image to an AREA (the command accepts `entityType: area`; no screen passes it)',
    domain: 'file',
    events: [
      eventAgo(1120, {
        actorFk: ME,
        entity: fileEntity(areaEntity('Westwand', 'Steinbruch'), [photo('01i')]),
        objectId: 'f-01i',
        objectType: 'file',
        parent: { id: 301, type: 'area' },
        verb: 'add',
      }),
    ],
    expected:
      'Single upload card, "You added a photo to Westwand", with the area as its row. Listed because the branch exists and is unreachable from the UI rather than forbidden: `files.area_fk` and `finalizeImage` both take it, and only the pickers never ask for it. Reachable by calling the command directly.',
    id: 'FILE-01i',
    writer: 'files.remote.ts:59',
  },
  {
    action: '/blocks/400/routes/add -> fill the name -> drop 2 photos -> Add (one submit)',
    domain: 'file',
    events: [
      eventAgo(1077, {
        actorFk: ME,
        entity: fileEntity(routeEntity('Kante direkt', 11), [photo('01j-1')]),
        objectId: 'f-01j-1',
        objectType: 'file',
        parent: { id: 500, type: 'route' },
        verb: 'add',
      }),
      eventAgo(1078, {
        actorFk: ME,
        entity: fileEntity(routeEntity('Kante direkt', 11), [photo('01j-0')]),
        objectId: 'f-01j-0',
        objectType: 'file',
        parent: { id: 500, type: 'route' },
        verb: 'add',
      }),
      eventAgo(1080, { actorFk: ME, objectId: 500, objectType: 'route', verb: 'create' }),
    ],
    // The create and the uploads agree on neither subject nor parent, so no grouping key can bring
    // them together; `mergeCreatedWithMedia` links them by noticing that one group's subject is
    // the other group's parent.
    expected:
      'ONE card, not two: "You added the route Kante direkt" with a "2 photos" sub line and both photos in the strip. The create leads the merged group, so the card speaks the create\'s verb and dates from it rather than from the finalizes that followed.',
    id: 'FILE-01j',
    writer: 'files.remote.ts:59',
  },
  {
    action: '/routes/500/ascents/add -> pick Flash -> drop an .mp4 -> Save',
    domain: 'file',
    events: [
      eventAgo(1038, {
        actorFk: ME,
        entity: fileEntity(ascentEntity('Rampe', 12, ME, 'flash'), [video('01k')]),
        objectId: 'f-01k',
        objectType: 'file',
        parent: { id: 9001, type: 'ascent' },
        verb: 'add',
      }),
      eventAgo(1040, {
        actorFk: ME,
        entity: ascentEntity('Rampe', 12, ME, 'flash', { files: [video('01k')] }),
        objectId: 9001,
        objectType: 'ascent',
        verb: 'create',
      }),
    ],
    expected:
      'One card, "You flashed Rampe" with the flash glyph and a "1 video" sub line. The upload merges into the send rather than sitting beside it as "You added a video to your ascent of Rampe". The clip arrives twice (once as the ascent\'s media, once as the upload\'s own) and the strip shows it once, deduped on the file id.',
    id: 'FILE-01k',
    writer: 'files.remote.ts:59',
  },
  {
    action: '/routes/500 -> + -> pick a photo -> cancel the tile (X) before it finalizes, or close the tab mid-upload',
    domain: 'file',
    events: [],
    expected:
      'No card. The event is written inside the finalize, which never runs; the staged object sits in the private bucket until the cleanup task sweeps it. A finalize that fails and is retried from the toast mints a fresh cuid, so a retry leaves one event either, never two.',
    id: 'FILE-01l',
    writer: 'files.remote.ts:59',
  },
  {
    action: 'Post a forged or foreign Bunny GUID straight to the finalize endpoint',
    domain: 'file',
    events: [],
    expected:
      "No card. `verifyUpload` answers 403 before the insert, so the feed cannot be seeded with somebody else's stream.",
    id: 'FILE-01m',
    writer: 'files.remote.ts:59',
  },
  {
    action: 'An upload whose file row does not resolve for this reader',
    domain: 'file',
    events: [
      eventAgo(1000, {
        actorFk: ME,
        entity: undefined,
        objectId: 'f-01n',
        objectType: 'file',
        parent: undefined,
        verb: 'add',
      }),
    ],
    expected:
      'The honest degraded state, and the emptiest card the feed can draw: "You added media to" with the unnamed placeholder in the name slot, no media tile and no row at all. Everything an upload card shows is borrowed from the file (the word, the name, the row, the picture), so a file that resolves to nothing leaves the sentence standing alone. Not reachable by acting in the app: an upload event and its file arrive in one snapshot, and deleting the file takes the event with it.',
    id: 'FILE-01n',
    writer: 'files.remote.ts:59',
  },

  {
    action: '/routes/501 -> tap a video thumb -> ?media={fileId} -> chain icon -> paste a URL -> Save',
    domain: 'file',
    events: [
      eventAgo(960, {
        actorFk: ME,
        changes: [change({ columnName: 'source', newValue: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })],
        entity: fileEntity(routeEntity('Riss', 15), [video('02a', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')]),
        objectId: 'f-02a',
        objectType: 'file',
        parent: { id: 501, type: 'route' },
        verb: 'update',
      }),
    ],
    expected:
      'Single card, "You updated the video source on Riss": the file borrows its parent\'s name here too, so the sentence names the route and the clip is the thing on the card. One change line, labelled Source, reading the italic "Not set" against a host chip for www.youtube.com. The full URL is never rendered as text, only as the chip\'s link target and its tooltip, because a reader only wants to know where it came from.',
    id: 'FILE-02a',
    writer: 'files.remote.ts:279',
  },
  {
    action: 'Same sheet, replace the existing Source URL with another one -> Save',
    domain: 'file',
    events: [
      eventAgo(920, {
        actorFk: ME,
        changes: [
          change({
            columnName: 'source',
            newValue: 'https://vimeo.com/912345',
            oldValue: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          }),
        ],
        entity: fileEntity(routeEntity('Riss', 15), [video('02b', 'https://vimeo.com/912345')]),
        objectId: 'f-02b',
        objectType: 'file',
        parent: { id: 501, type: 'route' },
        verb: 'update',
      }),
    ],
    expected: 'Same card as FILE-02a with two host chips on the line, www.youtube.com to vimeo.com.',
    id: 'FILE-02b',
    writer: 'files.remote.ts:279',
  },
  {
    action: 'Same sheet, clear the Source field entirely -> Save',
    domain: 'file',
    events: [
      eventAgo(880, {
        actorFk: ME,
        changes: [change({ columnName: 'source', oldValue: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })],
        entity: fileEntity(routeEntity('Riss', 15), [video('02c')]),
        objectId: 'f-02c',
        objectType: 'file',
        parent: { id: 501, type: 'route' },
        verb: 'update',
      }),
    ],
    expected:
      'Still "You updated the video source on Riss": there is no separate verb for clearing one, unlike a parking pin, which has its own removal sentence. The line reads the host chip against "Not set".',
    id: 'FILE-02c',
    writer: 'files.remote.ts:279',
  },
  {
    action: 'Same sheet, Save with the Source text untouched (or with only whitespace added)',
    domain: 'file',
    events: [],
    expected:
      'No card. The UPDATE still runs, but the diff finds nothing that moved, so no event is opened at all: `createUpdateEvent` returns before it writes.',
    id: 'FILE-02d',
    writer: 'files.remote.ts:279',
  },
  {
    action: 'FILE-02b, then correct the Source again within the 15-minute fold window',
    domain: 'file',
    events: [
      eventAgo(840, {
        actorFk: ME,
        changes: [
          change({
            columnName: 'source',
            newValue: 'https://www.instagram.com/p/abc123/',
            oldValue: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          }),
        ],
        entity: fileEntity(routeEntity('Riss', 15), [video('02e', 'https://www.instagram.com/p/abc123/')]),
        objectId: 'f-02e',
        objectType: 'file',
        parent: { id: 501, type: 'route' },
        verb: 'update',
      }),
    ],
    expected:
      'One card with one line, showing where the credit STARTED against where it ended: www.youtube.com to www.instagram.com. The vimeo.com it passed through is erased, because the second call merges onto the same change row rather than adding one. Two cards here would mean the fold is not working.',
    id: 'FILE-02e',
    writer: 'files.remote.ts:279',
  },
  {
    action: 'FILE-02b, then within 15 minutes set the Source back to the URL it started with',
    domain: 'file',
    events: [],
    expected:
      'No card at all. The change row returns to its old value and is deleted, and an `update` event left holding no changes deletes itself, so a credit fixed and unfixed leaves no trace. It survives only if somebody has already reacted or commented, which would otherwise take their words with it.',
    id: 'FILE-02f',
    writer: 'files.remote.ts:279',
  },
  {
    action: 'FILE-01c, then set the Source on that same clip within 15 minutes of uploading it',
    domain: 'file',
    events: [
      eventAgo(800, {
        actorFk: ME,
        changes: [change({ columnName: 'source', newValue: 'https://vimeo.com/912345' })],
        entity: fileEntity(routeEntity('Riss', 15), [video('02g', 'https://vimeo.com/912345')]),
        objectId: 'f-02g',
        objectType: 'file',
        parent: { id: 501, type: 'route' },
        verb: 'add',
      }),
    ],
    expected:
      'One card, and it is the UPLOAD card: "You added a video to Riss". An `update` refines an open `add` on the same object, so the edit joins the upload instead of opening a card beside it, and the upload keeps its verb. Two consequences worth arguing about: the card floats back to the top of the feed as if the upload had just happened, and the source change row IS stored under that event but renders nowhere, because only an `update` expands its changes into lines. A source pasted with the upload (FILE-01e) is likewise silent, so the two paths at least agree.',
    id: 'FILE-02g',
    writer: 'files.remote.ts:279',
  },
  {
    action: 'Edit the Source of a legacy clip whose stored credit is free text rather than a URL',
    domain: 'file',
    events: [
      eventAgo(760, {
        actorFk: ME,
        changes: [change({ columnName: 'source', newValue: 'filmed by the local club' })],
        entity: fileEntity(routeEntity('Riss', 15), [video('02h', 'filmed by the local club')]),
        objectId: 'f-02h',
        objectType: 'file',
        parent: { id: 501, type: 'route' },
        verb: 'update',
      }),
    ],
    expected:
      "Same card, and the chip shows the raw stored string instead of a host: nothing parses as a URL, so there is no hostname to credit. Today's form only accepts a URL, so this is reachable for stored rows rather than for a new edit.",
    id: 'FILE-02h',
    writer: 'files.remote.ts:279',
  },
  {
    action: 'Open an ascent clip in the media viewer and look for the chain (Edit source) button',
    domain: 'file',
    events: [],
    expected:
      'No card, because there is no button: the affordance is gated on the file NOT belonging to an ascent. An ascent clip is your own footage, so there is nobody to credit, and no ascent clip can ever carry a source line.',
    id: 'FILE-02i',
    writer: 'files.remote.ts:279',
  },
  {
    action: 'Call the source mutation against an image rather than a video',
    domain: 'file',
    events: [],
    expected:
      'No card. The command answers 400 ("Only videos carry a source") before it touches anything, so a photo cannot grow a credit line.',
    id: 'FILE-02j',
    writer: 'files.remote.ts:279',
  },

  {
    action: '/routes/500 -> tap a photo thumb -> trash -> Delete media -> Delete',
    domain: 'file',
    events: [eventAgo(700, { actorFk: ME, metadata: 'photo', objectId: 500, objectType: 'route', verb: 'remove' })],
    expected:
      'Single card, "You removed a photo from Kante direkt", with one muted change line reading "Photo removed" under the label Photo. The word comes off the event, not off a file: there is no file left to ask, which is also why the card shows no thumbnail of what went. The photo\'s own upload card is gone as well, cascaded away with the row. Nothing here can be taken back: the toast says "Media deleted" and offers no undo, and no code path deletes a removal event.',
    id: 'FILE-03a',
    writer: 'files.remote.ts:344',
  },
  {
    action: 'Same trash flow on a video attached to the route',
    domain: 'file',
    events: [eventAgo(660, { actorFk: ME, metadata: 'video', objectId: 500, objectType: 'route', verb: 'remove' })],
    expected:
      'Same shape as FILE-03a with the other stored word: "You removed a video from Kante direkt", line "Video removed", label Video.',
    id: 'FILE-03b',
    writer: 'files.remote.ts:344',
  },
  {
    action: 'Delete two photos from one route in the same sitting (two trips through the viewer)',
    domain: 'file',
    events: [eventAgo(620, { actorFk: ME, metadata: 'photo', objectId: 500, objectType: 'route', verb: 'remove' })],
    expected:
      'ONE event and one card, "You removed a photo from Kante direkt". The second removal is byte-identical to the first (same actor, same route, same word), so it joins the open event and only bumps its timestamp. The card therefore cannot say two, which is deliberate: three indistinguishable "Photo removed" cards say no more than one.',
    id: 'FILE-03c',
    writer: 'files.remote.ts:344',
  },
  {
    action: 'Delete a photo and then a video from the same route, a minute apart',
    domain: 'file',
    events: [
      eventAgo(580, { actorFk: ME, metadata: 'video', objectId: 500, objectType: 'route', verb: 'remove' }),
      eventAgo(581, { actorFk: ME, metadata: 'photo', objectId: 500, objectType: 'route', verb: 'remove' }),
    ],
    expected:
      'Two events, because the media word scopes the fold, and one card, because a crag burst does not key on it: "You removed media from Kante direkt" with a "2 files" sub line. Both rows share the sentence, so the headline keeps the removal verb rather than falling to "edited", and neither word wins, so both the headline and the count reach for the neutral one. Two change lines, Video removed and Photo removed.',
    id: 'FILE-03d',
    writer: 'files.remote.ts:344',
  },
  {
    action: 'Delete a photo from Kante direkt and a photo from Riss, both in Nordblock, minutes apart',
    domain: 'file',
    events: [
      eventAgo(540, { actorFk: ME, metadata: 'photo', objectId: 501, objectType: 'route', verb: 'remove' }),
      eventAgo(541, { actorFk: ME, metadata: 'photo', objectId: 500, objectType: 'route', verb: 'remove' }),
    ],
    expected:
      'One card, and the removals lose their own sentence: a burst keys on the block both routes hang under, and two subjects leave no single entity to name, so it reads "You edited Nordblock" with a "2 photos" sub line and one "Photo removed" line per route. The sub line is the only thing on the headline half that still says these were media. Worth arguing about: "edited" is the vaguest true thing to say about two deletions.',
    id: 'FILE-03e',
    writer: 'files.remote.ts:344',
  },
  {
    action: '/profile -> an ascent photo -> trash -> Delete media -> Delete',
    domain: 'file',
    events: [eventAgo(500, { actorFk: ME, metadata: 'photo', objectId: 9001, objectType: 'ascent', verb: 'remove' })],
    expected:
      'Single card, "You removed a photo from your ascent of Rampe". Media housekeeping on an ascent is deliberately kept out of the session card, so this never lands inside "You logged a session" and inflates what the afternoon looked like.',
    id: 'FILE-03f',
    writer: 'files.remote.ts:344',
  },
  {
    action: "A region maintainer clears a photo off somebody else's ascent",
    domain: 'file',
    events: [eventAgo(460, { actorFk: ME, metadata: 'photo', objectId: 9002, objectType: 'ascent', verb: 'remove' })],
    expected:
      'Single card, "You removed a photo from Sofia Brandt\'s ascent of Kante". Naming the climber is the whole point of the ascent arm: a card about somebody else\'s log must not read as if the actor were tidying their own.',
    id: 'FILE-03g',
    writer: 'files.remote.ts:344',
  },
  {
    action: 'Delete a photo and then a video from the same ascent, a minute apart',
    domain: 'file',
    events: [
      eventAgo(420, { actorFk: ME, metadata: 'video', objectId: 9001, objectType: 'ascent', verb: 'remove' }),
      eventAgo(421, { actorFk: ME, metadata: 'photo', objectId: 9001, objectType: 'ascent', verb: 'remove' }),
    ],
    expected:
      'TWO cards, one per word, where the same pair on a route (FILE-03d) is one. An ascent groups as an entity rather than as a crag burst, and that key carries the metadata, so the client keeps apart exactly what the write path kept apart. Defensible either way, but the two shapes disagree with each other.',
    id: 'FILE-03h',
    writer: 'files.remote.ts:344',
  },
  {
    action: 'Open a block image at /f/{fileId} (its id read out of the database) -> trash -> Delete',
    domain: 'file',
    events: [eventAgo(380, { actorFk: ME, metadata: 'photo', objectId: 400, objectType: 'block', verb: 'remove' })],
    expected:
      'Single card, "You removed a photo from Nordblock", with the block as its row. The topo editor deletes its photos through its own mutation and writes a topo card instead, so this is the one way a block file removal reaches the feed, and it says nothing about the lines that were drawn on it.',
    id: 'FILE-03i',
    writer: 'files.remote.ts:344',
  },
  {
    action: 'Delete a file whose parent is an AREA (the counterpart of FILE-01i)',
    domain: 'file',
    events: [eventAgo(340, { actorFk: ME, metadata: 'photo', objectId: 301, objectType: 'area', verb: 'remove' })],
    expected:
      'Single card, "You removed a photo from Westwand". Same verb an area\'s parking removal uses, told apart by what is in the metadata: coordinates mean a pin, a media word means a file. Without that the card would announce a pulled photo as a removed parking spot.',
    id: 'FILE-03j',
    writer: 'files.remote.ts:344',
  },
  {
    action: 'Delete a file that hangs off nothing (an orphan row with all four foreign keys null)',
    domain: 'file',
    events: [],
    expected:
      'No card. There is no parent to log against, and the file itself is on its way out, so the deletion is silent. The same orphan renders while it is alive as a nameless media-only entity: tiles, no name, no row.',
    id: 'FILE-03k',
    writer: 'files.remote.ts:343',
  },
  {
    action: 'A media removal written before the word was stored (backfilled rows, no path today)',
    domain: 'file',
    events: [eventAgo(300, { actorFk: ME, objectId: 500, objectType: 'route', verb: 'remove' })],
    expected:
      'Single card, "You removed media from Kante direkt", line "Media removed", label Media. The vaguest of the three arms, and the honest one: the row never recorded what it was and the file cannot be asked.',
    id: 'FILE-03l',
    writer: 'files.remote.ts:344',
  },
]
