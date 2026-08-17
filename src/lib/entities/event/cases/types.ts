import type { TopoView } from '$lib/entities/topo/dto'
import type { EventListItem } from '../mapper'

export type CaseDomain = 'area' | 'ascent' | 'block' | 'file' | 'grouping' | 'region' | 'route' | 'social' | 'topo'

/**
 * One action the app can perform, and the card the feed answers with.
 *
 * A case states the EVENTS a writer emits, not rows arranged to produce a screenshot, and names
 * the write site that emits them. That pairing is what makes this a catalogue rather than a
 * gallery: `coverage.test.ts` reads every `insertEvent` and `createUpdateEvent` call in the app and
 * fails if a `(verb, object)` pair or a diffed column has no case here, so a new writer cannot
 * ship without a card to review.
 */
export interface EventCase {
  /** The UI path that produces it, from the first tap to the button that writes. */
  action: string
  domain: CaseDomain
  /**
   * The events the mutation writes, newest first, exactly as `toEvent` would hand them over.
   *
   * Empty is a case worth keeping: it says the action deliberately writes nothing, which is where
   * a reader most often expects a card and finds none.
   */
  events: EventListItem[]
  /**
   * What the card is expected to render.
   *
   * Derived by reading the code, so it says what the feed DOES, not what it SHOULD: it is the
   * claim under review, never the oracle. Disagreeing with it is the whole point of the wall.
   */
  expected: string
  /** Stable id, e.g. `AREA-02f`: what a snapshot diff and a review comment point at. */
  id: string
  /**
   * Who is reading, which decides "You ..." against a name, and whether the reaction bar offers
   * anything to add. Defaults to {@link ME}.
   */
  reader?: number
  /** Only for the cases whose change lines draw a topo photo. */
  topos?: ReadonlyMap<number, TopoView>
  /**
   * The write site this case stands for, as `file:line`, or `null` where the app writes nothing.
   *
   * Read by the coverage test, and by a reviewer who wants to jump from a card to the code that
   * produced it. Several cases naming one site is normal: one site writes a different card per
   * column it diffs.
   */
  writer: null | string
}
