import type { Accolade } from '$lib/entities/ascent/accolade'
import { cardView, type CardGroup, type CardRow, type CardView } from '$lib/entities/event/cardView'
import { eventEntityKey, type EventEntity, type EventEntityMap, type EventEntityRef } from '$lib/entities/event/entity'
import type { ReactionChip } from '$lib/entities/reaction/dto'
import { reactionChips } from '$lib/entities/reaction/mapper'
import { routeDisplayName } from '$lib/entities/route/mapper'
import type { TopoView } from '$lib/entities/topo/dto'
import { FIELD_EDIT_OBJECT_TYPES } from './dto'
import type { EventGroup } from './grouping'
import { eventLines } from './line'
import type { EventListItem } from './mapper'

/**
 * The claim a card makes, and the route it is about, so a session card can name which row.
 *
 * `community` is not an accolade in the same sense: it says the community turned up, which is a
 * fact about the readers rather than about the climb. It fills the banner slot only when nothing
 * about the climb itself has claimed it.
 */
export interface CardAccolade {
  accolade: Accolade | { kind: 'community' }
  /** The route's display name, already resolved by the mapper. Empty when the card is not about one. */
  name: string
}

/**
 * How much room a surface gives a field edit.
 *
 * `uniform` is any surface an edit is the POINT of: the Updates half of the segmented control, an
 * entity's own log, a story. `mixed` is a feed where an edit is background to something else, and
 * is the only one that draws anything at compact tier.
 *
 * A surface decision rather than a per-event one, which is what keeps it density rather than
 * content: the same event says the same sentence wherever it is opened, and only the room it gets
 * changes. Pruning what an event SAYS per surface is the thing to keep refusing; how much room it
 * gets is not that.
 */
export type CardDensity = 'mixed' | 'uniform'

/**
 * How much of a card gets drawn.
 *
 * Three, which is the practical ceiling: a fourth is indistinguishable at a glance and doubles the
 * cases every surface has to be checked in.
 *
 * `hero` is earned, never granted by kind. Only a send carrying a claim gets it, so an afternoon
 * of easy repeats does not shout: if every send is big, big stops reading as earned, and the rare
 * one it exists for becomes illegible.
 */
export type CardTier = 'compact' | 'hero' | 'standard'

/**
 * The verbs a card can be congratulated for.
 *
 * Somebody adding a thing, never somebody fixing or removing one. Reactions are not gated by kind
 * (a reader may applaud whatever they like) but the BANNER is a claim about the event, and calling
 * a rename a community favourite is a claim nobody meant.
 */
const PROMOTABLE_VERBS: ReadonlySet<EventListItem['verb']> = new Set(['add', 'create'])

/**
 * A card, plus where its reactions go.
 *
 * One bar per EVENT, not per card. That is what per-ascent granularity buys: a session of five
 * ascents is five events, so a reader can congratulate the one send they mean rather than the
 * afternoon. A bar rides the row its event named; anything left over (a card whose row was omitted
 * on the entity's own page, an event whose row collapsed into a sibling's) falls to the footer, so
 * a reaction that exists is always somewhere a reader can see and take back.
 */
export interface EventCardView extends CardView {
  /** The one claim this card makes, if any, and the row it is about. */
  accolade?: CardAccolade
  /**
   * Bars with no row of their own. Empty for most cards.
   *
   * Optional so a plain `CardView` still is one of these: the catalogue stories build
   * their cards straight out of fixtures with no events behind them, and a story has nothing to
   * react to.
   */
  bars?: EventReactionBar[]
  rows: (CardRow & { bar?: EventReactionBar })[]
  /**
   * How much room this card gets.
   *
   * `hero` whenever a claim was earned, on every surface: a banner is a fact about the climb, so a
   * uniform-density page shows it too. `compact` only where the surface asked for `mixed` density,
   * every event on the card is a field edit, and nobody has reacted or commented yet. `standard`
   * otherwise.
   *
   * Optional for the same reason `bars` is: a plain `CardView` out of a fixture is still one of
   * these, and a story that never asked for tiering should not have to name a tier.
   */
  tier?: CardTier
}

/** One event's reactions and the way into its thread, plus the handle both post back. */
export interface EventReactionBar {
  chips: ReactionChip[]
  /** How many comments the button says are under there. The thread itself loads on open. */
  commentCount: number
  eventId: number
  /**
   * The reader's own event, so the bar lists its chips and offers nothing to add.
   * `toggleReaction` refuses the same case; this is what stops the button being there to press.
   */
  readonly: boolean
  /** Whose community this happened in, so the thread's composer can scope its `@` picker. */
  regionFk: number
}

/**
 * A card, built from events.
 *
 * Deliberately an adapter over `cardView` rather than a second implementation: that function is
 * 450 lines of decisions nobody wants made twice, pinned by a 250-case wall. Reimplementing it
 * against the new shape would reproduce all of that from scratch and re-derive the tests, with
 * every difference showing up as a wrong sentence on a card rather than as a failure.
 *
 * What events change is the INPUT, not the reasoning: an event knows its own entity, so
 * the hydration map is built here from what the rows already carried. Everything downstream is
 * unchanged, which is the point. `line.ts` expands an event into the lines a card speaks, and this
 * hands them to the decider.
 *
 * ON RETIRING THIS SEAM (reviews keep proposing it, reasonably): change `cardView`'s input type to
 * the event group directly, move its decisions across wholesale, and lean on the 250-case wall to
 * prove nothing moved. That would delete `toCardGroup`, `entityMap` and `eventKey`.
 *
 * Worth doing, but not yet: the case wall proves the sentences are unchanged, not that reaction
 * bars still land on the right events, which is this file's half and has already produced real
 * bugs (a bar on the wrong event, a chip going invisible when a window regrouped). Land the
 * feature, let bar placement settle under real use, then move the seam with the wall as a fixed
 * point.
 */
export function eventCard(
  group: EventGroup,
  currentUserFk: number | undefined,
  topos?: ReadonlyMap<number, TopoView>,
  omit?: EventEntityRef,
  density: CardDensity = 'uniform',
): EventCardView {
  const view = cardView(toCardGroup(group), entityMap(group), currentUserFk, topos, omit)

  // Each row claims the event it is about; what is left at the end is what no row speaks for.
  const unclaimed = new Map(group.events.map((event) => [event.id, event]))

  const rows = view.rows.map((row) => {
    const claimed = claim(unclaimed, row.ref)

    return { ...row, bar: claimed == null ? undefined : bar(claimed, currentUserFk) }
  })

  const leftover = [...unclaimed.values()].map((event) => bar(event, currentUserFk))
  const accolade = accoladeOf(group)

  return {
    ...view,
    accolade,
    // What no row spoke for: every leftover that already carries something, so a reaction or a
    // comment taken on one card cannot go invisible when the window regroups it, PLUS the first
    // one on a card with no rows at all. That second half is what the entity's own page needs: it
    // drops the row that would link back to the page the reader is already on, and without it
    // there would be nothing there to react to or comment under.
    //
    // ponytail: an event past `MAX_ROWS` (the fifth ascent of a session, behind "1 more") gets no
    // bar of its own. Upgrade = render the overflow rows rather than counting them.
    bars: leftover.filter(
      (left, index) => left.chips.length > 0 || left.commentCount > 0 || (rows.length === 0 && index === 0),
    ),
    rows,
    tier: tierOf(group, density, accolade),
  }
}

/**
 * The one claim this card is allowed to make, and which of its rows it is about.
 *
 * At most one per card even when a session holds several: a card that becomes a trophy wall makes
 * the rare claim illegible, which is the whole reason the rule is one. Effort outranks grade, the
 * same order `deriveAccolade` uses, so a session that both ended a project and set a ceiling says
 * the harder thing.
 *
 * A session keeps its shape. The notable ascent is not lifted out into a card of its own: it
 * already has its own row and its own reaction bar inside this one, so the banner names which row
 * it means and the afternoon stays one afternoon.
 */
function accoladeOf(group: EventGroup): CardAccolade | undefined {
  const claims = group.events.flatMap((event) => {
    const accolade = event.entity?.accolade
    // Only a card that LOGGED the send may claim it. An edit to an ascent, or somebody else's
    // removal of it, reads the same column off the same row and has no business congratulating
    // anybody for it.
    return accolade == null || event.verb !== 'create' || event.objectType !== 'ascent'
      ? []
      : [{ accolade, name: routeDisplayName(event.entity?.name ?? '') }]
  })

  const earned = claims.find((claim) => claim.accolade.kind === 'project') ?? claims[0]

  if (earned != null) {
    return earned
  }

  // Nothing about the climb claimed the slot, so the community may. Deliberately last: the
  // accolade is a fact about the climb, and the applause is already visible in the bar directly
  // below, so a card that has both says the rarer thing.
  //
  // Gated on the event being something SOMEBODY DID rather than something they corrected. Ungated,
  // a rename that three readers reacted to took the loudest treatment on the feed, banner and hero
  // border and all, which is precisely the inversion this whole change exists to undo: promotion
  // could lift a card straight out of the compact tier it was put in.
  const promoted = group.events.find((event) => event.promoted && PROMOTABLE_VERBS.has(event.verb))

  return promoted == null
    ? undefined
    : { accolade: { kind: 'community' }, name: routeDisplayName(promoted.entity?.name ?? '') }
}

/**
 * One event's bar.
 *
 * Always one, your own card included. `readonly` takes the reaction half away there, since nobody
 * applauds their own event, but the comment button stays: being the person a card is about is the
 * most likely reason to have something to say under it, and answering somebody is the other. An
 * earlier version dropped the bar for that case, which left a card of yours with no way into its
 * own thread until somebody else had started one.
 */
function bar(event: EventListItem, currentUserFk: number | undefined): EventReactionBar {
  return {
    chips: reactionChips(event.reactions, currentUserFk),
    commentCount: event.commentCount,
    eventId: event.id,
    readonly: event.actorFk === currentUserFk,
    regionFk: event.regionFk,
  }
}

/**
 * Take the event a row is about out of the pool, or nothing if none is left.
 *
 * The event whose OBJECT is that entity, else the one whose parent is: an upload's object is the
 * file, and the row it draws is the thing the photos landed on. `catalogueRowsFor` in `cardView.ts`
 * asks the same question over the same two stages, and deliberately answers it differently at the
 * end: it wants the newest line for a name and the create for an opinion strip, where a bar wants
 * the OLDEST, which is what keeps it still. Log an ascent and edit it a minute later and both are
 * one card with one row, and the reader means to congratulate the send rather than the correction;
 * it also stops a bar moving when a sixth photo joins a five-photo card.
 */
function claim(
  unclaimed: Map<number, EventListItem>,
  ref: { id: number | string; type: string },
): EventListItem | undefined {
  const key = eventKey(ref)
  const candidates = [...unclaimed.values()]
  const matches = (event: EventListItem, part: undefined | { id: number | string; type: string }) =>
    part != null && eventKey(part) === key && event != null

  const byObject = candidates.filter((event) => matches(event, { id: event.objectId, type: event.objectType }))
  const pool = byObject.length > 0 ? byObject : candidates.filter((event) => matches(event, event.parent))

  const oldest = pool.reduce<EventListItem | undefined>(
    (lowest, event) =>
      lowest == null ||
      event.createdAt < lowest.createdAt ||
      (event.createdAt === lowest.createdAt && event.id < lowest.id)
        ? event
        : lowest,
    undefined,
  )

  if (oldest != null) {
    unclaimed.delete(oldest.id)
  }

  return oldest
}

/**
 * Assembled from what the rows already carried, keyed the way `eventEntityKey` keys it, since
 * that is what the card looks rows up by. An event whose object contributes no entity (a file
 * with no parent) is left absent rather than stored as `null`: nothing here still syncs, so the
 * card only needs to distinguish "known" from "gone", not a third pending state.
 */
function entityMap(group: EventGroup): EventEntityMap {
  const entities = new Map<string, EventEntity | null>()

  for (const event of group.events) {
    if (event.entity != null) {
      entities.set(eventKey({ id: event.objectId, type: event.objectType }), event.entity)
    }

    // The parent too, whether or not the object itself resolved: "Made 12 edits in Nordblock"
    // names the block, and none of those twelve events is about it. An upload's entity IS its
    // parent's (the mapper borrows it), so a file stores it under both keys, letting the headline
    // find it whichever way it looks.
    //
    // Skipping the whole event when its object is gone would throw the parent away too: a burst
    // over two deleted routes would have a block name in hand and headline one of the routes
    // instead.
    //
    // Never over an entry already there: an event ABOUT the parent carries the full entity, and
    // `parentEntity` is only the name and the link.
    if (event.parent != null) {
      const key = eventKey(event.parent)
      const parent = event.objectType === 'file' ? event.entity : event.parentEntity
      if (!entities.has(key) && parent != null) {
        entities.set(key, parent)
      }
    }
  }

  return entities
}

/**
 * The hydration key for anything an EVENT names: its object, or the parent it hangs under.
 *
 * The events layer's half of `lineRef`. Ids arrive as numbers here and as text in a ref, so both
 * sides go through `eventEntityKey` rather than through a template literal written out four times,
 * one of which had already drifted.
 */
function eventKey(ref: { id: number | string; type: string }): string {
  return eventEntityKey({ id: String(ref.id), type: ref.type })
}

/**
 * Whether an event is a field edit: somebody changed a column on a place.
 *
 * Deliberately the narrowest reading. An `update` to an area, a block, a route or a file is the
 * rename-and-retype traffic a reader scrolls past; everything else stays at standard tier, which
 * matters most for the two cases that look like edits and are not:
 *
 * - a DELETION, which is the one thing on a feed nobody should have to expand a row to notice.
 *   Keeping edits in the feed at all is an accountability argument, and it collapses the moment a
 *   maintainer removing somebody else's work is drawn as quietly as a typo fix.
 * - a ROLE change, which arrives as an `update` on a user object and is a permission grant.
 *
 * An ascent correction is out too, by object rather than by verb: a climber fixing the grade they
 * logged is about a climb, and the card says so.
 */
function isFieldEdit(event: EventListItem): boolean {
  return event.verb === 'update' && FIELD_EDIT_OBJECT_TYPES.has(event.objectType)
}

/**
 * How much room this card gets.
 *
 * Whole-group, never per event: a card is one thing a reader acts on, and a group holding one
 * rename and one deletion is a card about a deletion. `every` is what says so, and it is why the
 * mixed rule cannot be read off `EventGroupKind` alone: a group of one is `single` whatever it
 * holds, so the kind has already forgotten the answer by the time a card asks.
 */
function tierOf(group: EventGroup, density: CardDensity, accolade: CardAccolade | undefined): CardTier {
  if (accolade != null) {
    return 'hero'
  }

  if (density !== 'mixed' || !group.events.every(isFieldEdit)) {
    return 'standard'
  }

  // A rename somebody already reacted to or commented under is not background any more, whatever
  // its verb. The compact row has no bar (see `EventCard.svelte`), so compacting one would hide a
  // chip a reader can no longer see or take back, and a thread nothing on screen admits exists.
  // That is the invariant this file states at the top, and it outranks the tier.
  const spokenFor = group.events.some((event) => event.reactions.length > 0 || event.commentCount > 0)

  return spokenFor ? 'standard' : 'compact'
}

/**
 * The group as the card reads it: every event expanded into the lines it speaks.
 *
 * An `update` expands to one line per changed column, which is what a card renders one of, so a
 * card holding twelve edits holds twelve lines.
 */
function toCardGroup(group: EventGroup): CardGroup {
  const rows = group.events.flatMap(eventLines)

  return {
    actorFk: group.actorFk,
    createdAt: group.createdAt,
    id: group.id,
    // `single` means the card speaks ONE row's sentence, and the card decides that on what it
    // holds rather than on how many events produced it. One event that moved two columns is two
    // lines: under the old shape those were two stored rows and the card said "2 edits", and
    // calling it single because one event carries them names whichever column sorts first and
    // hides the rest.
    kind: rows.length === 1 ? 'single' : group.kind === 'single' ? 'entity' : group.kind,
    rows,
  }
}
