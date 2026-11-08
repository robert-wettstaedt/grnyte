import { collections } from '$lib/powersync/collections'
import { psResource } from '$lib/powersync/resource.svelte'
import { toZeroRow } from '$lib/powersync/rows'
import type { queries } from '$lib/zero/queries'
import type { QueryRow } from '$lib/zero/types'
import { eq, toArray, type InitialQueryBuilder } from '@tanstack/db'
import { toMediaFile } from './mapper'

// The row the mapper was written against, from Zero's query type.
type FileRow = QueryRow<typeof queries.listRouteFiles>
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the builder's ref types do not survive a helper
type Ref = any
type SyncedFile = { author: object[]; stream: object[] }

/** Files with their video and author, as Zero's `.related('bunnyStream').related('author')` nested them. */
export function fileTrees(q: InitialQueryBuilder, where: (f: Ref) => Ref) {
  const { bunny_streams, files, users } = collections()
  return q
    .from({ f: files })
    .where(({ f }) => where(f))
    .orderBy(({ f }) => f.id, 'asc')
    .select(({ f }) => ({
      ...f,
      author: toArray(q.from({ u: users }).where(({ u }) => eq(u.nid, f.created_by))),
      stream: toArray(q.from({ s: bunny_streams }).where(({ s }) => eq(s.id, f.bunny_stream_fk))),
    }))
}

/** A synced file from {@link fileTrees}, as the mapper reads it. */
export const toFileRow = (file: SyncedFile): FileRow => ({
  ...toZeroRow<FileRow>('files', file),
  author: file.author[0] && toZeroRow<FileRow['author']>('users', file.author[0]),
  bunnyStream: file.stream[0] && toZeroRow<FileRow['bunnyStream']>('bunny_streams', file.stream[0]),
})

/** The media files attached directly to a route. */
export function routeFileList(routeId: () => number) {
  return psResource(
    (q) => fileTrees(q, (f) => eq(f.route_fk, routeId())),
    [routeId],
    (rows) => rows.map((row) => toMediaFile(toFileRow(row))),
    ['guidebook', 'media', 'members'],
  )
}
