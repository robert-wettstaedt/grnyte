import type { RemovableKind } from '$lib/entities/moderation/dto'
import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'

/** The caller's open report on one object, or undefined: what makes an entry read Reported. */
export function myOpenReport(kind: () => RemovableKind, id: () => string) {
  return createResource(
    () => queries.myOpenReports({}),
    (rows) => rows.find((row) => row.objectType === kind() && row.objectId === id()),
  )
}

/** The ids of every object of one kind the caller has an open report on, for a list of them. */
export function myReportedIds(kind: RemovableKind) {
  return createResource(
    () => queries.myOpenReports({}),
    (rows) => rows.filter((row) => row.objectType === kind).map((row) => row.objectId),
  )
}
