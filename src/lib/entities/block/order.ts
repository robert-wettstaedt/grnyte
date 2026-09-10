import type { Schema } from '$lib/zero/zero-schema'
import type { Query } from '@rocicorp/zero'

/**
 * What order blocks come in, stated once so that both spellings of the rule can be compared.
 *
 * Zero completes any ordering with the table's primary key (`addPrimaryKeys` in
 * `complete-ordering.js`, on the IVM path and the SQL path alike), so no query here needs `id` for
 * a stable window and none ever did. What `id` does is take PRECEDENCE. The client read spelled
 * `order, name`, which Zero completed to `order, name, id`, and `name` sitting in front of `id` is
 * the whole of the disagreement with the server's `order, id`.
 *
 * No screen ever showed that disagreement: every render path goes through `listBlocks`, and
 * `reorderBlocks` is the only server read that orders blocks at all, so the app agreed with itself
 * either way. What was wrong is that two files spelled one rule differently and nothing compared
 * them. That is the reason this module exists, and it does not need a user-visible bug propping it
 * up. `order.server.ts` holds the drizzle half.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic pass-through, like `relatedRegion`
export type BlockQuery = Query<'blocks', Schema, any>

/**
 * Blocks from more than one area (search, backlinks, favourites), where `order` says nothing: every
 * area has a block at slot 0, so it buckets the results by a position in a list the caller is not
 * looking at.
 *
 * Ordering by name is not the same as alphabetical. `blocks.name` is not null, so a nameless block
 * stores `''`, sorts first here, and renders as "Block 3": the column sorted on is not the string
 * shown. Where that bites is a list selected by id and then capped for DISPLAY, which is
 * favourites, since `ProfileFavorites` renders only the first six through `ShowMoreList` and
 * nameless blocks take those slots. It barely touches the search flyout, even though that is the
 * one carrying a `limit`: `content` filters before the ordering applies, so a nameless block
 * reaches the cap only by matching on its description, and almost none have one (of 255 in the dev
 * database, one does). Not fixable in zql, which cannot order by a fallback it does not compute.
 *
 * Both of those are hedged on purpose, and the favourites case is a default-view problem rather
 * than lost rows: the rest are one show-more away. This paragraph has been narrowed three times for
 * claiming more than it could carry, which is worth knowing before widening it again.
 *
 * The trailing `id` is explicitness, not stability: Zero appends the primary key either way.
 */
export function acrossAreasOrder<TQuery extends BlockQuery>(q: TQuery): TQuery {
  return q.orderBy('name', 'asc').orderBy('id', 'asc') as TQuery
}

/**
 * Blocks within one area: their slot, then `id`, which is here to keep anything else from getting
 * in front of it.
 *
 * A tie is reachable because `order` carries no unique constraint, and repairing an area that holds
 * one is part of what `reorderBlocks` renumbering the whole area is for. Worth saying that this is
 * a hazard rather than a sighting, because it reads like one: the only duplicate slots in the dev
 * database are test-fixture residue.
 */
export function inAreaOrder<TQuery extends BlockQuery>(q: TQuery): TQuery {
  return q.orderBy('order', 'asc').orderBy('id', 'asc') as TQuery
}
