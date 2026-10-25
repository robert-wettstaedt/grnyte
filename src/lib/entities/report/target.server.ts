import { resolve } from '$app/paths'
import { areas, ascents, blocks, files, reactions, routes, topos } from '$lib/db/schema'
import { blockName } from '$lib/entities/block/mapper'
import { toDisplayName } from '$lib/entities/displayName'
import { fileParent } from '$lib/entities/file/mapper'
import { entityHref } from '$lib/entities/href'
import { excerpt, type RemovableKind } from '$lib/entities/moderation/dto'
import { holderName } from '$lib/entities/moderation/subjects.server'
import type { Context } from '$lib/remote/authed.server'
import { and, eq, isNull } from 'drizzle-orm'

export interface ReportTarget {
  authorFk: null | number
  href: string
  /** A comment's is an excerpt of its words, for admins only. */
  name: string
  regionFk: number
}

const live = { columns: { deletedAt: true, name: true } } as const
const liveBlock = { columns: { deletedAt: true, name: true, order: true } } as const

/** The object while it still stands: not deleted, by itself or with whatever holds it. */
export async function reportTarget(
  db: Pick<Context['db'], 'query'>,
  kind: RemovableKind,
  id: string,
): Promise<ReportTarget | undefined> {
  const n = Number(id)
  if (kind !== 'file' && !Number.isSafeInteger(n)) return undefined
  switch (kind) {
    case 'area': {
      const row = await db.query.areas.findFirst({ where: and(eq(areas.id, n), isNull(areas.deletedAt)) })
      return row && target(row.createdBy, entityHref('areas', n), toDisplayName(row.name ?? ''), row.regionFk)
    }
    case 'block': {
      const row = await db.query.blocks.findFirst({ where: and(eq(blocks.id, n), isNull(blocks.deletedAt)) })
      return (
        row && target(row.createdBy, entityHref('blocks', n), blockName(row.name ?? '', row.order ?? 0), row.regionFk)
      )
    }
    case 'route': {
      const row = await db.query.routes.findFirst({ where: and(eq(routes.id, n), isNull(routes.deletedAt)) })
      return row && target(row.createdBy, entityHref('routes', n), toDisplayName(row.name ?? ''), row.regionFk)
    }
    case 'ascent': {
      const row = await db.query.ascents.findFirst({
        where: and(eq(ascents.id, n), isNull(ascents.deletedAt)),
        with: { route: live },
      })
      if (row?.route == null || row.route.deletedAt != null) return undefined
      return target(row.createdBy, entityHref('ascents', n), toDisplayName(row.route.name ?? ''), row.regionFk)
    }
    case 'topo': {
      const row = await db.query.topos.findFirst({
        where: eq(topos.id, n),
        with: { block: liveBlock, file: { columns: { createdBy: true } } },
      })
      if (row?.block == null || row.block.deletedAt != null || row.blockFk == null) return undefined
      return target(
        row.file?.createdBy ?? null,
        entityHref('blocks', row.blockFk),
        blockName(row.block.name ?? '', row.block.order ?? 0),
        row.regionFk,
      )
    }
    case 'file': {
      const row = await db.query.files.findFirst({
        where: eq(files.id, id),
        with: {
          area: live,
          ascent: { columns: { deletedAt: true }, with: { route: live } },
          block: liveBlock,
          route: live,
        },
      })
      const parent = row == null ? undefined : fileParent(row)
      const holder = row == null ? undefined : (row.route ?? row.ascent ?? row.block ?? row.area)
      if (row == null || parent == null || holder == null || holder.deletedAt != null) return undefined
      if (row.ascent?.route?.deletedAt != null) return undefined
      return target(
        row.createdBy,
        `${entityHref(`${parent.type}s`, parent.id)}?media=${row.id}`,
        holderName(row),
        row.regionFk,
      )
    }
    case 'comment': {
      const row = await db.query.reactions.findFirst({
        where: and(eq(reactions.id, n), eq(reactions.type, 'comment'), isNull(reactions.deletedAt)),
      })
      if (row?.body == null) return undefined
      return target(
        row.userFk,
        `${resolve('/(app)/events/[id]', { id: String(row.eventFk) })}?comment=${row.id}`,
        excerpt(row.body),
        row.regionFk,
      )
    }
  }
}

const target = (authorFk: null | number, href: string, name: string, regionFk: number): ReportTarget => ({
  authorFk,
  href,
  name,
  regionFk,
})
