import { eventCard, type EventCardView } from '$lib/entities/event/card'
import {
  ascentEntity,
  blockEntity,
  change,
  eventAgo,
  fileEntity,
  ME,
  PEOPLE,
  photo,
  routeEntity,
  topoLines,
  topoMetadata,
  topoViews,
  video,
} from '$lib/entities/event/cases/world'
import { groupEvents, type EventGroup } from '$lib/entities/event/grouping'
import type { EventListItem } from '$lib/entities/event/mapper'
import type { ReactionListItem } from '$lib/entities/reaction/dto'
import type { TopoView } from '$lib/entities/topo/dto'

export {
  ascentEntity,
  eventAgo,
  ME,
  PEOPLE,
  photo,
  topoLines,
  topoMetadata,
  topoViews as topos,
} from '$lib/entities/event/cases/world'
/**
 * The design's sample week, as the EVENTS the mutation layer writes, folded by the real
 * `groupEvents` and decided by the real `eventCard`.
 *
 * The builders live in `$lib/entities/event/cases/world`, beside the catalogue that reviews them,
 * and are re-exported here so a story needs one import. What is left in this file is only the
 * week: story material, and the one thing the cases have no use for, since a case states one
 * action and this states a feed.
 *
 * Two events carry reactions and one carries a thread, deliberately. A card built without them
 * renders a bar the app never shows empty in practice, and the whole point of the week is that a
 * story shows what the feed shows.
 *
 * The two builders below (`line`, `changes`) state a card LINE rather than an event, because
 * `EventChanges` is a change-line component that takes `ChangeView`s directly and has no events
 * behind it. They come from `line.fixture`, which the card layer's unit tests share.
 */

const NOTES = 'Cold and dry, the crux crimp finally felt sticky. Went second try after brushing the top.'

const KANTE = { name: 'Kante direkt', routeFk: 501 }
const RAMPE = { name: 'Rampe', routeFk: 502 }

/** One person's one emoji on one event. */
function reaction(emoji: string, userFk: number): ReactionListItem {
  return { emoji, userFk, userName: PEOPLE[userFk] ?? '' }
}

/**
 * The week from the design: a flash with photos, a four-ascent session, a five-photo submit, a
 * twelve-edit burst, a topo redraw, a corrected video credit, a new area, a grade change, a
 * removed photo, a deleted route, a role grant, and one card whose object resolves to nothing.
 */
export const sampleWeek: { events: EventListItem[]; topos: ReadonlyMap<number, TopoView> } = {
  events: [
    // The fullest single card there is: an ascent with its photos and notes, reacted to and
    // talked under, so the bar shows both halves at once.
    eventAgo(12, {
      actorFk: 2,
      // The number, not the words: a card carries `comment_count`, and the thread is fetched when
      // the button opens it. A story mounts no Zero client, so an opened thread is out of scope
      // here by construction.
      commentCount: 2,
      entity: ascentEntity('Rampe', 12, 2, 'flash', { files: [photo('f1'), photo('f2')], note: NOTES }),
      objectId: 9001,
      objectType: 'ascent',
      reactions: [reaction('🔥', 3), reaction('🔥', 4), reaction('💪', ME)],
      verb: 'create',
    }),

    // One climber's session: four ascents logged in one sitting, with a reaction on exactly one
    // of them. That is what a bar per event buys, and the session card is where it shows.
    eventAgo(180, {
      actorFk: 3,
      objectId: 9002,
      objectType: 'ascent',
      reactions: [reaction('💪', ME)],
      verb: 'create',
    }),
    eventAgo(185, {
      actorFk: 3,
      entity: ascentEntity('Verschneidung', 11, 3, 'redpoint'),
      objectId: 9003,
      objectType: 'ascent',
      parent: { id: 506, type: 'route' },
      parentEntity: routeEntity('Verschneidung', 11),
      verb: 'create',
    }),
    eventAgo(190, {
      actorFk: 3,
      entity: ascentEntity('Traverse', 6, 3, 'flash'),
      objectId: 9004,
      objectType: 'ascent',
      parent: { id: 507, type: 'route' },
      parentEntity: routeEntity('Traverse', 6),
      verb: 'create',
    }),
    eventAgo(195, {
      actorFk: 3,
      entity: ascentEntity('Sitzstart', 16, 3, 'attempt'),
      objectId: 9005,
      objectType: 'ascent',
      parent: { id: 508, type: 'route' },
      parentEntity: routeEntity('Sitzstart', 16),
      verb: 'create',
    }),

    // Five photos from one submit. Each is its own event pointing at its own file, and they fold
    // into one card because they agree on the block they landed on.
    ...Array.from({ length: 5 }, (_, index) =>
      eventAgo(240 + index, {
        actorFk: 3,
        entity: fileEntity(blockEntity(), [photo(`up-${index}`)]),
        objectId: `f-up-${index}`,
        objectType: 'file',
        parent: { id: 400, type: 'block' },
        verb: 'add',
      }),
    ),

    // A twelve-edit burst across six routes of one block: one event per route, two columns each,
    // and never the same column twice in a row, so the expanded diff reads like a real afternoon
    // of tidying up. Six events rather than twelve, because the server folds a second call on one
    // route into the event already open for it.
    eventAgo(300, {
      actorFk: 4,
      changes: [
        change({ columnName: 'gradeFk', newValue: '12', oldValue: '11' }),
        change({ columnName: 'name', newValue: 'Kante direkt', oldValue: 'Kante' }),
      ],
      objectId: 500,
      objectType: 'route',
    }),
    eventAgo(304, {
      actorFk: 4,
      changes: [
        change({ columnName: 'rating', newValue: '3', oldValue: '1' }),
        change({ columnName: 'tags', newValue: 'SD,highball', oldValue: 'SD' }),
      ],
      objectId: 501,
      objectType: 'route',
    }),
    eventAgo(308, {
      actorFk: 4,
      changes: [
        change({
          columnName: 'description',
          newValue: 'Sit start on the crimps, then the obvious sloper.',
          oldValue: 'Stand start.',
        }),
        change({ columnName: 'firstAscensionists', newValue: 'Ada Rossi,Jonas Weber', oldValue: 'Ada Rossi' }),
      ],
      objectId: 502,
      objectType: 'route',
    }),
    eventAgo(312, {
      actorFk: 4,
      changes: [
        change({ columnName: 'gradeFk', newValue: '9', oldValue: '8' }),
        change({ columnName: 'rating', newValue: '2', oldValue: '3' }),
      ],
      objectId: 503,
      objectType: 'route',
    }),
    eventAgo(316, {
      actorFk: 4,
      changes: [
        change({ columnName: 'name', newValue: 'Schuppe direkt', oldValue: 'Schuppe' }),
        change({ columnName: 'tags', newValue: 'SD,traverse', oldValue: 'traverse' }),
      ],
      entity: routeEntity('Schuppe direkt', 13),
      objectId: 504,
      objectType: 'route',
      parent: { id: 400, type: 'block' },
    }),
    eventAgo(320, {
      actorFk: 4,
      changes: [
        change({
          columnName: 'description',
          newValue: 'Sit start under the nose, then the rail out right.',
          oldValue: '',
        }),
        change({
          columnName: 'firstAscensionists',
          newValue: 'Mara Lindqvist,Sofia Brandt',
          oldValue: 'Mara Lindqvist',
        }),
      ],
      entity: routeEntity('Nase', 10),
      objectId: 505,
      objectType: 'route',
      parent: { id: 400, type: 'block' },
    }),

    // A second line drawn onto the block's topo. `metadata` says which of the five topo edits it
    // was, and the change line draws the photo with the new line solid over the old one.
    eventAgo(360, {
      actorFk: 5,
      changes: [change({ columnName: 'topo', newValue: topoLines([KANTE, RAMPE]), oldValue: topoLines([KANTE]) })],
      metadata: topoMetadata('lines', 700),
      objectId: 400,
      objectType: 'block',
    }),

    // A reposted beta clip credited to the wrong site, fixed after the fact. Points at the file,
    // so the card draws the clip and borrows the route's name, but stays its own card rather than
    // joining the uploads: an edit to a clip is a field edit, not a submit.
    eventAgo(400, {
      actorFk: 2,
      changes: [
        change({
          columnName: 'source',
          newValue: 'https://vimeo.com/912345',
          oldValue: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        }),
      ],
      entity: fileEntity(routeEntity('Riss', 15), [video('vid-1', 'https://vimeo.com/912345')]),
      objectId: 'f-vid-1',
      objectType: 'file',
      parent: { id: 501, type: 'route' },
    }),

    // Yesterday.
    eventAgo(26 * 60, { actorFk: 3, objectId: 300, objectType: 'area', verb: 'create' }),
    // Your own event, so the bar lists its chips and offers nothing to add: nobody applauds their
    // own edit. The comment button stays, which is the point of keeping the bar at all.
    eventAgo(28 * 60, {
      actorFk: ME,
      changes: [change({ columnName: 'gradeFk', newValue: '15', oldValue: '11' })],
      objectId: 501,
      objectType: 'route',
      reactions: [reaction('👍', 3), reaction('👍', 4), reaction('🤔', 5)],
    }),
    // A photo pulled off a route. The file row is gone by then, so the event logs on the route and
    // says which kind of media it was in `metadata`.
    eventAgo(30 * 60, { actorFk: 5, metadata: 'photo', objectId: 502, objectType: 'route', verb: 'remove' }),
    // A route nothing can resolve any more: no parent to fall back on and no name stored on the
    // delete, so the headline takes the unnamed placeholder and the row is a tombstone.
    eventAgo(32 * 60, { actorFk: 4, entity: undefined, objectId: 599, objectType: 'route', verb: 'delete' }),

    // Two days back.
    eventAgo(50 * 60, {
      actorFk: 3,
      changes: [change({ columnName: 'role', newValue: 'region_maintainer', oldValue: 'region_user' })],
      objectId: 5,
      objectType: 'user',
    }),
    // An upload whose file resolves to nothing: no name, no thumbnail and no row. A state the
    // app produces for an orphaned file row.
    eventAgo(52 * 60, {
      actorFk: 2,
      entity: undefined,
      objectId: 'f-orphan',
      objectType: 'file',
      parent: undefined,
      verb: 'add',
    }),
  ],
  topos: topoViews(),
}

/** The week folded by the real grouping rules, which is where every card below starts. */
export const sampleWeekGroups: EventGroup[] = groupEvents(sampleWeek.events)

/**
 * The same week with nothing resolved: an entity arrives with its event, so a card that cannot
 * name its object never gets one later. Every row is a tombstone and every headline takes the
 * placeholder, and the list still holds its shape, which is what the story is about.
 */
export const unresolvedWeek: EventListItem[] = sampleWeek.events.map((event) => ({
  ...event,
  entity: undefined,
  parentEntity: undefined,
}))

/** Cards for a set of events, folded and decided exactly as the feed does. */
export const eventViews = (events: readonly EventListItem[], currentUserFk: number | undefined = ME) =>
  groupEvents(events).map((group) => eventCard(group, currentUserFk, sampleWeek.topos))

/**
 * One group as the card the page would show it as, seen as the signed-in climber by default. The
 * card story picks single groups out of the week and the feed story takes them all, and both were
 * passing the same reader and the same topo views by hand.
 */
export const sampleWeekView = (group: EventGroup, currentUserFk: number | undefined = ME): EventCardView =>
  eventCard(group, currentUserFk, sampleWeek.topos)

/** The whole week as cards. The events are overridable so a story can show it unresolved. */
export const sampleWeekViews = (events: readonly EventListItem[] = sampleWeek.events) => eventViews(events)

/** One group at feed density, for the stories that show a single tier on its own. */
export const feedView = (group: EventGroup, currentUserFk: number | undefined = ME): EventCardView =>
  eventCard(group, currentUserFk, sampleWeek.topos, undefined, 'mixed')

/**
 * The whole week as the FEED draws it, rather than as one card's anatomy.
 *
 * Every other helper here asks for `uniform` density, which is right for a story about what one
 * card says: a card drawn as a one-liner has no anatomy to show. This one is the surface where
 * the tiers are visible against each other, which is the only place the change reads as a change.
 */
export const feedDensityViews = (events: readonly EventListItem[] = sampleWeek.events) =>
  groupEvents(events).map((group) => feedView(group))

// The change-line stories render `ChangeView`s with no event behind them, so they state lines.
export { changes, line } from '$lib/entities/event/line.fixture'
