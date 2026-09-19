import { fingerprint } from '$lib/forms/fingerprint'

/** One first ascensionist, in the shape both sides can see: the client's `RouteDetail` carries the
 *  name and the account it points at, never the row id. */
export interface FingerprintClimber {
  name: string
  userFk?: number
}

/** A fingerprint of the two lists a route form loaded, so a save proves what it replaces. Sorted
 *  because neither list has an order the reader chose, and compared with `<`, never
 *  `localeCompare`, for the reason `fingerprint` gives. */
export function routeListsFingerprint(tags: string[], firstAscents: FingerprintClimber[]): string {
  const climbers = firstAscents
    .map((climber): [string, null | number] => [climber.name, climber.userFk ?? null])
    .sort((a, b) => (a[0] === b[0] ? Number(a[1] ?? -1) - Number(b[1] ?? -1) : a[0] < b[0] ? -1 : 1))

  const canonical = JSON.stringify([[...tags].sort(), climbers])

  return `${tags.length}.${firstAscents.length}-${fingerprint(canonical)}`
}
