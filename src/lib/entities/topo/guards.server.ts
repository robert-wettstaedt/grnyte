/**
 * The load-and-gate pairs the topo mutations share. Every one authorizes on a region_fk, which the
 * block row and the topo row each carry their own copy of, so the subject row is the whole choice.
 */
import * as schema from '$lib/db/schema'
import { blocks, topos } from '$lib/db/schema'
import type { UserRegion } from '$lib/entities/region/dto'
import { formError } from '$lib/forms/schemas'
import { requireRow } from '$lib/remote/require.server'
import { error } from '@sveltejs/kit'
import { and, eq, isNull } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { canEditTopo } from './permissions'

type Db = PostgresJsDatabase<typeof schema>

/** The image columns the destructive callers need: `blockFk` to prove the file is this block's,
 *  the rest to unwind it from storage. */
const topoFileColumns = { blockFk: true, bunnyStreamFk: true, id: true, path: true } as const

/** Topos have no `deleted_at` of their own, so their liveness is their block's. */
const liveBlock = { block: { columns: { deletedAt: true } } } as const

/** Load a topo to edit its lines, gating on the topo's own denormalized `region_fk`. 404/403 via `error`. */
export async function requireEditableTopo(db: Db, userRegions: UserRegion[], topoId: number) {
  const topo = await requireRow(
    () => db.query.topos.findFirst({ where: eq(topos.id, topoId), with: liveBlock }),
    (row) => canEditTopo(userRegions, row),
    formError('topo_notFound'),
  )

  return assertBlockLive(topo)
}

/** Load a block to add or reorder its topos, gating on `blocks.region_fk`. 404/403 via `error`. */
export function requireEditableTopoBlock(db: Db, userRegions: UserRegion[], blockId: number) {
  return requireRow(
    () => db.query.blocks.findFirst({ where: and(eq(blocks.id, blockId), isNull(blocks.deletedAt)) }),
    (row) => canEditTopo(userRegions, row),
    formError('blocks_notFound'),
  )
}

/** {@link requireEditableTopo} plus the backing image row, for the two callers that destroy it.
 *  It authorizes the topo, never the image: that stays `requireFreeBlockImage` / `ownBlockImage`. */
export async function requireEditableTopoWithFile(db: Db, userRegions: UserRegion[], topoId: number) {
  const topo = await requireRow(
    () =>
      db.query.topos.findFirst({
        where: eq(topos.id, topoId),
        with: { ...liveBlock, file: { columns: topoFileColumns } },
      }),
    (row) => canEditTopo(userRegions, row),
    formError('topo_notFound'),
  )

  return assertBlockLive(topo)
}

function assertBlockLive<T extends { block?: null | { deletedAt: Date | null }; blockFk: null | number; }>(topo: T): T {
  // A null `blockFk` has nothing to check; a set one whose join came back empty is not a pass.
  if (topo.blockFk != null && (topo.block == null || topo.block.deletedAt != null)) {
    error(404, formError('blocks_notFound'))
  }

  return topo
}
