import { hasMessage, resolveMessage } from '$lib/i18n/message'
import type { ActivityDto } from './dto'
import type { ActivityGroup } from './grouping'

/**
 * The headline key for a whole card. A single-activity card speaks its own verb; a
 * grouped one summarises, because "sent Rampe" would name one of four ascents. The
 * count lives in the card's sub line, so these stay one sentence per key.
 */
export function activityGroupVerbKey(group: ActivityGroup): string {
  if (group.kind === 'single') {
    return activityVerbKey(group.activities[0])
  }

  if (group.kind === 'session') {
    return 'activity_groupSession'
  }

  // Only `entity` groups can mix actors, and then no single person "edited" it.
  const actors = new Set(group.activities.map((activity) => activity.userFk))
  return actors.size > 1 ? 'activity_groupEditsMultiple' : 'activity_groupEdits'
}

/** The headline verb for an activity, e.g. "added the route" or "flashed". */
export function activityVerb(activity: ActivityDto, params?: Record<string, unknown>): string {
  return resolveMessage(activityVerbKey(activity), params)
}

/** The most specific verb key paraglide actually has for this activity. */
export function activityVerbKey(activity: ActivityDto): string {
  const keys = activityVerbKeys(activity)
  return keys.find(hasMessage) ?? keys[keys.length - 1]
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

  // `ascent` created rows carry the ascent type in `newValue` rather than a column name.
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
