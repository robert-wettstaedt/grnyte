import { blocks } from '$lib/db/schema'
import { asc, type SQL } from 'drizzle-orm'

/**
 * The server half of the block ordering rule; `order.ts` says why the tie-break is `id`.
 *
 * Deliberately NOT named `inAreaOrder` to match its twin: nothing stops a `.svelte` file importing
 * this (no lint rule covers a `.server.ts` suffix), and two exports under one name would put
 * drizzle in the client bundle on one wrong autocomplete.
 */
export function inAreaOrderSql(table: Pick<typeof blocks, 'id' | 'order'>): SQL[] {
  return [asc(table.order), asc(table.id)]
}
