/**
 * The two halves of the block ordering rule, asserted against each other and against the call site.
 *
 * Named `.server.` so it lands in the node project: it imports the drizzle half, and that pulls in
 * `$lib/db/schema`. What it is really testing is the pair, because the point of the pair is that
 * neither may drift: they sit in different files, in two query languages, and no compiler can
 * compare them.
 *
 * Three levels, and the third is the one that matters most. Asserting the helpers agree does not
 * stop somebody inlining `.orderBy('order','asc').orderBy('name','asc')` back into `queries.ts`,
 * which is the precise failure the module exists to prevent, so the last test reads the ordering
 * off the built query instead of off the helper.
 */
import { blocks } from '$lib/db/schema'
import { blocksQueryDefs } from '$lib/entities/block/queries'
import type { QueryContext } from '$lib/zero/permissions'
import { sql } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { acrossAreasOrder, inAreaOrder, type BlockQuery } from './order'
import { inAreaOrderSql } from './order.server'

/**
 * One `orderBy` call. Typed off the real query rather than as `[string, string]`, so the expected
 * literals below are checked against the schema: rename the column and this file stops compiling
 * rather than passing while the query breaks.
 */
type Ordering = Parameters<BlockQuery['orderBy']>

/** A stand-in for a zql query that records what was asked of it. */
function recorder() {
  const calls: Ordering[] = []
  const q = {
    orderBy(...args: Ordering) {
      calls.push(args)
      return q
    },
  }
  return { calls, q }
}

/** The columns AND directions the drizzle clause names, read back off the SQL it renders. */
function serverOrdering(): string[][] {
  const rendered = new PgDialect().sqlToQuery(sql.join(inAreaOrderSql(blocks), sql`, `)).sql
  return [...rendered.matchAll(/"(\w+)" (asc|desc)/gi)].map((match) => [match[1], match[2].toLowerCase()])
}

/** No memberships needed: nothing here executes a query, it only inspects the one that was built. */
const ctx: QueryContext = { authUserId: '00000000-0000-0000-0000-000000000000' }

/** The ordering `listBlocks` actually builds for `args`, off the query's own AST. */
function builtOrdering(args: Record<string, unknown>): unknown {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the registry is heterogeneous, as in `tenancy.test.ts`
  const def = blocksQueryDefs.listBlocks as unknown as { fn: (options: any) => { ast: { orderBy: unknown } } }
  return def.fn({ args, ctx }).ast.orderBy
}

const IN_AREA: Ordering[] = [
  ['order', 'asc'],
  ['id', 'asc'],
]
const ACROSS_AREAS: Ordering[] = [
  ['name', 'asc'],
  ['id', 'asc'],
]

describe('block ordering', () => {
  it('orders blocks in an area by slot, then id', () => {
    const { calls, q } = recorder()
    inAreaOrder(q as never)
    expect(calls).toEqual(IN_AREA)
  })

  it('has the client read and the renumbering rule name the same columns in the same directions', () => {
    // The whole point of the pair. Directions are compared, not just column names: a server `desc`
    // would otherwise drop out of the regex and fail on length, pointing at the wrong thing.
    const { calls, q } = recorder()
    inAreaOrder(q as never)
    expect(serverOrdering()).toEqual(calls)
  })

  it('drops the slot entirely across areas, and still ends on id', () => {
    // `order` is a position inside one area, so every area contributes a block at slot 0 and
    // ordering a search or a backlink list by it buckets the results by nothing. The trailing `id`
    // is explicitness rather than stability: Zero appends the primary key with or without it.
    const { calls, q } = recorder()
    acrossAreasOrder(q as never)
    expect(calls).toEqual(ACROSS_AREAS)
  })

  it('picks the rule off `areaId` at the call site, not just in the helpers', () => {
    // Reads the built query rather than the helper, because everything above stays green if
    // `queries.ts` stops calling them. This is the branch a reader actually sees: the area screen
    // gets slots, the search flyout gets names.
    expect(builtOrdering({ areaId: 1 })).toEqual(IN_AREA)
    expect(builtOrdering({})).toEqual(ACROSS_AREAS)
    // `null` matches no rows at all, because `blocks.areaFk` is not null. Pinned anyway: the sort
    // branches on `=== undefined` and the `where` two lines below it on `!== undefined`, so this is
    // the assertion that keeps those two from drifting into disagreeing about what `null` selects.
    expect(builtOrdering({ areaId: null })).toEqual(IN_AREA)
  })
})
