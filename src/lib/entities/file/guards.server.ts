/**
 * Database-backed authorization for file mutations, split out of `files.remote.ts` so it can be
 * imported from a test (a `.remote.ts` module cannot). Every gate here is a query, so it needs a
 * real database, not a mock.
 *
 * `resolveAttachRegion` is the single gate shared by `finalizeImage` and `finalizeVideo`, so image
 * and video attach can never diverge again (they once did: the image path shipped with no check).
 */
import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
import * as schema from '$lib/db/schema'
import { files } from '$lib/db/schema'
import type { UserRegion } from '$lib/entities/region/dto'
import { formError } from '$lib/forms/schemas'
import { error } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { canEditFile } from './permissions'
import type { FileEntityType } from './upload'

type Db = PostgresJsDatabase<typeof schema>

/**
 * Load a file for a visibility change, gating on {@link canEditFile}: which is deliberately stricter
 * than the files UPDATE RLS for ascent media (publishing an ascent file exposes the whole ascent, so
 * a maintainer must not flip someone else's public). 404/403 via `error`.
 */
export async function requireEditableFile(
  db: Db,
  userRegions: UserRegion[],
  userId: number | undefined,
  fileId: string,
) {
  const file = await db.query.files.findFirst({
    where: eq(files.id, fileId),
    with: { ascent: { columns: { createdBy: true } } },
  })
  if (file == null) {
    error(404, formError('files_notFound'))
  }
  if (
    !canEditFile(userRegions, userId, {
      ascentCreatedBy: file.ascent?.createdBy ?? undefined,
      regionFk: file.regionFk,
    })
  ) {
    error(403, formError('form_noPermission'))
  }
  return file
}

/**
 * Resolve and authorize attaching media to an entity, returning its region. Two rules, one per
 * branch: ascent media is personal, so only its author may attach; everything else needs EDIT. The
 * files INSERT RLS only requires READ (and for ascents is merely region-scoped, unlike the
 * owner-scoped update/delete policies), so this app gate is the effective one, hence shared.
 */
export async function resolveAttachRegion(
  db: Db,
  userId: number,
  userRegions: UserRegion[],
  type: FileEntityType,
  id: number,
): Promise<number> {
  if (type === 'ascent') {
    const ascent = await db.query.ascents.findFirst({
      columns: { createdBy: true, regionFk: true },
      where: (ascents, { and, isNull }) => and(eq(ascents.id, id), isNull(ascents.deletedAt)),
    })
    if (ascent == null) {
      error(404, formError('ascents_notFound'))
    }
    if (ascent.createdBy !== userId) {
      error(403, formError('media_onlyAscentAuthor'))
    }
    return ascent.regionFk
  }

  // Filtered like the ascent branch: bytes on a dead parent are reachable by nothing, swept by nothing.
  const columns = { regionFk: true } as const
  const entity = await (type === 'area'
    ? db.query.areas.findFirst({
        columns,
        where: (areas, { and, isNull }) => and(eq(areas.id, id), isNull(areas.deletedAt)),
      })
    : type === 'block'
      ? db.query.blocks.findFirst({
          columns,
          where: (blocks, { and, isNull }) => and(eq(blocks.id, id), isNull(blocks.deletedAt)),
        })
      : db.query.routes.findFirst({
          columns,
          where: (routes, { and, isNull }) => and(eq(routes.id, id), isNull(routes.deletedAt)),
        }))
  if (entity == null) {
    // Per entity: interpolating the raw enum would leave "block"/"area" untranslated.
    error(404, formError(type === 'area' ? 'areas_notFound' : type === 'block' ? 'blocks_notFound' : 'routes_notFound'))
  }
  if (!checkRegionPermission(userRegions, [REGION_PERMISSION_EDIT], entity.regionFk)) {
    error(403, formError('form_noPermission'))
  }
  return entity.regionFk
}
