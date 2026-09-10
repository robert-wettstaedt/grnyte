import type { Schema } from '$lib/zero/zero-schema'
import type { Query } from '@rocicorp/zero'

/**
 * What order blocks come in, stated once so both spellings of the rule can be compared.
 * `order.server.ts` holds the drizzle half.
 *
 * Zero completes any ordering with the primary key, so `id` is here for PRECEDENCE, not stability:
 * the client's `order, name` completed to `order, name, id`, which the server's `order, id` is not.
 * No screen ever showed the disagreement; two files spelling one rule differently is the point.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic pass-through, like `relatedRegion`
export type BlockQuery = Query<'blocks', Schema, any>

/**
 * Blocks from more than one area (search, backlinks, favourites), where `order` says nothing:
 * every area has a block at slot 0.
 *
 * Ordering by `name` is not alphabetical: a nameless block stores `''`, sorts first, and renders as
 * "Block 3", so favourites can fill its first six with them. Not fixable in zql, which cannot order
 * by a fallback it does not compute.
 */
export function acrossAreasOrder<TQuery extends BlockQuery>(q: TQuery): TQuery {
  return q.orderBy('name', 'asc').orderBy('id', 'asc') as TQuery
}

/**
 * Blocks within one area: their slot, then `id`, which keeps anything else from getting in front.
 * A tie is reachable (`order` has no unique constraint) but unobserved; `reorderBlocks` renumbering
 * the whole area is what repairs one.
 */
export function inAreaOrder<TQuery extends BlockQuery>(q: TQuery): TQuery {
  return q.orderBy('order', 'asc').orderBy('id', 'asc') as TQuery
}
