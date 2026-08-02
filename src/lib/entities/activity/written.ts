import type { ActivityListItem } from './dto'

/**
 * Every `(entityType, type, columnName)` triple the mutation layer writes today, read off
 * the `insertActivity` / `createUpdateActivity` call sites. Add a row here when a mutation
 * starts writing a new one: `verbs.test.ts` then names the missing message key, and the
 * wording story grows a card for it.
 */
export const WRITTEN_ACTIVITIES: Partial<ActivityListItem>[] = [
  { entityType: 'area', type: 'created' },
  { columnName: 'description', entityType: 'area' },
  { columnName: 'name', entityType: 'area' },
  { columnName: 'parking location', entityType: 'area' },
  { columnName: 'parking location', entityType: 'area', type: 'deleted' },
  { entityType: 'area', type: 'deleted' },
  { entityType: 'block', type: 'created' },
  { columnName: 'location', entityType: 'block' },
  { columnName: 'location', entityType: 'block', type: 'deleted' },
  { columnName: 'name', entityType: 'block' },
  { columnName: 'topo', entityType: 'block' },
  { entityType: 'block', type: 'deleted' },
  { entityType: 'route', type: 'created' },
  ...['description', 'firstAscensionists', 'firstAscentYear', 'gradeFk', 'name', 'rating', 'tags'].map(
    (columnName) => ({ columnName, entityType: 'route' }) as Partial<ActivityListItem>,
  ),
  { entityType: 'route', type: 'deleted' },
  ...['attempt', 'flash', 'redpoint', 'repeat'].map(
    (newValue) => ({ entityType: 'ascent', newValue, type: 'created' }) as Partial<ActivityListItem>,
  ),
  ...['dateTime', 'gradeFk', 'humidity', 'notes', 'rating', 'temperature', 'type'].map(
    (columnName) => ({ columnName, entityType: 'ascent' }) as Partial<ActivityListItem>,
  ),
  { entityType: 'ascent', type: 'deleted' },
  // Uploads point at the file and name what it was attached to as the parent; deletes are the
  // other way round, because by then the file is gone and only the parent is left to name.
  { entityType: 'file', type: 'uploaded' },
  ...['area', 'ascent', 'block', 'route'].map(
    (entityType) => ({ columnName: 'file', entityType, type: 'deleted' }) as Partial<ActivityListItem>,
  ),
  { columnName: 'first ascensionist', entityType: 'user' },
  { columnName: 'invitation', entityType: 'user', type: 'created' },
  { columnName: 'invitation', entityType: 'user' },
  { columnName: 'invitation', entityType: 'user', type: 'deleted' },
  { columnName: 'role', entityType: 'user' },
  { columnName: 'role', entityType: 'user', type: 'deleted' },
  { columnName: 'username', entityType: 'user' },
]
