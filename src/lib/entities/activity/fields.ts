import type { IconName } from '$lib/components/Icon/icons'

export interface ActivityField {
  icon: IconName
  /** Paraglide key for the column's label. Resolve with `activityMessage`. */
  labelKey: string
  renderer: ChangeRenderer
}

/** How the expanded change list renders a column's old/new pair. */
export type ChangeRenderer =
  | 'chips'
  | 'file'
  | 'grade'
  | 'location'
  | 'prose'
  | 'rating'
  | 'tags'
  | 'text'
  | 'topo'
  | 'user'

/**
 * Every `columnName` the mutation layer writes today, mapped to one label, one icon and one
 * diff renderer. Single source so `en` and `de` cannot drift per screen.
 */
export const activityFields: Record<string, ActivityField> = {
  dateTime: { icon: 'history', labelKey: 'activity_fieldDateTime', renderer: 'text' },
  description: { icon: 'file-text', labelKey: 'activity_fieldDescription', renderer: 'prose' },
  file: { icon: 'image', labelKey: 'activity_fieldFile', renderer: 'file' },
  firstAscensionists: { icon: 'users', labelKey: 'activity_fieldFirstAscensionists', renderer: 'chips' },
  firstAscentYear: { icon: 'history', labelKey: 'activity_fieldFirstAscentYear', renderer: 'text' },
  gradeFk: { icon: 'trending-up', labelKey: 'activity_fieldGrade', renderer: 'grade' },
  humidity: { icon: 'info', labelKey: 'activity_fieldHumidity', renderer: 'text' },
  invitation: { icon: 'user', labelKey: 'activity_fieldInvitation', renderer: 'user' },
  location: { icon: 'map-pin', labelKey: 'activity_fieldLocation', renderer: 'location' },
  name: { icon: 'edit', labelKey: 'activity_fieldName', renderer: 'text' },
  notes: { icon: 'file-text', labelKey: 'activity_fieldNotes', renderer: 'prose' },
  'parking location': { icon: 'parking', labelKey: 'activity_fieldParkingLocation', renderer: 'location' },
  rating: { icon: 'star', labelKey: 'activity_fieldRating', renderer: 'rating' },
  role: { icon: 'users-round', labelKey: 'activity_fieldRole', renderer: 'user' },
  tags: { icon: 'bookmark', labelKey: 'activity_fieldTags', renderer: 'tags' },
  temperature: { icon: 'info', labelKey: 'activity_fieldTemperature', renderer: 'text' },
  topo: { icon: 'route', labelKey: 'activity_fieldTopo', renderer: 'topo' },
  type: { icon: 'pickaxe', labelKey: 'activity_fieldType', renderer: 'text' },
  username: { icon: 'user', labelKey: 'activity_fieldUsername', renderer: 'user' },
}

/** The registry entry for a column, or `undefined` for a column nothing writes yet. */
export function activityField(columnName: string | undefined): ActivityField | undefined {
  return columnName == null ? undefined : activityFields[columnName]
}
