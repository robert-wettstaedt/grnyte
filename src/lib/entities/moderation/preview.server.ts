import { resolve } from '$app/paths'
import { areas, ascents, blocks, files, reactions, routes, topos, users } from '$lib/db/schema'
import { blockName } from '$lib/entities/block/mapper'
import { toAuthor, toDisplayName } from '$lib/entities/displayName'
import { fileParent } from '$lib/entities/file/mapper'
import { entityHref } from '$lib/entities/href'
import { formError } from '$lib/forms/schemas'
import type * as z from '$lib/forms/zod'
import type { Context } from '$lib/remote/authed.server'
import { requireRow } from '$lib/remote/require.server'
import { error } from '@sveltejs/kit'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import type { RemovableKind, RemovalItem, RemovalPreview, removalTargetSchema } from './dto'
import { canModerate } from './permissions'
import { collectSubjects, holder, holderName } from './subjects.server'

const NAMED = 1

/** Refused like the removal itself. */
export async function previewRemoval(
  { id, kind }: z.output<typeof removalTargetSchema>,
  { db, user, userRegions }: Pick<Context, 'db' | 'user' | 'userRegions'>,
): Promise<RemovalPreview> {
  const { item } = await requireRow(
    () => itemOf(db, kind, id),
    (row) => canModerate(userRegions, row.regionFk),
    formError('moderation_notFound'),
  )

  const subjects = await collectSubjects(db, { id, kind }, user.id)
  if (subjects.length === 0) error(400, formError('moderation_nothingOfOthers'))

  // An author who deleted their account is told nothing; one who left the region still is.
  const told = subjects.flatMap((subject) => (subject.userFk == null ? [] : [subject.userFk]))
  const people =
    told.length === 0
      ? []
      : await db.query.users.findMany({ columns: { id: true, username: true }, where: inArray(users.id, told) })
  const names = people.map((person) => toAuthor(person.id, person.username).name).sort()

  return { item, names: names.slice(0, NAMED), others: Math.max(0, told.length - NAMED) }
}

const author = { columns: { id: true, username: true } } as const

async function itemOf(
  db: Context['db'],
  kind: RemovableKind,
  id: string,
): Promise<undefined | { item: RemovalItem; regionFk: number }> {
  const n = Number(id)
  if (kind !== 'file' && !Number.isSafeInteger(n)) return undefined
  switch (kind) {
    case 'area': {
      const row = await db.query.areas.findFirst({ where: and(eq(areas.id, n), isNull(areas.deletedAt)) })
      return (
        row && {
          item: {
            body: row.description ?? undefined,
            home: entityHref('areas', row.id),
            parentFk: row.parentFk,
            title: toDisplayName(row.name ?? ''),
          },
          regionFk: row.regionFk,
        }
      )
    }
    case 'block': {
      const row = await db.query.blocks.findFirst({ where: and(eq(blocks.id, n), isNull(blocks.deletedAt)) })
      return (
        row && {
          item: {
            body: row.description ?? undefined,
            home: entityHref('blocks', row.id),
            parentFk: row.areaFk,
            title: blockName(row.name ?? '', row.order ?? 0),
          },
          regionFk: row.regionFk,
        }
      )
    }
    case 'route': {
      const row = await db.query.routes.findFirst({ where: and(eq(routes.id, n), isNull(routes.deletedAt)) })
      return (
        row && {
          item: {
            body: row.description ?? undefined,
            home: entityHref('routes', row.id),
            parentFk: row.blockFk,
            title: toDisplayName(row.name ?? ''),
          },
          regionFk: row.regionFk,
        }
      )
    }
    case 'ascent': {
      const row = await db.query.ascents.findFirst({
        where: and(eq(ascents.id, n), isNull(ascents.deletedAt)),
        with: { author, route: { columns: { name: true } } },
      })
      return (
        row && {
          item: {
            body: row.notes ?? undefined,
            byline: toAuthor(row.createdBy, row.author?.username).name,
            home: entityHref('routes', row.routeFk),
            title: toDisplayName(row.route?.name ?? ''),
          },
          regionFk: row.regionFk,
        }
      )
    }
    case 'topo': {
      const row = await db.query.topos.findFirst({
        where: eq(topos.id, n),
        with: { block: { columns: { name: true, order: true } }, file: { columns: { path: true } } },
      })
      return (
        row && {
          item: {
            home: row.blockFk == null ? resolve('/feed') : entityHref('blocks', row.blockFk),
            image: row.file?.path ?? undefined,
            title: blockName(row.block?.name ?? '', row.block?.order ?? 0),
          },
          regionFk: row.regionFk,
        }
      )
    }
    case 'file': {
      const row = await db.query.files.findFirst({ where: eq(files.id, id), with: holder })
      const parent = row == null ? undefined : fileParent(row)
      return (
        row && {
          item: {
            home: parent == null ? resolve('/feed') : entityHref(`${parent.type}s`, Number(parent.id)),
            image: row.bunnyStreamFk == null ? row.path : undefined,
            title: holderName(row),
          },
          regionFk: row.regionFk,
        }
      )
    }
    case 'comment': {
      const row = await db.query.reactions.findFirst({
        where: and(eq(reactions.id, n), eq(reactions.type, 'comment'), isNull(reactions.deletedAt)),
        with: { user: author },
      })
      return (
        row && {
          item: {
            body: row.body,
            byline: toAuthor(row.userFk, row.user?.username).name,
            home: resolve('/(app)/events/[id]', { id: String(row.eventFk) }),
            title: '',
          },
          regionFk: row.regionFk,
        }
      )
    }
  }
}
