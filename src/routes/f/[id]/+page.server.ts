import { checkRegionPermission, REGION_PERMISSION_READ } from '$lib/auth'
import { enrichMarkdown } from '$lib/components/Markdown/lib/enrich.server'
import { db } from '$lib/db/db.server'
import { files } from '$lib/db/schema'
import type { MediaFile } from '$lib/entities/file/dto'
import { toMediaFile } from '$lib/entities/file/mapper'
import { canDeleteFile, canEditFile } from '$lib/entities/file/permissions'
import { toGrade } from '$lib/entities/grade/mapper'
import { error } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import type { PageServerLoad } from './$types'

// The single-file share page (`/f/<id>`) is reachable by anonymous visitors (see the
// authGuard allowlist). It uses the privileged `db` and does its own gating rather than a
// zero query: RLS would hide even public files from a non-member, so we can't sync them.
//
// The page renders the regular in-app media viewer (MediaStage) fed by a static global-state
// fixture, so the load hands back exactly what that component + its ShareSheet need: one
// MediaFile, the reference data for the fixture, and (signed-in only) the toolbar permissions.
// A public file is shown to anyone; a private one only to members of its region.
export const load = (async ({ locals, params }) => {
  const row = await db.query.files.findFirst({
    columns: {
      areaFk: true,
      ascentFk: true,
      blockFk: true,
      bunnyStreamFk: true,
      createdAt: true,
      height: true,
      id: true,
      path: true,
      regionFk: true,
      // The owning entity, so a delete can send the user back to it (see `parent` below).
      routeFk: true,
      visibility: true,
      width: true,
    },
    where: eq(files.id, params.id),
    with: {
      ascent: {
        columns: {
          createdBy: true,
          dateTime: true,
          gradeFk: true,
          humidity: true,
          id: true,
          notes: true,
          rating: true,
          temperature: true,
          type: true,
        },
        with: {
          route: {
            columns: { gradeFk: true, id: true, name: true, rating: true, userGradeFk: true, userRating: true },
          },
        },
      },
      author: {
        columns: { id: true, username: true },
        // For the reference-data fixture's grading scale when the viewer has no setting of
        // their own (anon visitors); see `gradingScale` below.
        with: { userSettings: { columns: { gradingScale: true } } },
      },
      bunnyStream: { columns: { source: true } },
      route: { columns: { gradeFk: true, id: true, name: true, rating: true, userGradeFk: true, userRating: true } },
    },
  })

  if (row == null) {
    error(404)
  }

  const isMember = checkRegionPermission(locals.userRegions, [REGION_PERMISSION_READ], row.regionFk)

  // A file with no bytes to show (still uploading, or a stray row) is a 404 to everyone.
  if (row.path.length === 0 && row.bunnyStreamFk == null) {
    error(404)
  }

  if (row.visibility !== 'public' && !isMember) {
    error(404)
  }

  const routeRow = row.route ?? row.ascent?.route ?? null
  const ascentCreatedBy = row.ascent?.createdBy ?? undefined

  // Pre-resolve `!type:id!` reference tokens against the DB so <Markdown> renders the notes
  // without a Zero client (its Zero path only fires for the un-enriched token form). Scoped
  // to the file's region so a public share can't leak names of entities in other regions.
  const notes = row.ascent == null ? '' : await enrichMarkdown(row.ascent.notes ?? '', db, row.regionFk)

  const file: MediaFile = {
    ...toMediaFile({ ...row, createdAt: new Date(row.createdAt).getTime() }),
    ascent:
      row.ascent == null
        ? undefined
        : {
            dateTime: new Date(row.ascent.dateTime).getTime(),
            gradeFk: row.ascent.gradeFk ?? undefined,
            humidity: row.ascent.humidity ?? undefined,
            id: row.ascent.id,
            notes,
            rating: row.ascent.rating ?? undefined,
            temperature: row.ascent.temperature ?? undefined,
            type: row.ascent.type,
          },
    ascentCreatedBy,
    route:
      routeRow == null
        ? undefined
        : {
            gradeFk: routeRow.userGradeFk ?? routeRow.gradeFk ?? undefined,
            id: routeRow.id,
            name: routeRow.name ?? '',
            rating: routeRow.userRating ?? routeRow.rating ?? undefined,
          },
  }

  const grades = (await db.query.grades.findMany()).map(toGrade)
  // The viewer's own scale wins; for an anon visitor (no setting) fall back to the file
  // creator's scale before the FB default, so the caption reads in the author's system.
  const gradingScale = locals.user?.userSettings?.gradingScale ?? row.author?.userSettings?.gradingScale ?? 'FB'
  const user =
    locals.user == null
      ? undefined
      : {
          id: locals.user.id,
          username: locals.user.username,
          // MediaStage renders the ascent's conditions, so hand the viewer's real unit preference
          // through; the page sets it as the override so the caption reads in their system.
          userSettings: locals.user.userSettings ?? undefined,
        }

  // The entity this file hangs on (exactly one FK is set), so a delete can navigate back to
  // it instead of home. Same precedence as deleteFile's event target.
  const parent: null | { id: number; type: 'area' | 'ascent' | 'block' | 'route' } =
    row.routeFk != null
      ? { id: row.routeFk, type: 'route' }
      : row.ascentFk != null
        ? { id: row.ascentFk, type: 'ascent' }
        : row.blockFk != null
          ? { id: row.blockFk, type: 'block' }
          : row.areaFk != null
            ? { id: row.areaFk, type: 'area' }
            : null

  // The share/delete toolbar is signed-in only; permissions (mirroring the files RLS incl.
  // the own-ascent grant) are resolved here and handed over as booleans.
  const controls =
    locals.claims == null
      ? null
      : {
          canDelete: canDeleteFile(locals.userRegions, locals.user?.id, file),
          canEdit: canEditFile(locals.userRegions, locals.user?.id, file),
          parent,
          shareText: file.route?.name ?? '',
        }

  // Data minimization: an anonymous viewer's UI renders none of the internal ids, so the
  // payload zeroes them (region, uploader, route, ascent, ascent owner) to leak no
  // cross-file correlation handles. Signed-in viewers keep them for their in-app links.
  const clientFile: MediaFile =
    locals.claims != null
      ? file
      : {
          ...file,
          ascent: file.ascent == null ? undefined : { ...file.ascent, id: 0 },
          ascentCreatedBy: undefined,
          regionFk: 0,
          route: file.route == null ? undefined : { ...file.route, id: 0 },
          uploader: file.uploader == null ? undefined : { id: 0, username: file.uploader.username },
        }

  return { controls, file: clientFile, grades, gradingScale, user }
}) satisfies PageServerLoad
