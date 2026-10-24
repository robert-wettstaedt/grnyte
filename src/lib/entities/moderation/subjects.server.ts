import { areas, ascents, blocks, files, reactions, routes, topos } from '$lib/db/schema'
import { collectAreaSubtreeIds } from '$lib/entities/area/lifecycle.server'
import { blockName } from '$lib/entities/block/mapper'
import { toDisplayName, type DisplayName } from '$lib/entities/displayName'
import { formError } from '$lib/forms/schemas'
import type { Context } from '$lib/remote/authed.server'
import { error } from '@sveltejs/kit'
import { and, eq, inArray, isNull, or } from 'drizzle-orm'
import { excerpt, type RemovableKind, type RemovalInput, type RemovedItem } from './dto'
import { canModerate } from './permissions'
import type { Removal } from './record.server'

type Authored = RemovedItem & { createdBy: null | number }
type Caller = Pick<Context, 'user' | 'userRegions'>

type PlannedRoot = Root & { regionFk: number }

type Root = { id: number | string; kind: RemovableKind }
/** Grouped by author, minus the admin. `userFk: null` is an author who deleted their account: recorded, told nothing. */
export async function collectSubjects(db: Context['db'], root: Root, actorFk: number): Promise<Removal['subjects']> {
  const rows = await authoredRows(db, root)
  const byAuthor = new Map<null | number, RemovedItem[]>()
  for (const { createdBy, kind, name } of rows) {
    if (createdBy === actorFk) continue
    let items = byAuthor.get(createdBy)
    if (items == null) byAuthor.set(createdBy, (items = []))
    items.push({ kind, name })
  }
  return [...byAuthor].map(([userFk, items]) => ({ items, userFk }))
}

export async function planRemoval(
  db: Context['db'],
  root: PlannedRoot,
  removal: RemovalInput,
  caller: Caller,
): Promise<Removal>
export async function planRemoval(
  db: Context['db'],
  root: PlannedRoot,
  removal: RemovalInput | undefined,
  caller: Caller,
): Promise<Removal | undefined>
export async function planRemoval(
  db: Context['db'],
  root: PlannedRoot,
  removal: RemovalInput | undefined,
  { user, userRegions }: Caller,
): Promise<Removal | undefined> {
  if (removal == null) return undefined
  // Region admins only: a maintainer may delete what they may, but only ever as tidying up.
  if (!canModerate(userRegions, root.regionFk)) error(403, formError('form_noPermission'))
  const actorFk = user.id
  const subjects = await collectSubjects(db, root, actorFk)
  if (subjects.length === 0) error(400, formError('moderation_nothingOfOthers'))
  return {
    actorFk,
    ...removal,
    object: { id: String(root.id), kind: root.kind },
    regionFk: root.regionFk,
    subjects,
  }
}

async function authoredRows(db: Context['db'], root: Root): Promise<Authored[]> {
  if (root.kind === 'comment') {
    const comment = await db.query.reactions.findFirst({
      columns: { body: true, userFk: true },
      where: and(eq(reactions.id, Number(root.id)), eq(reactions.type, 'comment'), isNull(reactions.deletedAt)),
    })
    return comment == null
      ? []
      : [{ createdBy: comment.userFk, kind: 'comment', name: toDisplayName(excerpt(comment.body)) }]
  }
  if (root.kind === 'file') {
    const file = await db.query.files.findFirst({
      columns: { createdBy: true },
      where: eq(files.id, String(root.id)),
      with: holder,
    })
    return file == null ? [] : [{ createdBy: file.createdBy, kind: 'file', name: holderName(file) }]
  }
  if (root.kind === 'topo') {
    const topo = await db.query.topos.findFirst({
      where: eq(topos.id, Number(root.id)),
      with: { block: { columns: { name: true, order: true } }, file: { columns: { createdBy: true } } },
    })
    if (topo?.file == null) return []
    return [
      { createdBy: topo.file.createdBy, kind: 'topo', name: blockName(topo.block?.name ?? '', topo.block?.order ?? 0) },
    ]
  }
  if (root.kind === 'ascent') {
    const ascent = await db.query.ascents.findFirst({
      columns: { createdBy: true, id: true },
      where: eq(ascents.id, Number(root.id)),
      with: { route: { columns: { name: true } } },
    })
    if (ascent == null) return []
    const name = toDisplayName(ascent.route?.name ?? '')
    const media = await db.query.files.findMany({ columns: { createdBy: true }, where: eq(files.ascentFk, ascent.id) })
    return [
      { createdBy: ascent.createdBy, kind: 'ascent', name },
      ...media.map((file) => ({ createdBy: file.createdBy, kind: 'file' as const, name })),
    ]
  }

  const id = Number(root.id)
  const areaIds = root.kind === 'area' ? await collectAreaSubtreeIds(db, id) : []
  const areaRows =
    root.kind === 'area'
      ? await db.query.areas.findMany({
          columns: { createdBy: true, id: true, name: true },
          where: and(inArray(areas.id, areaIds), isNull(areas.deletedAt)),
        })
      : []
  const blockRows =
    root.kind === 'route'
      ? []
      : await db.query.blocks.findMany({
          columns: { createdBy: true, id: true, name: true, order: true },
          where: and(
            root.kind === 'block' ? eq(blocks.id, id) : inArray(blocks.areaFk, areaIds),
            isNull(blocks.deletedAt),
          ),
        })
  const blockIds = blockRows.map((row) => row.id)
  const routeRows =
    root.kind !== 'route' && blockIds.length === 0
      ? []
      : await db.query.routes.findMany({
          columns: { createdBy: true, id: true, name: true },
          where: and(
            root.kind === 'route' ? eq(routes.id, id) : inArray(routes.blockFk, blockIds),
            isNull(routes.deletedAt),
          ),
        })
  const routeIds = routeRows.map((row) => row.id)
  const ascentRows =
    routeIds.length === 0
      ? []
      : await db.query.ascents.findMany({
          columns: { createdBy: true, id: true, routeFk: true },
          where: and(inArray(ascents.routeFk, routeIds), isNull(ascents.deletedAt)),
        })
  const ascentIds = ascentRows.map((row) => row.id)
  const holders = [
    areaIds.length > 0 && inArray(files.areaFk, areaIds),
    blockIds.length > 0 && inArray(files.blockFk, blockIds),
    routeIds.length > 0 && inArray(files.routeFk, routeIds),
    ascentIds.length > 0 && inArray(files.ascentFk, ascentIds),
  ].filter((condition) => condition !== false)
  const fileRows =
    holders.length === 0
      ? []
      : await db.query.files.findMany({
          columns: { areaFk: true, ascentFk: true, blockFk: true, createdBy: true, routeFk: true },
          where: or(...holders),
        })

  const areaName = new Map(areaRows.map((row) => [row.id, toDisplayName(row.name ?? '')]))
  const blockLabel = new Map(blockRows.map((row) => [row.id, blockName(row.name ?? '', row.order ?? 0)]))
  const routeName = new Map(routeRows.map((row) => [row.id, toDisplayName(row.name ?? '')]))
  const ascentRoute = new Map(ascentRows.map((row) => [row.id, row.routeFk]))
  const parentName = (file: (typeof fileRows)[number]) =>
    (file.routeFk != null && routeName.get(file.routeFk)) ||
    (file.ascentFk != null && routeName.get(ascentRoute.get(file.ascentFk) ?? -1)) ||
    (file.blockFk != null && blockLabel.get(file.blockFk)) ||
    (file.areaFk != null && areaName.get(file.areaFk)) ||
    toDisplayName('')

  return [
    ...areaRows.map((row) => ({
      createdBy: row.createdBy,
      kind: 'area' as const,
      name: areaName.get(row.id) ?? toDisplayName(''),
    })),
    ...blockRows.map((row) => ({
      createdBy: row.createdBy,
      kind: 'block' as const,
      name: blockLabel.get(row.id) ?? toDisplayName(''),
    })),
    ...routeRows.map((row) => ({
      createdBy: row.createdBy,
      kind: 'route' as const,
      name: routeName.get(row.id) ?? toDisplayName(''),
    })),
    ...ascentRows.map((row) => ({
      createdBy: row.createdBy,
      kind: 'ascent' as const,
      name: routeName.get(row.routeFk) ?? toDisplayName(''),
    })),
    ...fileRows.map((file) => ({ createdBy: file.createdBy, kind: 'file' as const, name: parentName(file) })),
  ]
}

/** What {@link holderName} reads, as a file's `with`. */
export const holder = {
  area: { columns: { name: true } },
  ascent: { columns: {}, with: { route: { columns: { name: true } } } },
  block: { columns: { name: true, order: true } },
  route: { columns: { name: true } },
} as const

/** A photo has no name of its own, so it goes by what holds it, in `fileParent`'s order. */
export function holderName(file: {
  area: null | { name: null | string }
  ascent: null | { route: null | { name: null | string } }
  block: null | { name: null | string; order: null | number }
  route: null | { name: null | string }
}): DisplayName {
  if (file.route != null) return toDisplayName(file.route.name ?? '')
  if (file.ascent?.route != null) return toDisplayName(file.ascent.route.name ?? '')
  if (file.block != null) return blockName(file.block.name ?? '', file.block.order ?? 0)
  return toDisplayName(file.area?.name ?? '')
}
