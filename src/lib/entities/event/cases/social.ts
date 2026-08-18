/**
 * Every card a REACTION or a COMMENT changes, which is every card there is.
 *
 * The odd domain of the catalogue: nothing here writes an event. `toggleReaction`, `postComment`
 * and `deleteComment` write rows on `reactions`, which hang off an event somebody else's writer
 * produced. So each case is a carrier event from another domain with `reactions` and `comments`
 * hung on it, and its `writer` names the line on the reaction table that put them there.
 *
 * What is under review is where the bar ends up and what it offers, which `card.ts` decides:
 * one bar per EVENT, riding the row that event named, and anything left over falling to the
 * footer. A session of five ascents is five bars, so a reader can congratulate the one send they
 * mean rather than the afternoon.
 *
 * Claims are derived by reading `card.ts`, `Reactions.svelte`, `ReactionChip.svelte` and
 * `Comments.svelte`, so they say what those DO, not what they should.
 */
import type { ReactionListItem } from '$lib/entities/reaction/dto'
import type { EventCase } from './types'
import { ascentEntity, change, eventAgo, ME, PEOPLE } from './world'

/*
 * A case states `commentCount` and never the comments themselves.
 *
 * That is the shape the card actually gets: the thread is no longer part of an event's relation
 * tree, so what a card knows about a conversation is the number on `events.comment_count`. What
 * the words look like belongs to the thread, which loads when a reader opens it.
 */

/**
 * One person's one emoji on one event.
 *
 * A name that is not in the world resolves to the empty string, which is exactly what the mapper
 * produces for a reactor whose `users` row has not synced yet: see SOCIAL-01l.
 */
function reaction(emoji: string, userFk: number): ReactionListItem {
  return { emoji, userFk, userName: PEOPLE[userFk] ?? '' }
}

export const SOCIAL_CASES: EventCase[] = [
  {
    action: 'Open the feed and read a card nobody has touched',
    domain: 'social',
    events: [eventAgo(600, { actorFk: 3, objectId: 9002, objectType: 'ascent', verb: 'create' })],
    expected:
      'Single card, "Sofia Brandt redpointed Kante". The bar is still there under the route row: an empty comment button (no count) and the add-reaction button. Nothing falls to the footer, and with no change lines to toggle the footer is not rendered at all.',
    id: 'SOCIAL-01a',
    writer: 'reactions.remote.ts:71',
  },
  {
    action: "Feed -> somebody else's card -> add a reaction -> 💪",
    domain: 'social',
    events: [
      eventAgo(560, {
        actorFk: 3,
        objectId: 9002,
        objectType: 'ascent',
        reactions: [reaction('💪', 2)],
        verb: 'create',
      }),
    ],
    expected:
      'One chip, "💪 1", on the row the ascent named. Not pressed: the reader is not one of the reactors, so it reads as an outline rather than the primary fill. A hold on it lists Tomas Kessler.',
    id: 'SOCIAL-01b',
    writer: 'reactions.remote.ts:71',
  },
  {
    action: 'Three people each send a different emoji to one card',
    domain: 'social',
    events: [
      eventAgo(520, {
        actorFk: 3,
        objectId: 9002,
        objectType: 'ascent',
        // Chips keep first-seen order rather than being sorted, so a new emoji appends instead of
        // shuffling the ones already under the reader's thumb.
        reactions: [reaction('👍', 2), reaction('💪', 4), reaction('🔥', 5)],
        verb: 'create',
      }),
    ],
    expected:
      'Three chips of one each, in the order they arrived: 👍, 💪, 🔥. One bar, one row, wrapping to a second line on a narrow phone rather than widening the card.',
    id: 'SOCIAL-01c',
    writer: 'reactions.remote.ts:71',
  },
  {
    action: 'Tap 🔥 on a card two other people have already reacted to',
    domain: 'social',
    events: [
      eventAgo(480, {
        actorFk: 3,
        objectId: 9002,
        objectType: 'ascent',
        reactions: [reaction('🔥', 2), reaction('🔥', ME), reaction('💪', 5)],
        verb: 'create',
      }),
    ],
    expected:
      '"🔥 2" pressed (primary fill, aria-pressed) because the reader is one of the two, and "💪 1" unpressed beside it. Tapping the pressed one clears it, which is the same call that set it.',
    id: 'SOCIAL-01d',
    writer: 'reactions.remote.ts:71',
  },
  {
    action: 'Your own card, four people have reacted to it',
    domain: 'social',
    events: [
      eventAgo(440, {
        actorFk: ME,
        objectId: 500,
        objectType: 'route',
        reactions: [reaction('🔥', 2), reaction('🔥', 3), reaction('🔥', 4), reaction('🔥', 5)],
        verb: 'create',
      }),
    ],
    expected:
      '"You added the route Kante direkt" with "🔥 4" to read and nothing to add: the bar is read-only on your own event, so the add button is gone and the chip does not toggle. The comment button stays, which is the point of keeping the bar at all.',
    id: 'SOCIAL-01e',
    writer: 'reactions.remote.ts:71',
  },
  {
    action: 'The same card, read by one of the four reactors',
    domain: 'social',
    events: [
      eventAgo(440, {
        actorFk: ME,
        objectId: 500,
        objectType: 'route',
        reactions: [reaction('🔥', 2), reaction('🔥', 3), reaction('🔥', 4), reaction('🔥', 5)],
        verb: 'create',
      }),
    ],
    expected:
      'Same card, "Ada Rossi added the route Kante direkt", read by Tomas: the bar is NOT read-only, so the add button is back and "🔥 4" is pressed because he is one of the four. A hold on the chip opens the popover, which lists all four names in arrival order.',
    id: 'SOCIAL-01f',
    reader: 2,
    writer: 'reactions.remote.ts:71',
  },
  {
    action: 'A session of two ascents, and you react to only one of them',
    domain: 'social',
    events: [
      eventAgo(400, {
        actorFk: 3,
        objectId: 9002,
        objectType: 'ascent',
        reactions: [reaction('💪', ME)],
        verb: 'create',
      }),
      // Minutes apart and the same actor, so this folds into one session card. A second ascent the
      // world does not hold, built here rather than restated as a whole event.
      eventAgo(403, {
        actorFk: 3,
        entity: ascentEntity('Dach', 14, 3, 'flash'),
        objectId: 9003,
        objectType: 'ascent',
        parent: { id: 502, type: 'route' },
        verb: 'create',
      }),
    ],
    expected:
      'ONE card, "Sofia Brandt logged a session", "2 ascents", with two rows. The 💪 sits under the Kante row alone and the Dach row carries an empty bar of its own. This is what per-event bars buy: the reaction names the send, not the afternoon.',
    id: 'SOCIAL-01g',
    writer: 'reactions.remote.ts:71',
  },
  {
    action: 'React to a card that renders no rows at all (a member removal)',
    domain: 'social',
    events: [
      eventAgo(360, {
        actorFk: 3,
        objectId: 5,
        objectType: 'user',
        reactions: [reaction('🤔', ME)],
        verb: 'remove',
      }),
    ],
    expected:
      '"Sofia Brandt removed Mara Lindqvist from the region" with no row under it: the catalogue entry declares `row: none`, since a profile link for somebody out of the region is a dead end. The bar has nowhere to ride, so it falls to the footer, which is the only reason there is a footer here at all.',
    id: 'SOCIAL-01h',
    writer: 'reactions.remote.ts:71',
  },
  {
    action: 'React to the newer of two edits that folded into one card',
    domain: 'social',
    events: [
      eventAgo(320, {
        actorFk: 3,
        changes: [change({ columnName: 'description', newValue: 'Sharp arête, tape the fingers.', oldValue: '' })],
        objectId: 500,
        objectType: 'route',
        reactions: [reaction('👍', ME)],
      }),
      eventAgo(322, {
        actorFk: 3,
        changes: [change({ columnName: 'name', newValue: 'Kante direkt', oldValue: 'Kante' })],
        objectId: 500,
        objectType: 'route',
      }),
    ],
    expected:
      'One card, "Sofia Brandt edited Kante direkt", "2 edits", with ONE row for the route. The row bar belongs to the OLDER event (the rename), so the 👍 has no row to sit on and renders in the footer instead. Two bars on one card, which is the leftover rule keeping a reaction somewhere the reader can see it and take it back.',
    id: 'SOCIAL-01i',
    writer: 'reactions.remote.ts:71',
  },
  {
    action: 'A card that has been reacted to and talked under',
    domain: 'social',
    events: [
      eventAgo(280, {
        actorFk: 3,
        commentCount: 2,
        objectId: 9002,
        objectType: 'ascent',
        reactions: [reaction('🔥', 2), reaction('🔥', 4), reaction('👍', 5)],
        verb: 'create',
      }),
    ],
    expected:
      'One bar carrying both: "🔥 2", "👍 1", and a comment button reading 2. The emoji arrive with the card and the two sentences do not: the count comes off `events.comment_count`, and the thread is fetched when the button opens it. Both halves post back to the same event id.',
    id: 'SOCIAL-01j',
    writer: 'reactions.remote.ts:71',
  },
  {
    action: 'React to an upload whose file resolves to no entity',
    domain: 'social',
    events: [
      eventAgo(240, {
        actorFk: 3,
        // A file contributes its parent's entity and nothing of its own. With neither, the card has
        // no name, no media and no row: the honest degraded state for an orphaned file row.
        entity: undefined,
        objectId: 'f9',
        objectType: 'file',
        parent: undefined,
        reactions: [reaction('👍', ME)],
        verb: 'add',
      }),
    ],
    expected:
      '"Sofia Brandt added media to Unnamed", in the italic placeholder, with no thumbnail and no row. The bar falls to the footer under the no-rows rule, so the reaction is still readable and still revocable on a card that can say almost nothing about itself.',
    id: 'SOCIAL-01k',
    writer: 'reactions.remote.ts:71',
  },
  {
    action: 'Hold a chip whose reactors include somebody whose user row has not synced',
    domain: 'social',
    events: [
      eventAgo(200, {
        actorFk: 3,
        objectId: 9002,
        objectType: 'ascent',
        // `toReaction` falls back to the empty string for a reaction whose user has not arrived.
        reactions: [reaction('🔥', 2), reaction('🔥', 4), reaction('🔥', 6)],
        verb: 'create',
      }),
    ],
    expected:
      'The chip counts "🔥 3", because the count is of rows rather than of names. The popover lists two names and one blank line, which is what an unsynced reactor renders as: the list has no loading state of its own.',
    id: 'SOCIAL-01l',
    writer: 'reactions.remote.ts:71',
  },

  {
    action: 'Tap the chip you sent, to take it back',
    domain: 'social',
    events: [
      eventAgo(160, {
        actorFk: 3,
        objectId: 9002,
        objectType: 'ascent',
        verb: 'create',
      }),
    ],
    expected:
      'The chip is gone and the card is not: unlike an event undo, taking back a reaction removes a row on `reactions` and leaves what it was about alone. The bar stays under the route row, back to the comment and add buttons alone.',
    id: 'SOCIAL-02a',
    writer: 'reactions.remote.ts:48',
  },
  {
    action: 'Take back the reaction that was the only thing on a leftover bar',
    domain: 'social',
    events: [
      eventAgo(120, {
        actorFk: 3,
        changes: [change({ columnName: 'description', newValue: 'Sharp arête, tape the fingers.', oldValue: '' })],
        objectId: 500,
        objectType: 'route',
      }),
      eventAgo(122, {
        actorFk: 3,
        changes: [change({ columnName: 'name', newValue: 'Kante direkt', oldValue: 'Kante' })],
        objectId: 500,
        objectType: 'route',
      }),
    ],
    expected:
      'SOCIAL-01i with the 👍 cleared. The footer bar disappears entirely, because a leftover with no chips and no comments is filtered out, and the card has a row so the no-rows rule does not save it. The footer is still drawn, holding the Show changes toggle on its own.',
    id: 'SOCIAL-02b',
    writer: 'reactions.remote.ts:48',
  },

  {
    action: 'Feed -> card -> comment button -> type -> Post',
    domain: 'social',
    events: [
      eventAgo(80, {
        actorFk: 3,
        commentCount: 1,
        objectId: 9002,
        objectType: 'ascent',
        verb: 'create',
      }),
    ],
    expected:
      "The comment button reads 1 and nothing under it has loaded: the number is a column on the event, and the thread is a query the button fires. Opened, it is a sheet on a phone and a right-hand aside on a desktop, with one line by Tomas Kessler, his avatar, a relative time, a Reply control, no delete control (it is not the reader's), and the composer pinned at the bottom.",
    id: 'SOCIAL-03a',
    writer: 'reactions.remote.ts:118',
  },
  {
    action: 'Three people answer each other under one card',
    domain: 'social',
    events: [
      eventAgo(60, {
        actorFk: 3,
        commentCount: 3,
        objectId: 9002,
        objectType: 'ascent',
        verb: 'create',
      }),
    ],
    expected:
      'Button reads 3. The thread renders oldest first, three avatars and three names. A reply to any of them indents under it against a rule, one level and no deeper: answering a reply files under the same comment, so the shape stays a list of comments with a flat list of answers. No delete control on any of these, none being the reader s.',
    id: 'SOCIAL-03b',
    writer: 'reactions.remote.ts:118',
  },
  {
    action: 'Answer somebody under a card, then look at your own line',
    domain: 'social',
    events: [
      eventAgo(45, {
        actorFk: 3,
        commentCount: 2,
        objectId: 9002,
        objectType: 'ascent',
        verb: 'create',
      }),
    ],
    expected:
      'Two lines, and only the second carries the trash control: `mine` is filled in per comment from the author against the reader, so the delete offer follows the line rather than the card. Every line carries Reply, own lines included.',
    id: 'SOCIAL-03c',
    writer: 'reactions.remote.ts:118',
  },
  {
    action: 'Somebody comments on YOUR card, and you answer',
    domain: 'social',
    events: [
      eventAgo(30, {
        actorFk: ME,
        commentCount: 1,
        objectId: 9001,
        objectType: 'ascent',
        verb: 'create',
      }),
    ],
    expected:
      '"You flashed Rampe" with a read-only bar: no add button, since nobody applauds their own event, but the comment button is there reading 1 and opens the thread with its composer. Being the person a card is about is the most likely reason to have something to say under it.',
    id: 'SOCIAL-03d',
    writer: 'reactions.remote.ts:118',
  },
  {
    action: 'Open a thread whose author has not synced yet',
    domain: 'social',
    events: [
      eventAgo(25, {
        actorFk: 3,
        // `toComment` falls back to the empty string, the same way a reactor's name does.
        commentCount: 1,
        objectId: 9002,
        objectType: 'ascent',
        verb: 'create',
      }),
    ],
    expected:
      'The body is readable and the name is not: a blank name line and a pulsing avatar, which is the loading state `Avatar` takes for an empty name. The count on the button is 1 either way, since it counts rows rather than resolved people.',
    id: 'SOCIAL-03e',
    writer: 'reactions.remote.ts:118',
  },

  {
    action: 'Thread -> your own comment -> trash',
    domain: 'social',
    events: [
      eventAgo(20, {
        actorFk: 3,
        commentCount: 1,
        objectId: 9002,
        objectType: 'ascent',
        verb: 'create',
      }),
    ],
    expected:
      "The reader's line is gone and the button drops by one. Soft on the server, but a soft-deleted row does not sync, so the thread is simply shorter, and the count follows because the trigger on `reactions` decrements the card as the row leaves. The card itself is untouched, exactly as a cleared reaction leaves it.",
    id: 'SOCIAL-04a',
    writer: 'reactions.remote.ts:155',
  },
  {
    action: 'Delete the only comment on a card that has no rows',
    domain: 'social',
    events: [
      eventAgo(15, {
        actorFk: 3,
        objectId: 5,
        objectType: 'user',
        verb: 'remove',
      }),
    ],
    expected:
      "SOCIAL-01h with everything cleared off it. The footer bar STAYS, empty: a card with no rows always keeps its first bar, or there would be nothing on the entity's own page to react to or comment under. The mirror of SOCIAL-02b, where the same empty bar is dropped because the card has a row.",
    id: 'SOCIAL-04b',
    writer: 'reactions.remote.ts:155',
  },
]
