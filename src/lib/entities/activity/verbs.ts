import { hasMessage, resolveMessage } from '$lib/i18n/message'
import type { ActivityDto } from './dto'

/** The headline verb for an activity, e.g. "added the route" or "flashed". */
export function activityVerb(activity: ActivityDto, params?: Record<string, unknown>): string {
  const keys = activityVerbKeys(activity)
  return resolveMessage(keys.find(hasMessage) ?? keys[keys.length - 1], params)
}

/**
 * Verb keys from most to least specific: the entity, its change type and the column that
 * changed, falling back to the column-less verb. So `activity_routeUpdatedGradeFk` degrades
 * to `activity_routeUpdated` rather than needing all 30 combinations spelled out.
 *
 * `deleted` gets no such fallback: there the column-less verb says the entity itself is
 * gone, so degrading a removed photo to `activity_routeDeleted` would claim a live route
 * was deleted. A missing key renders as the key, the louder failure of the two.
 */
export function activityVerbKeys(activity: ActivityDto): string[] {
  const base = `activity_${activity.entityType}${capitalize(activity.type)}`

  // `ascent` created rows carry the tick type in `newValue` rather than a column name.
  const suffix =
    activity.entityType === 'ascent' && activity.type === 'created' ? activity.newValue : activity.columnName

  if (suffix == null || suffix.length === 0) {
    return [base]
  }

  const specific = `${base}${capitalize(toCamelCase(suffix))}`
  return activity.type === 'deleted' ? [specific] : [specific, base]
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/** `parking location` -> `parkingLocation`; every other column name is already camel case. */
function toCamelCase(value: string): string {
  return value.replace(/[\s_-](\w)/g, (_, char: string) => char.toUpperCase())
}
