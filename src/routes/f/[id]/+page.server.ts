import { checkRegionPermission, REGION_PERMISSION_READ } from '$lib/auth'
import { enrichMarkdown } from '$lib/components/Markdown/lib'
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
    where: eq(files.id, params.id),
    columns: {
      id: true,
      path: true,
      width: true,
      height: true,
      bunnyStreamFk: true,
      regionFk: true,
      visibility: true,
      createdAt: true,
    },
    with: {
      author: {
        columns: { id: true, username: true },
        // For the reference-data fixture's grading scale when the viewer has no setting of
        // their own (anon visitors); see `gradingScale` below.
        with: { userSettings: { columns: { gradingScale: true } } },
      },
      bunnyStream: { columns: { source: true } },
      route: { columns: { id: true, name: true, gradeFk: true, userGradeFk: true, rating: true, userRating: true } },
      ascent: {
        columns: {
          id: true,
          type: true,
          dateTime: true,
          notes: true,
          gradeFk: true,
          rating: true,
          temperature: true,
          humidity: true,
          createdBy: true,
        },
        with: {
          route: {
            columns: { id: true, name: true, gradeFk: true, userGradeFk: true, rating: true, userRating: true },
          },
        },
      },
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
    ascentCreatedBy,
    route:
      routeRow == null
        ? undefined
        : {
            id: routeRow.id,
            name: routeRow.name ?? '',
            gradeFk: routeRow.userGradeFk ?? routeRow.gradeFk ?? undefined,
            rating: routeRow.userRating ?? routeRow.rating ?? undefined,
          },
    ascent:
      row.ascent == null
        ? undefined
        : {
            id: row.ascent.id,
            type: row.ascent.type,
            dateTime: new Date(row.ascent.dateTime).getTime(),
            notes,
            gradeFk: row.ascent.gradeFk ?? undefined,
            rating: row.ascent.rating ?? undefined,
            temperature: row.ascent.temperature ?? undefined,
            humidity: row.ascent.humidity ?? undefined,
          },
  }

  const grades = (await db.query.grades.findMany()).map(toGrade)
  // The viewer's own scale wins; for an anon visitor (no setting) fall back to the file
  // creator's scale before the FB default, so the caption reads in the author's system.
  const gradingScale = locals.user?.userSettings?.gradingScale ?? row.author?.userSettings?.gradingScale ?? 'FB'
  const user =
    locals.user == null
      ? undefined
      : { id: locals.user.id, username: locals.user.username, userSettings: locals.user.userSettings ?? undefined }

  // The share/delete toolbar is signed-in only; permissions (mirroring the files RLS incl.
  // the own-ascent grant) are resolved here and handed over as booleans.
  const controls =
    locals.session == null
      ? null
      : {
          canEdit: canEditFile(locals.userRegions, locals.user?.id, file),
          canDelete: canDeleteFile(locals.userRegions, locals.user?.id, file),
          shareText: file.route?.name ?? '',
        }

  // Data minimization: an anonymous viewer's UI renders none of the internal ids, so the
  // payload zeroes them (region, uploader, route, ascent, ascent owner) to leak no
  // cross-file correlation handles. Signed-in viewers keep them for their in-app links.
  const clientFile: MediaFile =
    locals.session != null
      ? file
      : {
          ...file,
          regionFk: 0,
          ascentCreatedBy: undefined,
          uploader: file.uploader == null ? undefined : { id: 0, username: file.uploader.username },
          route: file.route == null ? undefined : { ...file.route, id: 0 },
          ascent: file.ascent == null ? undefined : { ...file.ascent, id: 0 },
        }

  return { file: clientFile, grades, gradingScale, user, controls }
}) satisfies PageServerLoad
