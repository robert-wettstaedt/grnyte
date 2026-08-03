/**
 * How a location change stores its old/new pair on an activity row.
 *
 * Its own file rather than `map.ts` because the writers are server code: `map.ts` reaches for
 * `navigator` and the unit preference to format distances, and none of that belongs in a
 * remote function's bundle for two string helpers. The type import below is erased at build,
 * so this module has no runtime dependencies at all.
 */
import type { Coords } from './map'

/** A pin as an activity row stores it. `estimated` marks a rough guess (an EXIF backfill, or
 *  a pin the author flagged as approximate), which the feed then says out loud. */
export type StoredCoords = Coords & { estimated: boolean }

/**
 * `"47.123456,8.567890"`, with a leading `~` for an estimated pin.
 *
 * Six decimals is ~0.1 m, well past what any pin is accurate to. A string rather than JSON in
 * `metadata` because `oldValue`/`newValue` is where every other change renderer already looks.
 */
export const stringifyCoords = ({ lat, long }: Coords, estimated = false): string =>
  `${estimated ? '~' : ''}${lat.toFixed(6)},${long.toFixed(6)}`

/** The inverse. `null` for anything unparseable, which includes every location row written
 *  before the writers stored coordinates: those hold no value and render as they always did. */
export const parseCoords = (value: null | string | undefined): null | StoredCoords => {
  if (value == null || value.length === 0) {
    return null
  }

  const estimated = value.startsWith('~')
  const [lat, long] = (estimated ? value.slice(1) : value).split(',').map(Number)

  return Number.isFinite(lat) && Number.isFinite(long) ? { estimated, lat, long } : null
}
