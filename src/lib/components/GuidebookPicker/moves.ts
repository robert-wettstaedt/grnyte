import { moveAreas } from '$lib/entities/area/writes'
import { moveBlocks } from '$lib/entities/block/writes'
import type { MergeKind } from '$lib/entities/merge/sides'
import { moveRoutes } from '$lib/entities/route/writes'
import { m } from '$lib/paraglide/messages'
import { withUndo } from '$lib/state/toast'

export type MoveKind = MergeKind

// A move keeps the reader on the same screen, so its Undo need not wait for them to find it.
const MOVE_UNDO_MS = 10_000

/** Move, then offer Undo, which moves each row back to where the server said it was. */
export function moveWithUndo(
  kind: MoveKind,
  selected: readonly number[],
  to: null | number,
  topoLines: number,
  destination: string,
) {
  // A plain copy: a $state selection arrives as a proxy, and Zero freezes mutation arguments.
  const ids = [...selected]
  const message = m.moves_moved({ name: destination })
  if (kind === 'routes') {
    return withUndo(moveRoutes({ blockId: to!, knownTopoLines: topoLines, routeIds: ids }), {
      duration: MOVE_UNDO_MS,
      message,
      onUndo: async ({ previous }) => {
        for (const [blockId, rows] of groupBy(previous, (row) => row.blockId)) {
          await moveRoutes({ blockId: blockId!, knownTopoLines: 0, routeIds: rows.map((row) => row.id) })
        }
      },
    })
  }
  if (kind === 'blocks') {
    return withUndo(moveBlocks({ areaId: to!, blockIds: ids }), {
      duration: MOVE_UNDO_MS,
      message,
      onUndo: async ({ previous }) => {
        for (const { areaId, order } of previous) {
          await moveBlocks({ areaId, blockIds: order.filter((id) => ids.includes(id)), restoreOrder: order })
        }
      },
    })
  }
  return withUndo(moveAreas({ areaIds: ids, parentId: to }), {
    duration: MOVE_UNDO_MS,
    message,
    onUndo: async ({ previous }) => {
      for (const [parentId, rows] of groupBy(previous, (row) => row.parentId)) {
        await moveAreas({ areaIds: rows.map((row) => row.id), parentId })
      }
    },
  })
}

function groupBy<T>(rows: T[], key: (row: T) => null | number) {
  const groups = new Map<null | number, T[]>()
  for (const row of rows) {
    const k = key(row)
    const group = groups.get(k)
    if (group) group.push(row)
    else groups.set(k, [row])
  }
  return groups
}
