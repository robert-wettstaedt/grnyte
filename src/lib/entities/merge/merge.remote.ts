import { areas, blocks, routes } from '$lib/db/schema'
import { formError } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import { authedQuery } from '$lib/remote/authed.server'
import { requireRow } from '$lib/remote/require.server'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { canDeleteArea } from '../area/permissions'
import { canDeleteBlock } from '../block/permissions'
import { canDeleteRoute } from '../route/permissions'

export type MergePreview = {
  ascents: number
  children: number
  photos: number
  topoLinesRemoved: number
  topos: number
}

const TABLES = { areas, blocks, routes }
const CAN_DELETE = { areas: canDeleteArea, blocks: canDeleteBlock, routes: canDeleteRoute }

/** What a merge would carry to the survivor, for its confirmation. Asked of the server because a block's or
 *  an area's ascents are never all on the client. Gated as the merge itself is, on the stored source. */
export const mergePreview = authedQuery(
  z.object({ kind: z.enum(['areas', 'blocks', 'routes']), sourceId: z.number(), survivorId: z.number() }),
  async ({ kind, sourceId, survivorId }, { db, user, userRegions }): Promise<MergePreview> => {
    const table = TABLES[kind]
    await requireRow(
      () =>
        db
          .select()
          .from(table)
          .where(and(eq(table.id, sourceId), isNull(table.deletedAt)))
          .then((rows) => rows[0]),
      (row) => CAN_DELETE[kind](userRegions, user.id, row),
      formError(`${kind}_notFound`),
    )
    // The blocks and routes the merge carries: under the source area, the source block itself, or the route alone.
    const ownBlocks =
      kind === 'routes'
        ? sql`select null::int as id where false`
        : kind === 'blocks'
          ? sql`select ${sourceId}::int as id`
          : sql`select id from blocks where deleted_at is null and area_fk in (
              with recursive sub(id) as (select ${sourceId}::int union all select a.id from areas a join sub on a.parent_fk = sub.id)
              select id from sub)`
    const carried =
      kind === 'routes'
        ? sql`select ${sourceId}::int as id`
        : sql`select id from routes where deleted_at is null and block_fk in (select id from own_blocks)`
    const [row] = await db.execute<MergePreview>(sql`
      with own_blocks as (${ownBlocks}), carried as (${carried})
      select
        (select count(*) from ascents where route_fk in (select id from carried) and deleted_at is null)::int as ascents,
        (select count(*) from files f where (route_fk in (select id from carried) or block_fk in (select id from own_blocks)
          or (${kind} = 'areas' and area_fk = ${sourceId}))
          -- A topo's photo is counted under topos.
          and not exists (select 1 from topos t where t.file_fk = f.id))::int as photos,
        (select count(*) from topos where block_fk in (select id from own_blocks))::int as topos,
        (case ${kind}
          when 'blocks' then (select count(*) from carried)
          when 'areas' then (select count(*) from areas where parent_fk = ${sourceId} and deleted_at is null)
            + (select count(*) from blocks where area_fk = ${sourceId} and deleted_at is null)
          else 0 end)::int as children,
        (case ${kind} when 'routes' then (
          select count(*) from topo_routes tr join topos t on t.id = tr.topo_fk
          where tr.route_fk = ${sourceId}
            and t.block_fk is distinct from (select block_fk from routes where id = ${survivorId}))
          else 0 end)::int as "topoLinesRemoved"`)
    return row
  },
)
