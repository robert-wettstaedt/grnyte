import type { RemovableKind } from '$lib/entities/moderation/dto'
import { collections } from '$lib/powersync/collections'
import { psResource } from '$lib/powersync/resource.svelte'
import { toZeroRow } from '$lib/powersync/rows'
import type { ContentReport } from '$lib/zero/zero-schema.gen'

// The stream holds the caller's own open reports only, so no filter by reporter.
const openReports = <T>(select: (rows: ContentReport[]) => T) =>
  psResource(
    (q) => q.from({ r: collections().content_reports }),
    [],
    (rows) => select(rows.map((row) => toZeroRow<ContentReport>('content_reports', row))),
    'essentials',
  )

export function myOpenReport(kind: () => RemovableKind, id: () => string) {
  return openReports((rows) => rows.find((row) => row.objectType === kind() && row.objectId === id()))
}

export function myReportedIds(kind: RemovableKind) {
  return openReports((rows) => rows.filter((row) => row.objectType === kind).map((row) => row.objectId))
}
