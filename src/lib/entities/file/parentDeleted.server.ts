/** Joined only to prove a file's parent is live, never rendered. */
export const PARENT_DELETED_WITH = {
  area: { columns: { deletedAt: true } },
  ascent: { columns: { deletedAt: true } },
  block: { columns: { deletedAt: true } },
  route: { columns: { deletedAt: true } },
} as const

type Parent = null | undefined | { deletedAt: Date | null }

/** A soft-deleted parent takes its files with it. One level only: the delete cascade stamps descendants. */
export const hasDeletedParent = (row: { area?: Parent; ascent?: Parent; block?: Parent; route?: Parent }): boolean =>
  [row.area, row.ascent, row.block, row.route].some((parent) => parent?.deletedAt != null)
