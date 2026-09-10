import { blocks } from '$lib/db/schema'
import { asc, type SQL } from 'drizzle-orm'

/**
 * The server half of the block ordering rule. `order.ts` says why the tie-break is `id`; this file
 * exists only to keep drizzle out of the client bundle, the same split `settings.server.ts` makes.
 *
 * Deliberately NOT named `inAreaOrder` to match its client twin. Nothing stops a `.svelte` file
 * importing this module: eslint's restricted imports cover zod and relative `../lib` paths, and
 * Kit's illegal-import check covers `$lib/server/**`, not a `.server.ts` suffix. Two exports under
 * one name would put drizzle and the whole schema into the client bundle on a single wrong
 * autocomplete, and nothing would catch it: it typechecks, it lints, and no test covers it.
 */
export function inAreaOrderSql(table: Pick<typeof blocks, 'id' | 'order'>): SQL[] {
  return [asc(table.order), asc(table.id)]
}
